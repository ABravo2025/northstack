import prisma from '../../lib/prisma.js';
import { syncSubscriptionAndTenant } from './subscriptionService.js';
import { cancelSubscription as cancelDodoSubscription, removeScheduledCancellation, changeSubscriptionPlan } from '../../lib/dodopayments.js';
import { updatePreapproval } from '../../lib/mercadopago.js';
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

  const market = subscription.provider === 'mercadopago' ? 'ar' : 'international';
  const planPrice = await prisma.planPrice.findFirst({
    where: { plan, market },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!planPrice || planPrice.launchPriceCents <= 0) {
    return { success: false, error: 'Pricing for this plan is not available yet.' };
  }

  if (subscription.provider === 'dodopayments') {
    if (!planPrice.dodoProductId) {
      return { success: false, error: 'Pricing for this plan is not available yet.' };
    }
    await changeSubscriptionPlan(subscription.externalSubscriptionId, { productId: planPrice.dodoProductId });
  } else {
    await updatePreapproval(subscription.externalSubscriptionId, {
      transactionAmount: planPrice.launchPriceCents / 100,
    });
  }

  // The provider's API response is itself the confirmation that the change was accepted — safe
  // to reflect locally now (confirmed with Alejandro rather than assumed). Still takes effect at
  // currentPeriodEnd on the provider's side (no proration), so the UI reads that existing field
  // as "applies from", not "now" — no new schema field needed for a "scheduled" plan.
  await syncSubscriptionAndTenant({ tenantId, plan, lockedPriceCents: planPrice.launchPriceCents, changedByUserId: userId });

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
