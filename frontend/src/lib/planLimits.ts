import type { PermissionsPayload, PlanFeatures, Tenant } from '../api';

// Frontend mirror of the backend's getEffectivePlan (src/modules/tenant/planLimits.ts,
// 2026-09-07) — a tenant that hasn't chosen a plan yet (plan still null, mid Free Trial) gets
// full Growth-level access so they experience the whole platform before committing. Only used to
// decide what to *show* (nav items, upsell copy) — the backend is the real enforcement; this just
// keeps the UI from offering something a Starter tenant would immediately get a 403 for.
export function isGrowthFeatureEnabled(tenant: Tenant | null): boolean {
  return tenant?.plan !== 'starter';
}

// The plan-gated modules a tenant has: what the backend says (plan + Admin Center agreement) when
// it says it, otherwise the plan name alone.
export function planFeaturesFor(tenant: Tenant | null, payload: PermissionsPayload | null): PlanFeatures {
  if (payload?.planFeatures) return payload.planFeatures;
  const growth = isGrowthFeatureEnabled(tenant);
  return { payroll: growth, payments: growth, apiAccess: growth };
}
