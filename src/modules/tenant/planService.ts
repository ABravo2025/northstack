import prisma from '../../lib/prisma.js';
import type { PlanTier } from '@prisma/client';
import { TENANT_SUMMARY_SELECT, type TenantSummary } from './tenantSummary.js';

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
    await tx.subscription.update({
      where: { tenantId },
      data: { plan, lockedPriceCents, currency: 'USD' },
    });

    return updated;
  });

  return { success: true, tenant };
}
