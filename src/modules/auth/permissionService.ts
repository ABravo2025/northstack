import type { UserRole } from '@prisma/client';

export const rolePermissions: Record<UserRole, string[]> = {
  owner: [
    'view_hr',
    'create_hr',
    'manage_custom_fields',
    'invite_users',
    'manage_users',
    'manage_payroll',
    'manage_billing',
    'manage_payments',
    'view_sales_leaderboard',
  ],
  admin: ['view_hr', 'create_hr', 'manage_custom_fields', 'invite_users', 'manage_users'],
  member: ['view_hr'],
};

export function canViewHr(role: UserRole): boolean {
  return rolePermissions[role].includes('view_hr');
}

export function canCreateHr(role: UserRole): boolean {
  return rolePermissions[role].includes('create_hr');
}

export function canManageCustomFields(role: UserRole): boolean {
  return rolePermissions[role].includes('manage_custom_fields');
}

export function canInviteUsers(role: UserRole): boolean {
  return rolePermissions[role].includes('invite_users');
}

export function canManageUsers(role: UserRole): boolean {
  return rolePermissions[role].includes('manage_users');
}

// Owner-only, unlike the rest of this file where admin matches owner —
// Payroll's compensation data is owner-only visibility by default (see
// docs/spec-payroll.md's "Convenciones" section) until custom permissions exist.
export function canManagePayroll(role: UserRole): boolean {
  return rolePermissions[role].includes('manage_payroll');
}

// Owner-only, same reasoning as canManagePayroll above — Subscription Plans
// (spec-subscription-plans.md) treats choosing/changing the tenant's plan as an
// ownership-level decision, not something an admin does on the owner's behalf.
export function canManageBilling(role: UserRole): boolean {
  return rolePermissions[role].includes('manage_billing');
}

// Owner-only for now (Alejandro, 2026-08-26 — spec-payments-v1.md decision #9 originally said
// "owner/admin, same criteria as Payroll", but Payroll's actual gate above is owner-only, and
// that's the one he confirmed keeping: connecting the tenant's own Stripe account and seeing its
// Companies' refunds/failed payments/subscriptions stays owner-only until the custom-roles system
// exists — deliberately routed through this named permission, not an inline `role === 'owner'`
// check at each call site, so swapping in custom roles later only means changing this function).
export function canManagePayments(role: UserRole): boolean {
  return rolePermissions[role].includes('manage_payments');
}

// Owner-only, same reasoning as canManagePayroll — deals-by-owner is
// per-person performance data inside the tenant (who's closing, who isn't),
// not something every member should see about their teammates.
export function canViewSalesLeaderboard(role: UserRole): boolean {
  return rolePermissions[role].includes('view_sales_leaderboard');
}
