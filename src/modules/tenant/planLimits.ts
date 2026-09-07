import type { PlanTier } from '@prisma/client';
import prisma from '../../lib/prisma.js';

// Plan-tier enforcement (2026-09-07) — until now nothing in the backend gated any feature by
// plan (see PlansModal.tsx's own comment on the frontend side). This is the single source of
// truth for what each plan actually allows, mirroring CURRENT_PLAN_PRICES_CENTS's role for
// pricing (planService.ts). null = unlimited.
export interface PlanLimits {
  maxPipelines: number | null;
  maxTimeOffPolicies: number | null;
  maxAdminUsers: number | null;
  maxCustomRoles: number | null;
  activityLogRetentionDays: number | null;
  payrollEnabled: boolean;
  paymentsEnabled: boolean;
}

export type EffectivePlan = 'starter' | 'growth';

export const PLAN_LIMITS: Record<EffectivePlan, PlanLimits> = {
  starter: {
    maxPipelines: 2,
    maxTimeOffPolicies: 3,
    maxAdminUsers: 2,
    maxCustomRoles: 2,
    activityLogRetentionDays: 7,
    payrollEnabled: false,
    paymentsEnabled: false,
  },
  growth: {
    maxPipelines: null,
    maxTimeOffPolicies: null,
    maxAdminUsers: 5,
    maxCustomRoles: null,
    activityLogRetentionDays: 30,
    payrollEnabled: true,
    paymentsEnabled: true,
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

export function getPlanLimits(tenant: { plan: PlanTier | null } | null): PlanLimits {
  return PLAN_LIMITS[getEffectivePlan(tenant)];
}

export function isPayrollAllowed(tenant: { plan: PlanTier | null } | null): boolean {
  return getPlanLimits(tenant).payrollEnabled;
}

export function isPaymentsAllowed(tenant: { plan: PlanTier | null } | null): boolean {
  return getPlanLimits(tenant).paymentsEnabled;
}

// "Admin user" for the seat cap means literally the default "Admin" role only (2026-09-07
// decision) — a tenant's custom roles never count against this, however privileged. Counts both
// already-active Users and still-pending Invitations for the role, so sending N pending Admin
// invites at once is blocked the same as N accepted ones — a tenant can't dodge the cap by
// inviting past it and having them all land at once.
// excludeUserId — for re-promoting/re-saving a user who's already on the Admin role (e.g. just
// changing their status), so they don't get counted against their own seat and block a no-op.
export async function hasAdminSeatAvailable(
  tenant: { id: string; plan: PlanTier | null },
  excludeUserId?: string,
): Promise<boolean> {
  const { maxAdminUsers } = getPlanLimits(tenant);
  if (maxAdminUsers === null) return true;

  const [activeAdmins, pendingAdminInvites] = await Promise.all([
    prisma.user.count({
      where: {
        tenantId: tenant.id,
        status: 'active',
        roleRef: { name: 'Admin' },
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
    }),
    prisma.invitation.count({ where: { tenantId: tenant.id, status: 'pending', roleRef: { name: 'Admin' } } }),
  ]);

  return activeAdmins + pendingAdminInvites < maxAdminUsers;
}
