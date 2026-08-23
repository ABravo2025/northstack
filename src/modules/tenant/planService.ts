import prisma from '../../lib/prisma.js';
import type { PlanTier, SubscriptionStatus, TenantStatus } from '@prisma/client';
import { TENANT_SUMMARY_SELECT, type TenantSummary } from './tenantSummary.js';

// Same value set on both enums by design (see schema.prisma) — kept as an explicit map rather
// than a cast, matching subscriptionService.ts's SUBSCRIPTION_TO_TENANT_STATUS convention.
const TENANT_TO_SUBSCRIPTION_STATUS: Record<TenantStatus, SubscriptionStatus> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  suspended: 'suspended',
  cancelled: 'cancelled',
};

// Server-side price list — never trust a price sent by the client (spec-subscription-plans.md).
// These are the "launch price" values; when it's time to raise to the regular price, edit the
// numbers here. Tenants who already picked a plan keep whatever they had locked into
// Tenant.lockedPriceCents at selection time — that's the whole point of freezing it, so a
// price-list change never silently affects an existing subscriber.
export const CURRENT_PLAN_PRICES_CENTS: Record<'starter' | 'growth', number> = {
  starter: 2900,
  growth: 7900,
};

export interface UpdateTenantPlanResult {
  success: boolean;
  tenant?: TenantSummary;
  error?: string;
}

// Scale has no self-serve checkout yet — only reachable via the "Get in touch" link, never
// through this endpoint (spec-subscription-plans.md, "Scale/Custom — escondido, no borrado").
export async function updateTenantPlan(tenantId: string, plan: PlanTier): Promise<UpdateTenantPlanResult> {
  if (plan !== 'starter' && plan !== 'growth') {
    return { success: false, error: 'This plan is not available for self-service selection yet.' };
  }

  const lockedPriceCents = CURRENT_PLAN_PRICES_CENTS[plan];

  const tenant = await prisma.$transaction(async (tx) => {
    const updated = await tx.tenant.update({
      where: { id: tenantId },
      data: {
        plan,
        lockedPriceCents,
        lockedPriceSetAt: new Date(),
        // trialEndsAt is deliberately untouched here — it was set once at registration
        // (tenantService.ts's registerTenantWithOwner) and picking/re-picking a plan doesn't
        // restart the trial clock (spec-subscription-plans.md: "no arranca un trial nuevo").
      },
      select: TENANT_SUMMARY_SELECT,
    });

    // Billing Integration (spec-billing-integration.md) — keep Subscription's own copy of
    // plan/lockedPriceCents in sync with the tenant's explicit choice here, otherwise it stays
    // pinned to the 'starter' placeholder set at signup (schema.prisma's comment on the
    // Subscription model) even after the tenant picks Growth, and a checkout built on top of
    // Subscription.plan/lockedPriceCents would charge the wrong plan. Currency stays "USD" here
    // on purpose — this endpoint predates per-country pricing (CURRENT_PLAN_PRICES_CENTS above
    // is USD-only); an Argentina-priced checkout looks up PlanPrice directly instead of trusting
    // this placeholder, so it's superseded before it would ever matter.
    //
    // upsert, not update: a tenant created before Billing Integration shipped has no
    // Subscription row until scripts/backfill-billing-subscriptions.ts is run for its
    // environment. Without this, `update` throws P2025 (record not found) and this endpoint
    // 500s for every pre-existing tenant until an operator remembers to run that script — this
    // makes plan selection self-healing instead of depending on that manual step.
    await tx.subscription.upsert({
      where: { tenantId },
      update: { plan, lockedPriceCents, currency: 'USD' },
      create: {
        tenantId,
        plan,
        status: TENANT_TO_SUBSCRIPTION_STATUS[updated.status],
        lockedPriceCents,
        currency: 'USD',
        trialEndsAt: updated.trialEndsAt,
        gracePeriodEndsAt: updated.gracePeriodEndsAt,
      },
    });

    return updated;
  });

  return { success: true, tenant };
}
