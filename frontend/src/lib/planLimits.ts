import type { Tenant } from '../api';

// Frontend mirror of the backend's getEffectivePlan (src/modules/tenant/planLimits.ts,
// 2026-09-07) — a tenant that hasn't chosen a plan yet (plan still null, mid Free Trial) gets
// full Growth-level access so they experience the whole platform before committing. Only used to
// decide what to *show* (nav items, upsell copy) — the backend is the real enforcement; this just
// keeps the UI from offering something a Starter tenant would immediately get a 403 for.
export function isGrowthFeatureEnabled(tenant: Tenant | null): boolean {
  return tenant?.plan !== 'starter';
}
