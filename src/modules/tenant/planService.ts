import prisma from '../../lib/prisma.js';
import type { PlanTier, Tenant } from '@prisma/client';

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
  tenant?: Tenant;
  error?: string;
}

// Scale has no self-serve checkout yet — only reachable via the "Get in touch" link, never
// through this endpoint (spec-subscription-plans.md, "Scale/Custom — escondido, no borrado").
export async function updateTenantPlan(tenantId: string, plan: PlanTier): Promise<UpdateTenantPlanResult> {
  if (plan !== 'starter' && plan !== 'growth') {
    return { success: false, error: 'This plan is not available for self-service selection yet.' };
  }

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      plan,
      lockedPriceCents: CURRENT_PLAN_PRICES_CENTS[plan],
      lockedPriceSetAt: new Date(),
      // trialEndsAt is deliberately untouched here — it was set once at registration
      // (tenantService.ts's registerTenantWithOwner) and picking/re-picking a plan doesn't
      // restart the trial clock (spec-subscription-plans.md: "no arranca un trial nuevo").
    },
  });

  return { success: true, tenant };
}
