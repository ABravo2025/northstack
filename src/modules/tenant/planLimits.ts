import type { PlanTier, Prisma } from '@prisma/client';
import { PRICING } from '../../config/pricing.js';

// Plan-tier enforcement (2026-09-07) — until now nothing in the backend gated any feature by
// plan (see PlansModal.tsx's own comment on the frontend side). This is the single source of
// truth for what each plan actually allows, mirroring CURRENT_PLAN_PRICES_CENTS's role for
// pricing (planService.ts). null = unlimited.
export interface PlanLimits {
  maxPipelines: number | null;
  maxTimeOffPolicies: number | null;
  maxCustomRoles: number | null;
  activityLogRetentionDays: number | null;
  payrollEnabled: boolean;
  paymentsEnabled: boolean;
  // Private API keys + outbound webhooks (and, later, AI assistants via MCP —
  // spec-mcp-server.md). Growth-only (Alejandro, 2026-10-01); was ungated until then.
  apiAccessEnabled: boolean;
  // Active users allowed while on the Free Trial with no plan chosen (seatService.ts's seatCapError).
  freeTrialSeatCap: number;
}

export type EffectivePlan = 'starter' | 'growth';

export const PLAN_LIMITS: Record<EffectivePlan, PlanLimits> = {
  starter: {
    maxPipelines: 2,
    maxTimeOffPolicies: 3,
    maxCustomRoles: 2,
    activityLogRetentionDays: 7,
    payrollEnabled: false,
    paymentsEnabled: false,
    apiAccessEnabled: false,
    freeTrialSeatCap: PRICING.freeTrialSeatCap,
  },
  growth: {
    maxPipelines: null,
    maxTimeOffPolicies: null,
    maxCustomRoles: null,
    activityLogRetentionDays: 30,
    payrollEnabled: true,
    paymentsEnabled: true,
    apiAccessEnabled: true,
    freeTrialSeatCap: PRICING.freeTrialSeatCap,
  },
};

// A tenant that hasn't chosen a plan yet (Tenant.plan still null, mid Free Trial) gets full
// Growth-level access so they experience the whole platform before committing — the moment they
// pick Starter, limits apply immediately (2026-09-07 decision, not a downgrade surprise at trial's
// end). `scale` is hidden/not sold yet and has no limits of its own defined — treated as
// Growth-or-better until a real Scale tier exists. A null tenant (platform staff with no
// tenantId, e.g. Admin Center logins) never goes through a tenant-scoped route that calls this —
// treated as unlimited rather than crashing, same safe-default spirit as the rest.
export function getEffectivePlan(tenant: { plan: PlanTier | null } | null): EffectivePlan {
  if (tenant?.plan === 'starter') return 'starter';
  return 'growth';
}

// ---------------------------------------------------------------------------------------------
// Per-client overrides ("special agreements", Admin Center v2 stage 2b, 2026-10-03). Set by
// Northstack staff from the Admin; layered on top of the plan here, so every existing gate
// (isPayrollAllowed, maxPipelines, seatCapError, ...) honours it without knowing it exists.
// An override past its expiresAt is ignored — the tenant goes back to the plan as sold on its own.

export type OverridableModule = 'payroll' | 'payments' | 'apiAccess';
export type OverridableLimit = 'maxPipelines' | 'maxTimeOffPolicies' | 'maxCustomRoles' | 'activityLogRetentionDays' | 'freeTrialSeatCap';

export const OVERRIDABLE_MODULES: OverridableModule[] = ['payroll', 'payments', 'apiAccess'];
export const OVERRIDABLE_LIMITS: OverridableLimit[] = ['maxPipelines', 'maxTimeOffPolicies', 'maxCustomRoles', 'activityLogRetentionDays', 'freeTrialSeatCap'];

const MODULE_FLAG: Record<OverridableModule, 'payrollEnabled' | 'paymentsEnabled' | 'apiAccessEnabled'> = {
  payroll: 'payrollEnabled',
  payments: 'paymentsEnabled',
  apiAccess: 'apiAccessEnabled',
};

export interface PlanOverride {
  // true = on even if the plan doesn't include it; false = off even if it does. Absent = the plan.
  modules: Partial<Record<OverridableModule, boolean>>;
  // A number replaces the plan's limit; null = unlimited (not valid for freeTrialSeatCap). Absent = the plan.
  limits: Partial<Record<OverridableLimit, number | null>>;
  reason: string;
  expiresAt: string | null; // ISO date (inclusive, end of that day UTC)
  setAt: string;
  setByUserId: string;
}

type TenantLike = { plan: PlanTier | null; planOverride?: Prisma.JsonValue | null } | null;

// Reads the stored JSON defensively (it's free-form in the DB): anything malformed is dropped, an
// expired override reads as none.
export function activeOverride(raw: Prisma.JsonValue | null | undefined, now: Date = new Date()): PlanOverride | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.expiresAt === 'string' && Date.parse(`${o.expiresAt.slice(0, 10)}T23:59:59.999Z`) < now.getTime()) return null;
  const modules: PlanOverride['modules'] = {};
  const limits: PlanOverride['limits'] = {};
  const m = (o.modules ?? {}) as Record<string, unknown>;
  for (const key of OVERRIDABLE_MODULES) if (typeof m[key] === 'boolean') modules[key] = m[key] as boolean;
  const l = (o.limits ?? {}) as Record<string, unknown>;
  for (const key of OVERRIDABLE_LIMITS) {
    const v = l[key];
    if (v === null && key !== 'freeTrialSeatCap') limits[key] = null;
    else if (typeof v === 'number' && Number.isInteger(v) && v >= 0) limits[key] = v;
  }
  return {
    modules,
    limits,
    reason: typeof o.reason === 'string' ? o.reason : '',
    expiresAt: typeof o.expiresAt === 'string' ? o.expiresAt : null,
    setAt: typeof o.setAt === 'string' ? o.setAt : '',
    setByUserId: typeof o.setByUserId === 'string' ? o.setByUserId : '',
  };
}

export function getPlanLimits(tenant: TenantLike, now: Date = new Date()): PlanLimits {
  const base = PLAN_LIMITS[getEffectivePlan(tenant)];
  const override = activeOverride(tenant?.planOverride, now);
  if (!override) return base;
  const merged: PlanLimits = { ...base };
  for (const key of OVERRIDABLE_MODULES) {
    const v = override.modules[key];
    if (v !== undefined) merged[MODULE_FLAG[key]] = v;
  }
  for (const key of OVERRIDABLE_LIMITS) {
    const v = override.limits[key];
    if (v === undefined) continue;
    if (key === 'freeTrialSeatCap') merged.freeTrialSeatCap = v ?? base.freeTrialSeatCap;
    else merged[key] = v;
  }
  return merged;
}

export function isPayrollAllowed(tenant: TenantLike): boolean {
  return getPlanLimits(tenant).payrollEnabled;
}

export function isPaymentsAllowed(tenant: TenantLike): boolean {
  return getPlanLimits(tenant).paymentsEnabled;
}

export function isApiAccessAllowed(tenant: TenantLike): boolean {
  return getPlanLimits(tenant).apiAccessEnabled;
}

// What the customer app's UI needs to show/hide plan-gated modules (GET /api/auth/me).
export function planFeatures(tenant: TenantLike) {
  const l = getPlanLimits(tenant);
  return { payroll: l.payrollEnabled, payments: l.paymentsEnabled, apiAccess: l.apiAccessEnabled };
}
