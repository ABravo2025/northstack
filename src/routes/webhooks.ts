import { createAsyncRouter } from '../lib/asyncRouter.js';
import prisma from '../lib/prisma.js';
import { getAuthorizedPayment, getPreapproval, verifyMercadoPagoSignature } from '../lib/mercadopago.js';
import { getTransaction, verifyPaddleSignature } from '../lib/paddle.js';
import { GRACE_PERIOD_DAYS } from '../modules/tenant/planTransitionService.js';
import { syncSubscriptionAndTenant } from '../modules/tenant/subscriptionService.js';
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

webhooksRouter.post('/api/webhooks/paddle', async (req, res) => {
  const signatureHeader = req.headers['paddle-signature'];
  if (typeof signatureHeader !== 'string') {
    return res.status(400).json({ error: 'Missing Paddle-Signature header' });
  }

  const rawBody = rawBodyText(req);
  if (!verifyPaddleSignature({ signatureHeader, rawBody })) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(rawBody || '{}');
  const externalEventId = String(event.event_id ?? event.notification_id ?? '');
  if (!externalEventId) {
    return res.status(400).json({ error: 'Missing event id' });
  }

  const isNew = await recordProcessedEvent('paddle', externalEventId);
  if (!isNew) {
    return res.status(200).json({ status: 'already processed' });
  }

  try {
    const eventType = String(event.event_type ?? '');
    const data = event.data ?? {};
    // custom_data.subscriptionId set at creation (createNonCatalogTransaction, checkoutService.ts)
    // — same join-key role as Mercado Pago's external_reference above.
    const subscriptionId = data.custom_data?.subscriptionId;

    if (!subscriptionId) {
      // Not every Paddle event carries our custom_data (e.g. a catalog event unrelated to any
      // subscription) — acknowledge without acting, same as the "no matching subscription"
      // branches above.
      return res.status(200).json({ status: 'no subscriptionId in custom_data' });
    }

    const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!subscription) {
      return res.status(200).json({ status: 'no matching subscription' });
    }

    if (eventType === 'transaction.completed') {
      // Security round-trip, same principle already applied to Mercado Pago ("never trust the
      // webhook body directly") — and specifically needed here because a real test (2026-08-19)
      // showed the webhook payload's own `payments` array can still be empty/incomplete at the
      // exact moment transaction.completed fires, while GET /transactions/{id} already has the
      // full card details by the time this handler runs.
      const transaction = await getTransaction(String(data.id ?? ''));
      const card = transaction.payments[0]?.method_details?.card;
      const paymentMethodFields = card
        ? { paymentMethodBrand: card.type, paymentMethodLast4: card.last4 }
        : {};

      // An "update payment method" transaction (checkoutService.ts's getUpdatePaymentMethodTransaction
      // branch) completes as a $0/minimal validation charge, not a real period charge — Paddle's own
      // docs: "may be a zero value transaction." Detected via details.totals.total rather than a
      // dedicated `origin` value (exact field unconfirmed) — skip the period bump and Invoice for it,
      // still record the new card.
      const totalCents = Number(transaction.details.totals.total);
      const isPaymentMethodUpdateOnly = totalCents === 0;

      if (isPaymentMethodUpdateOnly) {
        if (Object.keys(paymentMethodFields).length > 0) {
          await syncSubscriptionAndTenant({ tenantId: subscription.tenantId, ...paymentMethodFields });
        }
        return res.status(200).json({ status: 'ok' });
      }

      const periodStart = new Date();
      // Approximation — Paddle's Subscription entity has a real current_billing_period.ends_at
      // field that would be more precise than a flat +30 days; not fetched here to keep this
      // handler to the one extra API call it already makes (the transaction round-trip above).
      // Revisit if a real deployment shows this drifting from what Paddle actually bills.
      const periodEnd = new Date(periodStart.getTime() + ONE_MONTH_MS);

      await syncSubscriptionAndTenant({
        tenantId: subscription.tenantId,
        status: 'active',
        provider: 'paddle',
        externalSubscriptionId: transaction.subscription_id ?? subscription.externalSubscriptionId ?? '',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        ...paymentMethodFields,
      });

      // Trusts our own authoritative price (subscription.lockedPriceCents/currency) rather than
      // parsing Paddle's transaction totals — we know exactly what we charged, and the exact shape
      // of Paddle's `details.totals` breakdown is unverified (see paddle.ts's caveat comments).
      await prisma.invoice.create({
        data: {
          subscriptionId: subscription.id,
          provider: 'paddle',
          externalInvoiceId: String(data.id ?? ''),
          amountCents: subscription.lockedPriceCents,
          currency: subscription.currency,
          status: 'paid',
          periodStart,
          periodEnd,
          paidAt: new Date(),
        },
      });
    } else if (eventType === 'transaction.payment_failed') {
      await syncSubscriptionAndTenant({
        tenantId: subscription.tenantId,
        status: 'past_due',
        gracePeriodEndsAt: new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
      });
    } else if (eventType === 'subscription.canceled') {
      await syncSubscriptionAndTenant({ tenantId: subscription.tenantId, status: 'cancelled' });
    } else if (eventType === 'subscription.created') {
      // Fires when checkout completes for a trial_period price (Alejandro's 2026-08-20 "genuinely
      // free for 15 days" correction) — card is attached, but no real charge has happened yet, so
      // deliberately does NOT touch `status` (stays 'trialing', our own internal trial clock is
      // still authoritative) or currentPeriodStart/End (no billing period has started). The real
      // `transaction.completed` handler above already fires separately for the trial's own $0
      // transaction (skipped there via isPaymentMethodUpdateOnly) and again, for real, once the
      // trial ends and Paddle actually charges — that's what flips status to 'active'.
      //
      // `data` here IS the subscription resource itself (not a transaction) — `data.id` is the
      // subscription's own Paddle id. planTransitionService.ts's cron is taught to skip any tenant
      // whose Subscription.provider is already set, so this trialing-with-a-provider tenant isn't
      // incorrectly bumped to past_due by our own internal grace-period logic while Paddle handles
      // the real transition natively.
      await syncSubscriptionAndTenant({
        tenantId: subscription.tenantId,
        provider: 'paddle',
        externalSubscriptionId: String(data.id ?? subscription.externalSubscriptionId ?? ''),
      });
    }

    return res.status(200).json({ status: 'ok' });
  } catch (error) {
    await rollbackProcessedEvent('paddle', externalEventId);
    throw error;
  }
});
