import prisma from '../../lib/prisma.js';
import type { Role, ActivityEntityType, UserRole } from '@prisma/client';

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// Special RoleModulePermission conventions used only for Employee (see fieldVisibilityService.ts,
// built in a later unit, and docs/tareas/backlog.md "Sistema de roles custom" §5 for the reasoning).
// The 3 scope keys are mutually exclusive — a role should have at most one of them.
export const EMPLOYEE_SCOPE_SELF = 'view_employee_scope:self';
export const EMPLOYEE_SCOPE_DEPARTMENT = 'view_employee_scope:department';
export const EMPLOYEE_SCOPE_ALL = 'view_employee_scope:all';
export const EMPLOYEE_SCOPE_PERMISSIONS = [EMPLOYEE_SCOPE_SELF, EMPLOYEE_SCOPE_DEPARTMENT, EMPLOYEE_SCOPE_ALL] as const;
export type EmployeeScope = 'self' | 'department' | 'all' | 'none';

export const VIEW_EMPLOYEE_CUSTOM_FIELDS = 'view_employee_custom_fields';
export const EDIT_EMPLOYEE_CUSTOM_FIELDS = 'edit_employee_custom_fields';

// Fase B — permissionService.ts's `canViewHr`/`canCreateHr` used to gate Employee/Company/
// Contact/Opportunity all together under one flag; that made the field-level/scope work (and the
// Sales cascade — canViewOpportunity derives from canViewCompany && canViewContact) meaningless,
// since none of the 4 could be independently granted. Split into one view/manage pair per entity.
// `view_hr`/`create_hr` themselves are kept (see below) as a legacy pair used ONLY by the
// soon-to-be-decommissioned `Client` module and the onboarding sample-data seeder — neither is
// part of this redesign's scope (docs/tareas/backlog.md "Corte final del módulo Client legado").
export const VIEW_EMPLOYEE = 'view_employee';
export const MANAGE_EMPLOYEE = 'manage_employee';
export const VIEW_COMPANY = 'view_company';
export const MANAGE_COMPANY = 'manage_company';
export const VIEW_CONTACT = 'view_contact';
export const MANAGE_CONTACT = 'manage_contact';
// No VIEW_OPPORTUNITY constant — it's derived (canViewCompany && canViewContact), never stored.
export const MANAGE_OPPORTUNITY = 'manage_opportunity';

// Fase B — replace the 3 remaining inline `role === 'owner' || role === 'admin'` checks (tenant
// currency, creating a shared Saved View) with named permissions, same convention as everything
// else. Time Off approval doesn't get a plain permission of its own logic here — see
// `canDecideTimeOff` in permissionService.ts and timeOffRequestService.ts for why the "OR the
// assigned manager" relationship rule has to stay layered on top, not replaced by this flag.
export const MANAGE_TENANT_SETTINGS = 'manage_tenant_settings';
export const MANAGE_SHARED_VIEWS = 'manage_shared_views';
export const DECIDE_TIME_OFF = 'decide_time_off';

// The full permission allowlist — the source a future role-editing endpoint (Fase H) validates
// incoming permission strings against. Kept here rather than in permissionService.ts since both
// files need it and this one has no reverse dependency on that one.
export const PERMISSION_KEYS = [
  'view_hr',
  'create_hr',
  VIEW_EMPLOYEE,
  MANAGE_EMPLOYEE,
  VIEW_COMPANY,
  MANAGE_COMPANY,
  VIEW_CONTACT,
  MANAGE_CONTACT,
  MANAGE_OPPORTUNITY,
  'manage_custom_fields',
  'invite_users',
  'manage_users',
  'manage_payroll',
  'manage_billing',
  'manage_payments',
  'view_sales_leaderboard',
  'view_activity_log',
  MANAGE_TENANT_SETTINGS,
  MANAGE_SHARED_VIEWS,
  DECIDE_TIME_OFF,
  VIEW_EMPLOYEE_CUSTOM_FIELDS,
  EDIT_EMPLOYEE_CUSTOM_FIELDS,
  ...EMPLOYEE_SCOPE_PERMISSIONS,
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

// Fase B2 — the subset of PERMISSION_KEYS actually exposed on the Settings → Roles & Permissions
// toggle UI. Deliberately narrower than PERMISSION_KEYS: excludes the legacy `view_hr`/`create_hr`
// pair (Client-only, not a real lever for a tenant to reach for) and the Employee scope keys
// (self/department/all — Fase E hasn't shipped row-level enforcement for them yet, exposing a
// toggle that silently does nothing would be worse than not showing it). The Employee
// custom-fields bundle joined this list in Fase D, once permissionService.ts's
// canViewEmployeeCustomFields/canEditEmployeeCustomFields actually enforce it. Validated
// server-side in roleManagementService.ts so a request can't grant something this UI was never
// meant to expose.
export const TOGGLEABLE_PERMISSION_KEYS = [
  VIEW_EMPLOYEE,
  MANAGE_EMPLOYEE,
  VIEW_COMPANY,
  MANAGE_COMPANY,
  VIEW_CONTACT,
  MANAGE_CONTACT,
  MANAGE_OPPORTUNITY,
  'manage_custom_fields',
  'invite_users',
  'manage_users',
  'manage_payroll',
  'manage_billing',
  'manage_payments',
  'view_sales_leaderboard',
  'view_activity_log',
  MANAGE_TENANT_SETTINGS,
  MANAGE_SHARED_VIEWS,
  DECIDE_TIME_OFF,
  VIEW_EMPLOYEE_CUSTOM_FIELDS,
  EDIT_EMPLOYEE_CUSTOM_FIELDS,
] as const;
export type ToggleablePermissionKey = (typeof TOGGLEABLE_PERMISSION_KEYS)[number];

// canManageOpportunity requires canViewOpportunity (Company AND Contact view) as a prerequisite
// (permissionService.ts) — this is the same rule enforced at grant time: a role can't be given
// manage_opportunity unless it already has both of these. Keyed by the permission that has
// prerequisites, not the prerequisites themselves, since that's the direction the check runs.
// Same idea for the Employee custom-fields bundle, this time 2 levels deep:
// canViewEmployeeCustomFields is meaningless without canViewEmployee, and canEditEmployeeCustomFields
// is meaningless without both canManageEmployee AND canViewEmployeeCustomFields (a role that can
// create/edit a value it can never see back via GET would be a "dormant" grant, same failure mode
// DEPENDENT_PERMISSIONS below exists to prevent). Because this chain is 2 levels deep — unlike
// manage_opportunity's single level — the revoke cascade in roleManagementService.ts walks
// DEPENDENT_PERMISSIONS to a fixed point (transitive closure), not just one hop.
export const PERMISSION_PREREQUISITES: Partial<Record<ToggleablePermissionKey, ToggleablePermissionKey[]>> = {
  [MANAGE_OPPORTUNITY]: [VIEW_COMPANY, VIEW_CONTACT],
  [VIEW_EMPLOYEE_CUSTOM_FIELDS]: [VIEW_EMPLOYEE],
  [EDIT_EMPLOYEE_CUSTOM_FIELDS]: [VIEW_EMPLOYEE_CUSTOM_FIELDS, MANAGE_EMPLOYEE],
};

// The inverse of PERMISSION_PREREQUISITES — revoking one of these cascades into revoking whatever
// depends on it too (directly), so a role can never be left holding a "dormant" grant
// (manage_opportunity with view_company since-revoked) that would silently reactivate the moment
// the prerequisite is re-granted later. Derived from PERMISSION_PREREQUISITES at module load, not
// hand-maintained separately, so the two can never drift apart. Only direct dependents — a
// multi-level chain (e.g. view_employee → view_employee_custom_fields → edit_employee_custom_fields)
// needs the consumer to walk this map to a fixed point, which roleManagementService.ts's revoke
// path does.
export const DEPENDENT_PERMISSIONS: Partial<Record<ToggleablePermissionKey, ToggleablePermissionKey[]>> = (() => {
  const map: Partial<Record<ToggleablePermissionKey, ToggleablePermissionKey[]>> = {};
  for (const [dependent, prerequisites] of Object.entries(PERMISSION_PREREQUISITES) as [ToggleablePermissionKey, ToggleablePermissionKey[]][]) {
    for (const prerequisite of prerequisites) {
      (map[prerequisite] ??= []).push(dependent);
    }
  }
  return map;
})();

// Single source of truth for what Admin/Member get seeded with — reproduces TODAY's real
// behavior (pre-Custom-Roles) exactly, so shipping this feature is a no-op for every existing
// role until a tenant actively reconfigures one. Used both by seedDefaultRolesForTenant (new
// tenants) and scripts/backfill-fase-b-permissions.ts (topping up the 184 tenants' roles already
// seeded by Fase A, which predate the entity split and the 3 new named permissions above).
export const ADMIN_SEED_PERMISSIONS: string[] = [
  'view_hr',
  'create_hr',
  VIEW_EMPLOYEE,
  MANAGE_EMPLOYEE,
  VIEW_COMPANY,
  MANAGE_COMPANY,
  VIEW_CONTACT,
  MANAGE_CONTACT,
  MANAGE_OPPORTUNITY,
  'manage_custom_fields',
  'invite_users',
  'manage_users',
  MANAGE_TENANT_SETTINGS,
  MANAGE_SHARED_VIEWS,
  DECIDE_TIME_OFF,
  'view_activity_log',
  VIEW_EMPLOYEE_CUSTOM_FIELDS,
  EDIT_EMPLOYEE_CUSTOM_FIELDS,
  EMPLOYEE_SCOPE_ALL,
];

export const MEMBER_SEED_PERMISSIONS: string[] = [
  'view_hr',
  VIEW_EMPLOYEE,
  VIEW_COMPANY,
  VIEW_CONTACT,
  VIEW_EMPLOYEE_CUSTOM_FIELDS,
  EMPLOYEE_SCOPE_ALL,
];

export interface RoleContext {
  id: string;
  name: string;
  isOwner: boolean;
  permissions: Set<string>;
  hiddenFieldsByEntity: Map<ActivityEntityType, Set<string>>;
}

// Custom Roles Fase G — the wire-format counterpart to RoleContext: same data, but Set/Map swapped
// for array/plain-object so it survives JSON.stringify. Sent once on GET /api/auth/me and consumed
// by the frontend's PermissionsContext — the single source `has()`/`isFieldHidden()` in that
// context mirror permissionService.ts's `has()` and fieldVisibilityService.ts's `isFieldVisible()`
// exactly, so a role's real UI feels the same as what the backend actually enforces, not an
// approximation of it.
export interface SerializedRoleContext {
  id: string;
  name: string;
  isOwner: boolean;
  permissions: string[];
  hiddenFields: Record<string, string[]>;
}

export function serializeRoleContext(role: RoleContext): SerializedRoleContext {
  const hiddenFields: Record<string, string[]> = {};
  for (const [entityType, fields] of role.hiddenFieldsByEntity) {
    hiddenFields[entityType] = Array.from(fields);
  }
  return {
    id: role.id,
    name: role.name,
    isOwner: role.isOwner,
    permissions: Array.from(role.permissions),
    hiddenFields,
  };
}

interface SeedRoleResult {
  owner: Role;
  admin: Role;
  member: Role;
}

// Called once per tenant — at tenant creation (registerTenantWithOwner, tenantService.ts) for new
// tenants, and once per pre-existing tenant by scripts/backfill-custom-roles.ts. Seeds the 3
// fixed-name roles with the permission set that reproduces TODAY's owner/admin/member behavior
// exactly: the current rolePermissions map (permissionService.ts) for Admin/Member, plus
// EMPLOYEE_SCOPE_ALL (Fase E, no enforcement yet) and VIEW_EMPLOYEE_CUSTOM_FIELDS (both roles) /
// EDIT_EMPLOYEE_CUSTOM_FIELDS (Admin only) — matches pre-Fase-D behavior where any tenant member
// could read an Employee's custom field values but only owner/admin could write them (via
// manage_custom_fields), now enforced for real by canViewEmployeeCustomFields/
// canEditEmployeeCustomFields (permissionService.ts, Fase D). Owner gets isOwner=true and zero
// RoleModulePermission rows — it bypasses every check structurally (see RoleContext.isOwner), by
// design never has restrictable rows.
// Idempotent: returns the existing rows untouched if this tenant already has roles.
export async function seedDefaultRolesForTenant(tx: PrismaTx, tenantId: string): Promise<SeedRoleResult> {
  const existingOwner = await tx.role.findUnique({ where: { tenantId_name: { tenantId, name: 'Owner' } } });
  if (existingOwner) {
    const [admin, member] = await Promise.all([
      tx.role.findUniqueOrThrow({ where: { tenantId_name: { tenantId, name: 'Admin' } } }),
      tx.role.findUniqueOrThrow({ where: { tenantId_name: { tenantId, name: 'Member' } } }),
    ]);
    return { owner: existingOwner, admin, member };
  }

  const owner = await tx.role.create({
    data: { tenantId, name: 'Owner', isOwner: true, isEditable: false },
  });

  const admin = await tx.role.create({ data: { tenantId, name: 'Admin' } });
  await tx.roleModulePermission.createMany({
    data: ADMIN_SEED_PERMISSIONS.map((permission) => ({ tenantId, roleId: admin.id, permission })),
  });

  const member = await tx.role.create({ data: { tenantId, name: 'Member' } });
  await tx.roleModulePermission.createMany({
    data: MEMBER_SEED_PERMISSIONS.map((permission) => ({ tenantId, roleId: member.id, permission })),
  });

  return { owner, admin, member };
}

// Resolves a User's roleId into the RoleContext consulted by permissionService.ts/
// fieldVisibilityService.ts. Not called from anywhere yet in this unit (Fase A wires it into
// authenticateToken so it's available on AuthenticatedUser, but nothing reads it for an
// authorization decision until Fase B rewires permissionService.ts's functions to accept it) —
// exists now so later units don't need to touch authService.ts's include/select shape again.
export async function loadRoleContext(roleId: string): Promise<RoleContext> {
  const role = await prisma.role.findUniqueOrThrow({
    where: { id: roleId },
    include: { modulePermissions: true, fieldRestrictions: true },
  });

  const hiddenFieldsByEntity = new Map<ActivityEntityType, Set<string>>();
  for (const restriction of role.fieldRestrictions) {
    const set = hiddenFieldsByEntity.get(restriction.entityType) ?? new Set<string>();
    set.add(restriction.fieldKey);
    hiddenFieldsByEntity.set(restriction.entityType, set);
  }

  return {
    id: role.id,
    name: role.name,
    isOwner: role.isOwner,
    permissions: new Set(role.modulePermissions.map((p) => p.permission)),
    hiddenFieldsByEntity,
  };
}

export const SEED_ROLE_NAME_BY_USER_ROLE: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

// Looks up a tenant's seed Role id matching a legacy UserRole enum value. Used by
// tenantUserService.ts's updateTenantUser to keep User.roleId in sync whenever it still changes
// `role` (the enum) directly — until Fase I redesigns that endpoint to accept a roleId for any
// custom role directly, this is what keeps RoleContext resolution correct in the interim (roleId
// takes priority over the enum in resolveRoleContextForUser, so a stale roleId after a role change
// would silently keep someone's OLD permissions). Returns null if this tenant somehow has no seed
// roles yet (shouldn't happen post-backfill, but resolveRoleContextForUser's own fallback chain
// covers it either way).
export async function findSeedRoleId(tenantId: string, userRole: UserRole): Promise<string | null> {
  const role = await prisma.role.findUnique({
    where: { tenantId_name: { tenantId, name: SEED_ROLE_NAME_BY_USER_ROLE[userRole] } },
  });
  return role?.id ?? null;
}

// Last-resort, no-DB-write fallback used only when a User/Invitation predates the backfill
// (scripts/backfill-custom-roles.ts) — reproduces the legacy rolePermissions map (permissionService.ts)
// from the plain `role` enum, so nothing depends on the backfill having already run.
function legacyRoleContext(role: UserRole): RoleContext {
  const permissions =
    role === 'owner'
      ? [] // isOwner below already bypasses every check for 'owner'
      : role === 'admin'
        ? ADMIN_SEED_PERMISSIONS
        : MEMBER_SEED_PERMISSIONS;

  return {
    id: `legacy:${role}`,
    name: role,
    isOwner: role === 'owner',
    permissions: new Set(permissions),
    hiddenFieldsByEntity: new Map(),
  };
}

// The single entry point authenticateToken (authService.ts) calls to resolve a User's
// RoleContext. Prefers the real Role row (roleId), falls back to that tenant's seed Role matched
// by name if roleId hasn't been backfilled yet, and only falls all the way back to a synthetic,
// no-DB RoleContext (legacyRoleContext) if the tenant itself somehow has no seed roles yet (e.g.
// this environment's backfill hasn't run at all) — so authentication never breaks partway through
// this feature's rollout.
export async function resolveRoleContextForUser(user: { roleId: string | null; role: UserRole; tenantId: string | null }): Promise<RoleContext> {
  if (user.roleId) {
    return loadRoleContext(user.roleId);
  }

  if (user.tenantId) {
    const seedRole = await prisma.role.findUnique({
      where: { tenantId_name: { tenantId: user.tenantId, name: SEED_ROLE_NAME_BY_USER_ROLE[user.role] } },
    });
    if (seedRole) {
      return loadRoleContext(seedRole.id);
    }
  }

  return legacyRoleContext(user.role);
}

export function getEmployeeScope(role: RoleContext): EmployeeScope {
  if (role.isOwner || role.permissions.has(EMPLOYEE_SCOPE_ALL)) return 'all';
  if (role.permissions.has(EMPLOYEE_SCOPE_DEPARTMENT)) return 'department';
  if (role.permissions.has(EMPLOYEE_SCOPE_SELF)) return 'self';
  return 'none';
}
