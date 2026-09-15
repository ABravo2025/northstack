import { createAsyncRouter } from '../lib/asyncRouter.js';
import prisma from '../lib/prisma.js';
import { getAuthorizedPayment, getPreapproval, verifyMercadoPagoSignature } from '../lib/mercadopago.js';
import { getNextBillingDate, unwrapDodoWebhookEvent } from '../lib/dodopayments.js';
import { GRACE_PERIOD_DAYS } from '../modules/tenant/planTransitionService.js';
import { syncSubscriptionAndTenant } from '../modules/tenant/subscriptionService.js';
import { syncSeatBilling, countActiveSeats, extraSeatsFor, EXTRA_SEAT_PRICE_CENTS } from '../modules/tenant/seatService.js';
import { CURRENT_PLAN_PRICES_CENTS } from '../modules/tenant/planService.js';
import { bestEffort } from '../lib/bestEffort.js';
import type { PaymentProvider } from '@prisma/client';
import type express from 'express';

export const webhooksRouter = createAsyncRouter();

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// Populated by the express.raw() middleware app.ts scopes to these two paths, mounted before the
// global express.json() — req.body is a Buffer here, never the parsed object every other route
// gets. Both providers require the signature check to run against these exact raw bytes.
function rawBodyText(req: express.Request): string {
  return Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
}

// spec's webhook contract, common to both providers: verify signature -> check
// ProcessedWebhookEvent (insert-then-process, @@unique cuts duplicates even under concurrency) ->
// apply the transition via syncSubscriptionAndTenant. Returns false when this exact event was
// already processed (a P2002 unique violation on insert), true when this call is the one that
// gets to process it.
async function recordProcessedEvent(provider: PaymentProvider, externalEventId: string): Promise<boolean> {
  try {
    await prisma.processedWebhookEvent.create({ data: { provider, externalEventId } });
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return false;
    }
    throw error;
  }
}

// Undoes recordProcessedEvent's insert when the processing that follows it throws (found live,
// 2026-08-21: Mercado Pago's "Simular notificación" sent a data.id with no matching preapproval,
// which 404'd inside the handler — the event was already marked processed by then). Without this,
// a real transient failure (the provider's API briefly down, a bug) leaves the event permanently
// "already processed" — the provider's own retry finds nothing to do and gives up, silently
// losing the event instead of ever applying it once whatever broke is fixed.
async function rollbackProcessedEvent(provider: PaymentProvider, externalEventId: string): Promise<void> {
  await prisma.processedWebhookEvent
    .delete({ where: { provider_externalEventId: { provider, externalEventId } } })
    .catch(() => {});
}

webhooksRouter.post('/api/webhooks/mercadopago', async (req, res) => {
  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];
  const dataId = (req.query['data.id'] as string | undefined) ?? (req.query.id as string | undefined);

  if (typeof xSignature !== 'string' || typeof xRequestId !== 'string' || !dataId) {
    return res.status(400).json({ error: 'Missing signature headers or data.id' });
  }

  if (!verifyMercadoPagoSignature({ xSignature, xRequestId, dataId })) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // UNVERIFIED against a real Mercado Pago sandbox (no MP_ACCESS_TOKEN/MP_WEBHOOK_SECRET
  // configured yet) — confirm the exact `type` string values below (subscription_preapproval vs.
  // subscription_authorized_payment, or similar) against a real webhook delivery before go-live.
  const body = JSON.parse(rawBodyText(req) || '{}');
  const eventType = String(body.type ?? body.topic ?? '');
  const externalEventId = `${eventType}:${dataId}`;

  const isNew = await recordProcessedEvent('mercadopago', externalEventId);
  if (!isNew) {
    return res.status(200).json({ status: 'already processed' });
  }

  try {
    if (eventType.includes('authorized_payment')) {
      const payment = await getAuthorizedPayment(dataId);
      const subscription = await prisma.subscription.findFirst({ where: { externalSubscriptionId: payment.preapproval_id } });
      if (!subscription) {
        return res.status(200).json({ status: 'no matching subscription' });
      }

      if (payment.status === 'approved') {
        const periodStart = new Date();
        const periodEnd = new Date(periodStart.getTime() + ONE_MONTH_MS);
        // Re-read fresh status right before writing (spec's "race cron vs. webhook: el webhook
        // manda siempre") — irrelevant to *this* transition specifically since only the webhook
        // ever moves a subscription into `active`, but kept consistent with every other handler
        // below rather than special-cased away.
        await syncSubscriptionAndTenant({
          tenantId: subscription.tenantId,
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          // UNVERIFIED field names (see MercadoPagoAuthorizedPayment's comment in mercadopago.ts).
          ...(payment.payment_method_id ? { paymentMethodBrand: payment.payment_method_id } : {}),
          ...(payment.card?.last_four_digits ? { paymentMethodLast4: payment.card.last_four_digits } : {}),
        });
        // Same "first point seat overage is allowed to bill" reconciliation as the Dodo branch
        // below — MP's own seat surcharge only ever affects the NEXT recurring transaction_amount
        // (no mid-cycle proration), so this mostly matters once real ARS pricing replaces today's
        // $0 placeholder, but the trialing-guard in syncSeatBilling applies the same way regardless
        // of provider.
        await bestEffort(syncSeatBilling(subscription.tenantId), `syncSeatBilling(${subscription.tenantId})`);
        await prisma.invoice.create({
          data: {
            subscriptionId: subscription.id,
            provider: 'mercadopago',
            externalInvoiceId: String(payment.id),
            amountCents: Math.round(payment.transaction_amount * 100),
            currency: subscription.currency,
            status: 'paid',
            periodStart,
            periodEnd,
            paidAt: new Date(),
          },
        });
      } else if (payment.status === 'rejected') {
        await syncSubscriptionAndTenant({
          tenantId: subscription.tenantId,
          status: 'past_due',
          gracePeriodEndsAt: new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
        });
      }

      return res.status(200).json({ status: 'ok' });
    }

    // preapproval-type event — external_reference is our own Subscription.id (set at creation in
    // checkoutService.ts), the reliable join key per the spec ("no confiar solo en
    // externalSubscriptionId", which isn't even set yet on the very first confirmation webhook).
    const preapproval = await getPreapproval(dataId);
    if (!preapproval.external_reference) {
      return res.status(200).json({ status: 'no external_reference on preapproval' });
    }

    const subscription = await prisma.subscription.findUnique({ where: { id: preapproval.external_reference } });
    if (!subscription) {
      return res.status(200).json({ status: 'no matching subscription' });
    }

    if (preapproval.status === 'authorized') {
      await syncSubscriptionAndTenant({
        tenantId: subscription.tenantId,
        status: 'active',
        provider: 'mercadopago',
        externalSubscriptionId: preapproval.id,
        currentPeriodStart: new Date(),
        // Without this, Subscription.currency/lockedPriceCents stay at their USD placeholder
        // (set at signup) forever for an AR tenant actually billed in ARS — every invoice this
        // subscription generates afterward inherits that wrong currency label.
        ...(preapproval.auto_recurring
          ? {
              currency: preapproval.auto_recurring.currency_id,
              lockedPriceCents: Math.round(preapproval.auto_recurring.transaction_amount * 100),
            }
          : {}),
      });
    } else if (preapproval.status === 'cancelled') {
      await syncSubscriptionAndTenant({ tenantId: subscription.tenantId, status: 'cancelled' });
    } else if (preapproval.status === 'paused') {
      await syncSubscriptionAndTenant({
        tenantId: subscription.tenantId,
        status: 'past_due',
        gracePeriodEndsAt: new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
      });
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    await rollbackProcessedEvent('mercadopago', externalEventId);
    throw error;
  }
});

webhooksRouter.post('/api/webhooks/dodopayments', async (req, res) => {
  const rawBody = rawBodyText(req);
  let event;
  try {
    event = unwrapDodoWebhookEvent(rawBody, req.headers as Record<string, string | string[] | undefined>);
  } catch {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Standard Webhooks' own idempotency key (Dodo implements this spec) — one id per delivery
  // attempt, distinct from any id inside the body. Same insert-then-process contract as Paddle/
  // Mercado Pago above, just keyed off this header instead of a body field.
  const externalEventId = req.headers['webhook-id'];
  if (typeof externalEventId !== 'string') {
    return res.status(400).json({ error: 'Missing webhook-id header' });
  }

  const isNew = await recordProcessedEvent('dodopayments', externalEventId);
  if (!isNew) {
    return res.status(200).json({ status: 'already processed' });
  }

  try {
    // Every other Dodo event type (disputes, payouts, license keys, credits, ...) is irrelevant to
    // subscription billing — narrowing here (rather than after reading .data.metadata) is also
    // what lets TypeScript know `event.data` has a `metadata` field at all, since the full
    // UnwrapWebhookEvent union includes payloads that don't.
    if (event.type !== 'payment.succeeded' && event.type !== 'payment.failed' && event.type !== 'subscription.active' && event.type !== 'subscription.cancelled') {
      return res.status(200).json({ status: 'ignored event type' });
    }

    // metadata.subscriptionId set at checkout (checkoutService.ts) — same join-key role as
    // Mercado Pago's external_reference above. Dodo propagates checkout-session metadata onto
    // both the resulting Subscription and Payment resources, so every event type handled here
    // carries it.
    const subscriptionId = event.data.metadata?.subscriptionId;
    if (!subscriptionId) {
      return res.status(200).json({ status: 'no subscriptionId in metadata' });
    }

    const subscription = await prisma.subscription.findUnique({ where: { id: String(subscriptionId) } });
    if (!subscription) {
      return res.status(200).json({ status: 'no matching subscription' });
    }

    if (event.type === 'payment.succeeded') {
      const payment = event.data;
      const paymentMethodFields =
        payment.card_network || payment.card_last_four
          ? { paymentMethodBrand: payment.card_network ?? undefined, paymentMethodLast4: payment.card_last_four ?? undefined }
          : {};

      // getUpdatePaymentMethodTransaction's Paddle role, now Dodo's Customer Portal — that flow
      // creates a Payment flagged is_update_payment_method, never a real period charge. A trial's
      // own $0 mandate-authorization charge (total_amount === 0) gets the same treatment: skip the
      // period bump and Invoice, still record the new card. UNVERIFIED against a real Dodo sandbox
      // delivery yet (no live credentials at the time this was written) — confirm both branches
      // before go-live, same caveat this codebase already carries for Mercado Pago's field names.
      if (payment.is_update_payment_method || payment.total_amount === 0) {
        if (Object.keys(paymentMethodFields).length > 0) {
          await syncSubscriptionAndTenant({ tenantId: subscription.tenantId, ...paymentMethodFields });
        }
        return res.status(200).json({ status: 'ok' });
      }

      const periodStart = new Date();
      const periodEnd = payment.subscription_id ? await getNextBillingDate(payment.subscription_id) : new Date(periodStart.getTime() + ONE_MONTH_MS);

      // checkoutService.ts's metadata.plan (2026-09-15, QA-88) — the plan a first-time
      // subscribe was FOR, deliberately never written to Tenant.plan/Subscription.plan until
      // this exact moment (real payment confirmed), rather than upfront when checkout started.
      // Falls back to leaving plan/lockedPriceCents untouched (existing subscription.plan) for
      // any checkout already in flight when this shipped, or an "update payment method" session
      // (checkoutService.ts never sets metadata.plan for those — same plan as before).
      const metadataPlan = event.data.metadata?.plan;
      const isNewPlanChoice = metadataPlan === 'starter' || metadataPlan === 'growth';
      const confirmedPlan = isNewPlanChoice ? metadataPlan : (subscription.plan as 'starter' | 'growth');
      const lockedPriceCents = isNewPlanChoice ? CURRENT_PLAN_PRICES_CENTS[metadataPlan] : subscription.lockedPriceCents;

      await syncSubscriptionAndTenant({
        tenantId: subscription.tenantId,
        status: 'active',
        provider: 'dodopayments',
        externalSubscriptionId: payment.subscription_id ?? subscription.externalSubscriptionId ?? '',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        ...(isNewPlanChoice ? { plan: confirmedPlan, lockedPriceCents } : {}),
        ...paymentMethodFields,
      });

      // First point seat overage is actually allowed to bill anything (seatService.ts's own
      // comment on syncSeatBilling explains why it no-ops while still 'trialing') — true it up to
      // whatever the tenant's real seat count is now that the base plan itself just started
      // billing for real.
      await bestEffort(syncSeatBilling(subscription.tenantId), `syncSeatBilling(${subscription.tenantId})`);

      // Breakdown (2026-09-15, QA-88) computed fresh rather than trusted from Dodo's payment
      // payload — same "our own authoritative price" reasoning as amountCents below, extended to
      // the seat surcharge: extraSeats is live-derived from actual active User rows, not
      // whatever addon quantity Dodo billed (which syncSeatBilling above may not have finished
      // reconciling to yet on a slow request — this stays internally consistent with itself
      // either way, since amountCents = baseAmountCents + extraSeatsAmountCents always).
      const activeSeats = await countActiveSeats(subscription.tenantId);
      const extraSeats = extraSeatsFor(confirmedPlan, activeSeats);
      const extraSeatsAmountCents = extraSeats * EXTRA_SEAT_PRICE_CENTS;
      const baseAmountCents = lockedPriceCents;

      // Trusts our own authoritative price (subscription.lockedPriceCents/currency) rather than
      // payment.total_amount, which includes tax — same reasoning paddle.ts's equivalent used.
      await prisma.invoice.create({
        data: {
          subscriptionId: subscription.id,
          provider: 'dodopayments',
          externalInvoiceId: payment.payment_id,
          amountCents: baseAmountCents + extraSeatsAmountCents,
          baseAmountCents,
          extraSeatsAmountCents,
          currency: subscription.currency,
          status: 'paid',
          periodStart,
          periodEnd,
          paidAt: new Date(),
        },
      });
    } else if (event.type === 'payment.failed') {
      await syncSubscriptionAndTenant({
        tenantId: subscription.tenantId,
        status: 'past_due',
        gracePeriodEndsAt: new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
      });
    } else if (event.type === 'subscription.cancelled') {
      await syncSubscriptionAndTenant({ tenantId: subscription.tenantId, status: 'cancelled' });
    } else if (event.type === 'subscription.active') {
      // Fires once the checkout's mandate is authorized — for a trial_period_days checkout
      // (Alejandro's 2026-08-20 "genuinely free for N days" correction, same rule as Paddle had),
      // this can fire with no real charge yet. Deliberately does NOT touch `status` (stays
      // 'trialing', our own internal trial clock is still authoritative) or currentPeriodStart/End
      // — only `payment.succeeded` above does that, once a real (non-$0, non-update-payment-method)
      // charge actually lands. planTransitionService.ts's cron already skips any tenant whose
      // Subscription.provider is set, so this trialing-with-a-provider tenant isn't incorrectly
      // bumped to past_due by our own grace-period logic while Dodo handles the real transition.
      await syncSubscriptionAndTenant({
        tenantId: subscription.tenantId,
        provider: 'dodopayments',
        externalSubscriptionId: event.data.subscription_id ?? subscription.externalSubscriptionId ?? '',
      });
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    await rollbackProcessedEvent('dodopayments', externalEventId);
    throw error;
  }
});

