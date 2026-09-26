import prisma from '../../lib/prisma.js';
import { getPreapproval, parseExternalReference, updatePreapproval, type MercadoPagoPreapproval } from '../../lib/mercadopago.js';
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

  const { subscriptionId, plan: checkoutPlan } = parseExternalReference(preapproval.external_reference);
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
    const isFirstSubscribe = subscription.provider === null;
    const hasTrial = Boolean(preapproval.auto_recurring?.free_trial);

    // Plan is only confirmed here, on a first subscribe (checkoutService.ts no longer writes it at
    // checkout). Priced from the same latest PlanPrice row the checkout used — lockedPriceCents is
    // the base plan price, seat surcharge excluded, same as changePlan and the Dodo webhook.
    let planFields: { plan: 'starter' | 'growth'; lockedPriceCents: number } | null = null;
    if (isFirstSubscribe && checkoutPlan) {
      const planPrice = await prisma.planPrice.findFirst({
        where: { plan: checkoutPlan, market: 'ar' },
        orderBy: { effectiveFrom: 'desc' },
      });
      planFields = { plan: checkoutPlan, lockedPriceCents: planPrice?.launchPriceCents ?? 0 };
    }

    await syncSubscriptionAndTenant({
      tenantId: subscription.tenantId,
      provider: 'mercadopago',
      externalSubscriptionId: preapproval.id,
      // Without this, Subscription.currency stays at its USD placeholder (set at signup) for an AR
      // tenant actually billed in ARS — every invoice would inherit the wrong currency label.
      ...(preapproval.auto_recurring ? { currency: preapproval.auto_recurring.currency_id } : {}),
      ...(planFields ?? {}),
      ...(hasTrial ? {} : { status: 'active' as const, currentPeriodStart: new Date() }),
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
