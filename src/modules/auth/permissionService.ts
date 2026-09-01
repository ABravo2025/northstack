import type { RoleContext } from './roleService.js';

// Fase B (Custom Roles) — every function here now reads from a resolved RoleContext instead of
// the static rolePermissions map keyed by the legacy UserRole enum (owner/admin/member). `isOwner`
// short-circuits every check to `true`: the owner role never has RoleModulePermission rows (see
// roleService.ts's seedDefaultRolesForTenant), so it's structurally, not just conventionally,
// unrestrictable.
function has(role: RoleContext, permission: string): boolean {
  return role.isOwner || role.permissions.has(permission);
}

// Legacy pair — kept ONLY for the `Client` module (routes/clients.ts) and the onboarding
// sample-data seeder (routes/onboarding.ts), neither of which is in scope for this redesign
// (Client is a legacy module on a path to decommission, docs/tareas/backlog.md). Every other
// consumer of "view/manage Employee" moved to canViewEmployee/canManageEmployee below.
export function canViewHr(role: RoleContext): boolean {
  return has(role, 'view_hr');
}

export function canCreateHr(role: RoleContext): boolean {
  return has(role, 'create_hr');
}

// Employee/Company/Contact/Opportunity — split out of the old canViewHr/canCreateHr (which gated
// all 4 together) so a custom role can grant them independently. This split is what makes the
// Sales cascade below, and Employee's field-level/scope work (Fase C/E), actually mean something.
export function canViewEmployee(role: RoleContext): boolean {
  return has(role, 'view_employee');
}

export function canManageEmployee(role: RoleContext): boolean {
  return has(role, 'manage_employee');
}

export function canViewCompany(role: RoleContext): boolean {
  return has(role, 'view_company');
}

export function canManageCompany(role: RoleContext): boolean {
  return has(role, 'manage_company');
}

export function canViewContact(role: RoleContext): boolean {
  return has(role, 'view_contact');
}

export function canManageContact(role: RoleContext): boolean {
  return has(role, 'manage_contact');
}

// Deliberately NOT a stored permission (no 'view_opportunity' key exists) — derived from Company
// AND Contact visibility per Alejandro's explicit rule: whoever can't see Contacts or Companies
// can't see anything in Sales either, so an Opportunity's own context (who it's for) is never
// hidden while the deal itself is visible.
export function canViewOpportunity(role: RoleContext): boolean {
  return canViewCompany(role) && canViewContact(role);
}

// Requires canViewOpportunity as a prerequisite — editing a deal you structurally can't view
// (because Company/Contact access was revoked) doesn't make sense, so this can never be granted
// on its own independent of the two above.
export function canManageOpportunity(role: RoleContext): boolean {
  return canViewOpportunity(role) && has(role, 'manage_opportunity');
}

export function canManageCustomFields(role: RoleContext): boolean {
  return has(role, 'manage_custom_fields');
}

export function canInviteUsers(role: RoleContext): boolean {
  return has(role, 'invite_users');
}

export function canManageUsers(role: RoleContext): boolean {
  return has(role, 'manage_users');
}

// Owner-only, unlike the rest of this file where admin matches owner —
// Payroll's compensation data is owner-only visibility by default (see
// docs/spec-payroll.md's "Convenciones" section) until custom permissions exist.
export function canManagePayroll(role: RoleContext): boolean {
  return has(role, 'manage_payroll');
}

// Owner-only, same reasoning as canManagePayroll above — Subscription Plans
// (spec-subscription-plans.md) treats choosing/changing the tenant's plan as an
// ownership-level decision, not something an admin does on the owner's behalf.
export function canManageBilling(role: RoleContext): boolean {
  return has(role, 'manage_billing');
}

// Owner-only for now (Alejandro, 2026-08-26 — spec-payments-v1.md decision #9 originally said
// "owner/admin, same criteria as Payroll", but Payroll's actual gate above is owner-only, and
// that's the one he confirmed keeping: connecting the tenant's own Stripe account and seeing its
// Companies' refunds/failed payments/subscriptions stays owner-only until the custom-roles system
// exists — deliberately routed through this named permission, not an inline `role === 'owner'`
// check at each call site, so swapping in custom roles later only means changing this function).
export function canManagePayments(role: RoleContext): boolean {
  return has(role, 'manage_payments');
}

// Owner-only, same reasoning as canManagePayroll — deals-by-owner is
// per-person performance data inside the tenant (who's closing, who isn't),
// not something every member should see about their teammates.
export function canViewSalesLeaderboard(role: RoleContext): boolean {
  return has(role, 'view_sales_leaderboard');
}

// Owner/admin, same tier as manage_users/manage_custom_fields — this gates only the tenant-wide
// Activity Log feed in Settings (spec-activity-log.md decision #4); the per-record Activity tab in
// each entity's detail modal has no gate of its own, same as Notes/Tasks.
export function canViewActivityLog(role: RoleContext): boolean {
  return has(role, 'view_activity_log');
}

// Fase B — replaces the inline `role !== 'owner' && role !== 'admin'` check that used to gate
// PATCH /api/tenants/current (currency).
export function canManageTenantSettings(role: RoleContext): boolean {
  return has(role, 'manage_tenant_settings');
}

// Fase B — replaces savedViewService.ts's inline `canManageShared` (creating a `visibility:
// 'shared'` Saved View). Editing/deleting someone else's shared view stays a direct
// `role.isOwner` check in savedViewService.ts (not this permission) — that one was always
// "the owner specifically", not "owner or admin", so it doesn't fit a plain named permission the
// same way.
export function canManageSharedViews(role: RoleContext): boolean {
  return has(role, 'manage_shared_views');
}

// Fase B — the ROLE-based half of Time Off approval. timeOffRequestService.ts still ORs this with
// "is the request's assigned manager, regardless of role" — that relationship rule isn't
// replaced by a role permission, it's layered on top of it (see decision 4 in the plan: relación
// rules stay separate from the role system, not folded into it).
export function canDecideTimeOff(role: RoleContext): boolean {
  return has(role, 'decide_time_off');
}
