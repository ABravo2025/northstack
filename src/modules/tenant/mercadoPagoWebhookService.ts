import prisma from '../../lib/prisma.js';
import {
  getAuthorizedPayment,
  getPreapproval,
  parseExternalReference,
  updatePreapproval,
  type MercadoPagoAuthorizedPayment,
  type MercadoPagoPreapproval,
} from '../../lib/mercadopago.js';
import { bestEffort } from '../../lib/bestEffort.js';
import { syncSeatBilling } from './seatService.js';
import { syncSubscriptionAndTenant } from './subscriptionService.js';
import { GRACE_PERIOD_DAYS } from './planTransitionService.js';

// Mercado Pago `preapproval` webhook (routes/webhooks.ts verifies the signature, dedupes the event
// and round-trips to MP for the real resource before calling this). Returns a short status string
// for the webhook's 200 response.
//
// Extracted from the route 2026-09-26, together with three behavior fixes:
//   - Only the preapproval the Subscription currently points at can move its status. A superseded
//     one (replaced via "update payment method", checkoutService.ts) sends its own `cancelled`
//     webhook once we cancel it — before this guard that cancelled the whole subscription.
//   - A replacement preapproval cancels the one it supersedes only now, once it's authorized —
//     never at checkout time, where an abandoned checkout left the tenant with none at all.
//   - `authorized` with a free_trial means "card attached, trial running", not "paid": status is
//     left alone (stays `trialing`) and the first real charge — the authorized_payment `approved`
//     webhook — is what moves it to `active`. Same as Dodo's subscription.created handling; before
//     this an AR tenant jumped to "Active" the moment they entered a card.
export async function handleMercadoPagoPreapproval(preapproval: MercadoPagoPreapproval): Promise<string> {
  if (!preapproval.external_reference) {
    return 'no external_reference on preapproval';
  }

  const { subscriptionId, planPriceId } = parseExternalReference(preapproval.external_reference);
  const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) {
    return 'no matching subscription';
  }

  const isCurrent = subscription.externalSubscriptionId === preapproval.id;

  if (preapproval.status === 'authorized') {
    // Already the one on file: MP re-sends `authorized` whenever we PUT an amount change (seat
    // sync, plan change) — nothing to confirm again, and re-running the write below would reset
    // currentPeriodStart/status on every seat change.
    if (isCurrent) {
      return 'already current';
    }

    const supersededId = subscription.provider === 'mercadopago' ? subscription.externalSubscriptionId : null;
    const hasTrial = Boolean(preapproval.auto_recurring?.free_trial);

    // Plan and price are only confirmed here — on a first subscribe (checkoutService.ts writes
    // neither at checkout) and on an upgrade (changePlan creates a new preapproval priced from the
    // new plan's row): the exact PlanPrice row it was priced from, which also pins the subscription
    // to it. lockedPriceCents is the base plan price, seat surcharge excluded, same as changePlan
    // and the Dodo webhook. Any scheduled downgrade is superseded by this choice.
    const planPrice = planPriceId ? await prisma.planPrice.findUnique({ where: { id: planPriceId } }) : null;
    const planFields = planPrice
      ? { plan: planPrice.plan, lockedPriceCents: planPrice.launchPriceCents, planPriceId: planPrice.id, pendingPlanPriceId: null }
      : null;

    await syncSubscriptionAndTenant({
      tenantId: subscription.tenantId,
      provider: 'mercadopago',
      externalSubscriptionId: preapproval.id,
      // Without this, Subscription.currency stays at its USD placeholder (set at signup) for an AR
      // tenant actually billed in ARS — every invoice would inherit the wrong currency label.
      ...(preapproval.auto_recurring ? { currency: preapproval.auto_recurring.currency_id } : {}),
      ...(planFields ?? {}),
      // No trial: MP charges this preapproval right away, so the paid period starts now and runs to
      // its next charge (the authorized_payment webhook sets the same dates; this covers it arriving
      // first, when that charge can't yet tell the new preapproval is the current one).
      ...(hasTrial
        ? {}
        : {
            status: 'active' as const,
            currentPeriodStart: new Date(),
            ...(preapproval.next_payment_date ? { currentPeriodEnd: new Date(preapproval.next_payment_date) } : {}),
          }),
    });

    if (supersededId) {
      // After the switch above, so the superseded preapproval's own `cancelled` webhook already
      // finds it non-current and is ignored. Not rethrown: the new preapproval is on file either
      // way, and a retry of this event would short-circuit on `isCurrent` without reaching this
      // line — the log is the only trace, and an uncancelled old preapproval keeps charging.
      try {
        await updatePreapproval(supersededId, { status: 'cancelled' });
      } catch (err) {
        console.error(
          `Mercado Pago: failed to cancel superseded preapproval ${supersededId} (subscription ${subscription.id}) — cancel it manually in MP or it keeps charging`,
          err,
        );
      }
    }

    return 'ok';
  }

  if (!isCurrent) {
    return 'superseded preapproval, ignored';
  }

  if (preapproval.status === 'cancelled') {
    await syncSubscriptionAndTenant({ tenantId: subscription.tenantId, status: 'cancelled' });
  } else if (preapproval.status === 'paused') {
    await syncSubscriptionAndTenant({
      tenantId: subscription.tenantId,
      status: 'past_due',
      gracePeriodEndsAt: new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
    });
  }

  return 'ok';
}

export async function handleMercadoPagoPreapprovalEvent(preapprovalId: string): Promise<string> {
  return handleMercadoPagoPreapproval(await getPreapproval(preapprovalId));
}

const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// Mercado Pago `subscription_authorized_payment` webhook — a recurring charge (the first one
// included) on a preapproval. Moved here from routes/webhooks.ts 2026-09-30, when the first real
// charge in staging showed it had never worked: it checked the top-level `status` for "approved",
// but that field is the charge lifecycle ("processed"); the money result is `payment.status` (see
// MercadoPagoAuthorizedPayment). So no Invoice was ever created and currentPeriodEnd stayed empty.
export async function handleMercadoPagoAuthorizedPayment(payment: MercadoPagoAuthorizedPayment): Promise<string> {
  // external_reference (our Subscription.id) first: the first charge can land before the
  // preapproval's own `authorized` webhook has stored externalSubscriptionId (they arrive about a
  // second apart). preapproval_id is the fallback for preapprovals created before
  // external_reference carried the id.
  const subscriptionId = payment.external_reference ? parseExternalReference(payment.external_reference).subscriptionId : null;
  const subscription =
    (subscriptionId ? await prisma.subscription.findUnique({ where: { id: subscriptionId } }) : null) ??
    (await prisma.subscription.findFirst({ where: { externalSubscriptionId: payment.preapproval_id } }));
  if (!subscription) {
    return 'no matching subscription';
  }
  // A charge on a superseded preapproval (card swap, the old one is being cancelled) must not move
  // the subscription's status; its money is still recorded below if it went through.
  const isCurrent = !subscription.externalSubscriptionId || subscription.externalSubscriptionId === payment.preapproval_id;

  const result = payment.payment?.status;
  if (result === 'approved') {
    const alreadyRecorded = await prisma.invoice.findFirst({
      where: { provider: 'mercadopago', externalInvoiceId: String(payment.id) },
      select: { id: true },
    });
    if (alreadyRecorded) {
      return 'already recorded';
    }

    const periodStart = new Date();
    // MP's own next charge date is the real end of the period this charge paid for.
    const preapproval = await getPreapproval(payment.preapproval_id).catch(() => null);
    const periodEnd = preapproval?.next_payment_date
      ? new Date(preapproval.next_payment_date)
      : new Date(periodStart.getTime() + ONE_MONTH_MS);

    // A downgrade scheduled by changePlan applies with this charge — the first one billed at the
    // new amount.
    const pending =
      isCurrent && subscription.pendingPlanPriceId
        ? await prisma.planPrice.findUnique({ where: { id: subscription.pendingPlanPriceId } })
        : null;
    const lockedPriceCents = pending ? pending.launchPriceCents : subscription.lockedPriceCents;

    if (isCurrent) {
      await syncSubscriptionAndTenant({
        tenantId: subscription.tenantId,
        status: 'active',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        gracePeriodEndsAt: null,
        ...(payment.payment_method_id ? { paymentMethodBrand: payment.payment_method_id } : {}),
        ...(pending
          ? { plan: pending.plan, lockedPriceCents: pending.launchPriceCents, planPriceId: pending.id, pendingPlanPriceId: null }
          : {}),
      });
      await bestEffort(syncSeatBilling(subscription.tenantId), `syncSeatBilling(${subscription.tenantId})`);
    }

    // What MP actually charged, split into the locked base price and the rest (extra seats, the
    // only other thing folded into transaction_amount, see seatService.ts).
    const amountCents = Math.round(payment.transaction_amount * 100);
    const baseAmountCents = Math.min(lockedPriceCents, amountCents);
    await prisma.invoice.create({
      data: {
        subscriptionId: subscription.id,
        provider: 'mercadopago',
        externalInvoiceId: String(payment.id),
        amountCents,
        baseAmountCents,
        extraSeatsAmountCents: amountCents - baseAmountCents,
        currency: payment.currency_id ?? subscription.currency,
        status: 'paid',
        periodStart,
        periodEnd,
        paidAt: new Date(),
      },
    });
    return 'ok';
  }

  if (result === 'rejected' && isCurrent) {
    await syncSubscriptionAndTenant({
      tenantId: subscription.tenantId,
      status: 'past_due',
      gracePeriodEndsAt: new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
    });
    return 'ok';
  }

  // "scheduled" (not charged yet), a still-pending payment, or anything unrecognised: nothing to
  // record. MP sends another event for the same charge once it settles.
  return `ignored (status ${payment.status}, payment ${result ?? 'none'})`;
}

export async function handleMercadoPagoAuthorizedPaymentEvent(authorizedPaymentId: string): Promise<string> {
  return handleMercadoPagoAuthorizedPayment(await getAuthorizedPayment(authorizedPaymentId));
}
