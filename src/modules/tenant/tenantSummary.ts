import { Prisma } from '@prisma/client';

// Leaf module (no imports besides @prisma/client) — the fields the frontend's `Tenant` type
// (api/types.ts) actually reads. Shared by every endpoint that returns a tenant to the client
// (tenantService.ts's getTenantById/updateTenantCurrency, planService.ts's updateTenantPlan) so
// none of them accidentally ships a wider or narrower row than the others. Lives here rather
// than in tenantService.ts to avoid a circular import — tenantService.ts already imports
// CURRENT_PLAN_PRICES_CENTS from planService.ts, so planService.ts can't import back from it.
export const TENANT_SUMMARY_SELECT = {
  id: true,
  name: true,
  currency: true,
  status: true,
  plan: true,
  companySize: true,
  trialEndsAt: true,
  gracePeriodEndsAt: true,
} as const;

export type TenantSummary = Prisma.TenantGetPayload<{ select: typeof TENANT_SUMMARY_SELECT }>;
