import prisma from '../../lib/prisma.js';
import { syncSubscriptionAndTenant } from './subscriptionService.js';
import { cancelSubscription as cancelPaddleSubscription, removeScheduledChange, updateSubscriptionItems } from '../../lib/paddle.js';
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
export async function changePlan(tenantId: string, plan: PlanTier): Promise<SelfServeResult> {
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

  if (subscription.provider === 'paddle') {
    await updateSubscriptionItems(subscription.externalSubscriptionId, {
      description: `Northstack — ${plan}`,
      amountCents: planPrice.launchPriceCents,
      currencyCode: subscription.currency,
    });
  } else {
    await updatePreapproval(subscription.externalSubscriptionId, {
      transactionAmount: planPrice.launchPriceCents / 100,
    });
  }

  // The provider's API response is itself the confirmation that the change was accepted — safe
  // to reflect locally now (confirmed with Alejandro rather than assumed). Still takes effect at
  // currentPeriodEnd on the provider's side (no proration), so the UI reads that existing field
  // as "applies from", not "now" — no new schema field needed for a "scheduled" plan.
  await syncSubscriptionAndTenant({ tenantId, plan, lockedPriceCents: planPrice.launchPriceCents });

  return { success: true };
}

// POST /api/subscriptions/me/cancel (Unidad 14). Tenant.status only flips to 'cancelled' once
// cancellationEffectiveAt is actually reached — Paddle's own subscription.canceled webhook, or
// the Mercado Pago cron sweep (planTransitionService.ts) — never here, at request time.
export async function requestCancellation(tenantId: string, reason: string | undefined): Promise<SelfServeResult> {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription || !subscription.provider || !subscription.externalSubscriptionId || !subscription.currentPeriodEnd) {
    return { success: false, error: 'No active paid subscription to cancel.' };
  }
  if (subscription.cancelledAt) {
    return { success: false, error: 'Cancellation is already scheduled.' };
  }

  if (subscription.provider === 'paddle') {
    // Paddle supports native scheduled cancellation — one call, takes effect at
    // next_billing_period on Paddle's own side too, not just locally.
    await cancelPaddleSubscription(subscription.externalSubscriptionId, 'next_billing_period');
  }
  // Mercado Pago: no provider call here — no "cancel at period end" concept in its API. The cron
  // sweep (planTransitionService.ts) makes the real call once cancellationEffectiveAt arrives.

  await syncSubscriptionAndTenant({
    tenantId,
    cancelledAt: new Date(),
    cancellationEffectiveAt: subscription.currentPeriodEnd,
    cancellationReason: reason ?? null,
  });

  return { success: true };
}

// POST /api/subscriptions/me/resume (Unidad 15).
export async function resumeSubscription(tenantId: string): Promise<SelfServeResult> {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription || !subscription.cancelledAt || !subscription.cancellationEffectiveAt) {
    return { success: false, error: 'No pending cancellation to resume.' };
  }
  if (subscription.cancellationEffectiveAt <= new Date()) {
    return { success: false, error: 'This cancellation has already taken effect.' };
  }

  // See removeScheduledChange's comment in paddle.ts — Mercado Pago genuinely never got a
  // provider call at cancel time, nothing to undo there, but Paddle did.
  if (subscription.provider === 'paddle' && subscription.externalSubscriptionId) {
    await removeScheduledChange(subscription.externalSubscriptionId);
  }

  await syncSubscriptionAndTenant({
    tenantId,
    cancelledAt: null,
    cancellationEffectiveAt: null,
    cancellationReason: null,
  });

  return { success: true };
}
