import prisma from '../../lib/prisma.js';
import { syncSubscriptionAndTenant } from './subscriptionService.js';
import { cancelSubscription as cancelDodoSubscription, removeScheduledCancellation, changeSubscriptionPlan } from '../../lib/dodopayments.js';
import { updatePreapproval } from '../../lib/mercadopago.js';
import { countActiveSeats, extraSeatsFor } from './seatService.js';
import { currentPlanPrice, marketForProvider, mercadoPagoAmount } from './planPriceService.js';
import { CURRENT_PLAN_PRICES_CENTS } from './planService.js';
import { recordActivity } from '../activity/activityLogService.js';
import { tenantActivityFieldConfig } from '../activity/fieldConfigs/tenantFieldConfig.js';
import type { PlanTier } from '@prisma/client';

export interface SelfServeResult {
  success: boolean;
  error?: string;
}

// POST /api/subscriptions/me/change-plan (task-breakdown Unidad 13) — only for a subscription
// that already has a real provider attached; a trialing tenant without one should keep using
// PATCH /api/tenants/me/plan (the pre-billing plan-selection flow). No proration in either
// provider (spec: "Sin prorrateo").
export async function changePlan(tenantId: string, plan: PlanTier, userId: string): Promise<SelfServeResult> {
  if (plan !== 'starter' && plan !== 'growth') {
    return { success: false, error: 'This plan is not available for self-service selection yet.' };
  }

  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription || !subscription.provider || !subscription.externalSubscriptionId) {
    return { success: false, error: 'No active paid subscription to change. Add a payment method first.' };
  }

  // A plan change moves the subscriber onto current pricing (src/config/pricing.ts) for both the
  // new plan and its seat price — they're choosing a new product, so grandfathering ends here.
  const planPrice = await currentPlanPrice(plan, marketForProvider(subscription.provider, null));
  if (!planPrice) {
    return { success: false, error: 'Pricing for this plan is not available yet.' };
  }

  if (subscription.provider === 'dodopayments') {
    if (!planPrice.dodoProductId) {
      return { success: false, error: 'Pricing for this plan is not available yet.' };
    }
    // Extra-seat quantity is carried over onto the new row's addon — see changeSubscriptionPlan's
    // own comment in dodopayments.ts.
    await changeSubscriptionPlan(subscription.externalSubscriptionId, {
      productId: planPrice.dodoProductId,
      extraSeatAddonId: planPrice.dodoExtraSeatAddonId,
    });
  } else {
    // Mercado Pago folds the seat surcharge into the single transaction_amount (no addon
    // primitive — seatService.ts) — a tier change must recompute it against the NEW plan's
    // included-seats threshold, or the surcharge silently reverts to whatever the old plan's
    // math produced.
    const activeSeats = await countActiveSeats(tenantId);
    const extraSeats = extraSeatsFor(plan, activeSeats);
    await updatePreapproval(subscription.externalSubscriptionId, {
      transactionAmount: mercadoPagoAmount(planPrice, extraSeats),
    });
  }

  // The provider's API response is itself the confirmation that the change was accepted — safe
  // to reflect locally now (confirmed with Alejandro rather than assumed). Still takes effect at
  // currentPeriodEnd on the provider's side (no proration), so the UI reads that existing field
  // as "applies from", not "now" — no new schema field needed for a "scheduled" plan.
  await syncSubscriptionAndTenant({
    tenantId,
    plan,
    lockedPriceCents: planPrice.launchPriceCents,
    planPriceId: planPrice.id,
    changedByUserId: userId,
  });

  return { success: true };
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
