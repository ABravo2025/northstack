import prisma from '../../lib/prisma.js';
import { recordSubscriptionActionAttempt, syncSubscriptionAndTenant } from './subscriptionService.js';
import { cancelSubscription as cancelDodoSubscription, cancelScheduledPlanChange, removeScheduledCancellation, changeSubscriptionPlan } from '../../lib/dodopayments.js';
import { buildExternalReference, createPreapproval, updatePreapproval } from '../../lib/mercadopago.js';
import { billingReturnUrl } from './checkoutService.js';
import { countActiveSeats, extraSeatsFor } from './seatService.js';
import { currentPlanPrice, lockedPlanPrice, marketForProvider, mercadoPagoAmount } from './planPriceService.js';
import { CURRENT_PLAN_PRICES_CENTS } from './planService.js';
import { recordActivity } from '../activity/activityLogService.js';
import { tenantActivityFieldConfig } from '../activity/fieldConfigs/tenantFieldConfig.js';
import type { PlanTier } from '@prisma/client';

export interface SelfServeResult {
  success: boolean;
  error?: string;
}

export interface ChangePlanResult extends SelfServeResult {
  // 'changed' — applied now (trial); 'charging' — upgrade charge started, the plan switches when
  // the provider confirms it (Mercado Pago: the payer confirms at `initPoint` first); 'scheduled' —
  // downgrade applies on `effectiveAt`; 'schedule_cancelled' — a scheduled downgrade was dropped.
  outcome?: 'changed' | 'charging' | 'scheduled' | 'schedule_cancelled';
  initPoint?: string;
  effectiveAt?: Date | null;
}

const PLAN_RANK: Record<'starter' | 'growth', number> = { starter: 1, growth: 2 };

// POST /api/subscriptions/me/change-plan — only for a subscription with a real provider attached;
// a Free Trial tenant without one goes through checkout instead. Policy (Alejandro, 2026-09-30):
//   - during the trial: switch now, nothing charged;
//   - upgrade: charge the new plan's full price today and restart the billing cycle today, no credit
//     for the unused old period; the plan only switches once that charge is confirmed. Dodo charges
//     the card on file; Mercado Pago can't charge off-schedule or move a preapproval's billing date,
//     so it's a new Growth preapproval the payer confirms (the old one is cancelled once it's
//     authorized — mercadoPagoWebhookService.ts);
//   - downgrade: keep the current plan until the end of the period already paid, the new plan and
//     price apply from the next charge (Subscription.pendingPlanPriceId until then);
//   - choosing the current plan again while a downgrade is scheduled cancels it.
export async function changePlan(
  tenantId: string,
  plan: PlanTier,
  user: { id: string; email: string },
): Promise<ChangePlanResult> {
  if (plan !== 'starter' && plan !== 'growth') {
    return { success: false, error: 'This plan is not available for self-service selection yet.' };
  }

  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription || !subscription.provider || !subscription.externalSubscriptionId) {
    return { success: false, error: 'No active paid subscription to change. Add a payment method first.' };
  }
  const externalId = subscription.externalSubscriptionId;
  const market = marketForProvider(subscription.provider, null);
  const currentPlan = subscription.plan as 'starter' | 'growth';
  const activeSeats = await countActiveSeats(tenantId);

  if (plan === currentPlan) {
    if (!subscription.pendingPlanPriceId) {
      return { success: false, error: 'You are already on this plan.' };
    }
    if (subscription.provider === 'dodopayments') {
      await cancelScheduledPlanChange(externalId);
    } else {
      // The amount was already lowered for the next charge — put the current plan's back.
      const locked = await lockedPlanPrice({ ...subscription, plan: currentPlan }, market);
      if (!locked) {
        return { success: false, error: 'Pricing for this plan is not available yet.' };
      }
      await updatePreapproval(externalId, { transactionAmount: mercadoPagoAmount(locked, extraSeatsFor(currentPlan, activeSeats)) });
    }
    await syncSubscriptionAndTenant({ tenantId, pendingPlanPriceId: null, changedByUserId: user.id });
    return { success: true, outcome: 'schedule_cancelled' };
  }

  // A plan change moves the subscriber onto current pricing (src/config/pricing.ts) for both the
  // new plan and its seat price — they're choosing a new product, so grandfathering ends here.
  const planPrice = await currentPlanPrice(plan, market);
  if (!planPrice || (subscription.provider === 'dodopayments' && !planPrice.dodoProductId)) {
    return { success: false, error: 'Pricing for this plan is not available yet.' };
  }
  const extraSeats = extraSeatsFor(plan, activeSeats);

  if (subscription.status === 'trialing') {
    if (subscription.provider === 'dodopayments') {
      await changeSubscriptionPlan(externalId, {
        productId: planPrice.dodoProductId!,
        extraSeatAddonId: planPrice.dodoExtraSeatAddonId,
        extraSeats,
        mode: 'now_no_charge',
      });
    } else {
      await updatePreapproval(externalId, { transactionAmount: mercadoPagoAmount(planPrice, extraSeats) });
    }
    await syncSubscriptionAndTenant({
      tenantId,
      plan,
      lockedPriceCents: planPrice.launchPriceCents,
      planPriceId: planPrice.id,
      pendingPlanPriceId: null,
      changedByUserId: user.id,
    });
    return { success: true, outcome: 'changed' };
  }

  if (subscription.status !== 'active') {
    return { success: false, error: 'Plan changes are available once your subscription is up to date. Update your payment method first.' };
  }

  if (PLAN_RANK[plan] > PLAN_RANK[currentPlan]) {
    // Attribution for the webhook that applies it (see subscriptionService.ts).
    await recordSubscriptionActionAttempt(tenantId, user.id);
    if (subscription.provider === 'dodopayments') {
      await changeSubscriptionPlan(externalId, {
        productId: planPrice.dodoProductId!,
        extraSeatAddonId: planPrice.dodoExtraSeatAddonId,
        extraSeats,
        mode: 'upgrade_now',
        // Read back by routes/webhooks.ts's payment.succeeded / payment.failed.
        metadata: { subscriptionId: subscription.id, planPriceId: planPrice.id, planChange: 'upgrade' },
      });
      return { success: true, outcome: 'charging' };
    }
    const preapproval = await createPreapproval({
      externalReference: buildExternalReference(subscription.id, planPrice.id),
      reason: `Northstack — ${plan} (AR)`,
      payerEmail: user.email,
      transactionAmount: mercadoPagoAmount(planPrice, extraSeats),
      backUrl: billingReturnUrl(),
    });
    return { success: true, outcome: 'charging', initPoint: preapproval.init_point };
  }

  // Downgrade — scheduled for the next charge.
  if (subscription.provider === 'dodopayments') {
    await changeSubscriptionPlan(externalId, {
      productId: planPrice.dodoProductId!,
      extraSeatAddonId: planPrice.dodoExtraSeatAddonId,
      extraSeats,
      mode: 'at_next_billing',
    });
  } else {
    await updatePreapproval(externalId, { transactionAmount: mercadoPagoAmount(planPrice, extraSeats) });
  }
  await syncSubscriptionAndTenant({ tenantId, pendingPlanPriceId: planPrice.id, changedByUserId: user.id });
  return { success: true, outcome: 'scheduled', effectiveAt: subscription.currentPeriodEnd };
}

// POST /api/subscriptions/me/cancel (Unidad 14). Tenant.status only flips to 'cancelled' once
// cancellationEffectiveAt is actually reached — Dodo's own subscription.cancelled webhook, or
// the Mercado Pago cron sweep (planTransitionService.ts) — never here, at request time.
export async function requestCancellation(tenantId: string, reason: string | undefined, userId: string): Promise<SelfServeResult> {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription || !subscription.provider || !subscription.externalSubscriptionId || !subscription.currentPeriodEnd) {
    return { success: false, error: 'No active paid subscription to cancel.' };
  }
  if (subscription.cancelledAt) {
    return { success: false, error: 'Cancellation is already scheduled.' };
  }

  if (subscription.provider === 'dodopayments') {
    // Dodo supports native scheduled cancellation — one call, takes effect at the subscription's
    // own next_billing_date on Dodo's side too, not just locally.
    await cancelDodoSubscription(subscription.externalSubscriptionId);
  }
  // Mercado Pago: no provider call here — no "cancel at period end" concept in its API. The cron
  // sweep (planTransitionService.ts) makes the real call once cancellationEffectiveAt arrives.

  await syncSubscriptionAndTenant({
    tenantId,
    cancelledAt: new Date(),
    cancellationEffectiveAt: subscription.currentPeriodEnd,
    cancellationReason: reason ?? null,
    changedByUserId: userId,
  });

  return { success: true };
}

// POST /api/subscriptions/me/resume (Unidad 15).
export async function resumeSubscription(tenantId: string, userId: string): Promise<SelfServeResult> {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription || !subscription.cancelledAt || !subscription.cancellationEffectiveAt) {
    return { success: false, error: 'No pending cancellation to resume.' };
  }
  if (subscription.cancellationEffectiveAt <= new Date()) {
    return { success: false, error: 'This cancellation has already taken effect.' };
  }

  // See removeScheduledCancellation's comment in dodopayments.ts — Mercado Pago genuinely never
  // got a provider call at cancel time, nothing to undo there, but Dodo did.
  if (subscription.provider === 'dodopayments' && subscription.externalSubscriptionId) {
    await removeScheduledCancellation(subscription.externalSubscriptionId);
  }

  await syncSubscriptionAndTenant({
    tenantId,
    cancelledAt: null,
    cancellationEffectiveAt: null,
    cancellationReason: null,
    changedByUserId: userId,
  });

  return { success: true };
}

// POST /api/subscriptions/me/clear-plan (2026-09-15, QA-89 — Alejandro found he had no way back
// to Free Trial after picking a plan on Mercado Pago before its preapproval webhook ever
// confirmed: checkoutService.ts's MP branch writes Tenant.plan/Subscription.plan immediately
// (no metadata channel to defer it to a webhook the way Dodo's checkout does — see its own
// comment), so a tenant can end up with a plan "chosen" but no real subscription.provider to
// show a Cancel subscription button for, or to actually cancel). Deliberately NOT the same as
// requestCancellation above: there's nothing real on a provider's side to cancel here — this
// just undoes the local choice, same shape as never having picked a plan at all. Rejects outright
// once `provider` is set — a real, confirmed subscription can only ever be ended via
// requestCancellation, never silently wiped by this.
export async function clearUnconfirmedPlan(tenantId: string, userId: string): Promise<SelfServeResult> {
  const [subscription, tenant] = await Promise.all([
    prisma.subscription.findUnique({ where: { tenantId } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } }),
  ]);
  if (!subscription || !tenant) {
    return { success: false, error: 'No subscription found for this tenant' };
  }
  if (subscription.provider) {
    return { success: false, error: 'You already have an active subscription — use Cancel subscription instead.' };
  }
  if (tenant.plan === null) {
    return { success: false, error: 'No plan chosen yet.' };
  }

  const before = { plan: tenant.plan };
  await prisma.$transaction([
    prisma.tenant.update({ where: { id: tenantId }, data: { plan: null, lockedPriceCents: null, lockedPriceSetAt: null } }),
    // Back to the same 'starter'/USD placeholder registerTenantWithOwner sets at signup — never
    // null, Subscription.plan isn't nullable (see schema.prisma's comment on the model).
    prisma.subscription.update({
      where: { tenantId },
      data: { plan: 'starter', lockedPriceCents: CURRENT_PLAN_PRICES_CENTS.starter, currency: 'USD' },
    }),
  ]);

  await recordActivity({
    tenantId,
    entityType: 'tenant',
    entityId: tenantId,
    entityLabel: 'Plan selection',
    action: 'update',
    changedByUserId: userId,
    before,
    after: { plan: null },
    fieldConfig: tenantActivityFieldConfig,
  });

  return { success: true };
}
