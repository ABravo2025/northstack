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

// The 10 permission keys that reproduce today's rolePermissions map (permissionService.ts)
// exactly, PLUS the Employee-only conventions above. This is the full allowlist a future
// role-editing endpoint (Fase H) validates incoming permission strings against — kept here rather
// than duplicated in permissionService.ts since both files need it and this one has no reverse
// dependency on that one.
export const PERMISSION_KEYS = [
  'view_hr',
  'create_hr',
  'manage_custom_fields',
  'invite_users',
  'manage_users',
  'manage_payroll',
  'manage_billing',
  'manage_payments',
  'view_sales_leaderboard',
  'view_activity_log',
  VIEW_EMPLOYEE_CUSTOM_FIELDS,
  EDIT_EMPLOYEE_CUSTOM_FIELDS,
  ...EMPLOYEE_SCOPE_PERMISSIONS,
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export interface RoleContext {
  id: string;
  name: string;
  isOwner: boolean;
  permissions: Set<string>;
  hiddenFieldsByEntity: Map<ActivityEntityType, Set<string>>;
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
// EMPLOYEE_SCOPE_ALL and VIEW_EMPLOYEE_CUSTOM_FIELDS (both roles can read Employee custom fields
// today) and EDIT_EMPLOYEE_CUSTOM_FIELDS for Admin only (only owner/admin can write custom field
// values today, via manage_custom_fields) — defaulted this way so nothing regresses the moment
// their enforcement actually ships (Fase D/E), even though nothing reads these two yet. Owner
// gets isOwner=true and zero RoleModulePermission rows — it bypasses every check structurally
// (see RoleContext.isOwner), by design never has restrictable rows.
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
    data: [
      'view_hr',
      'create_hr',
      'manage_custom_fields',
      'invite_users',
      'manage_users',
      'view_activity_log',
      VIEW_EMPLOYEE_CUSTOM_FIELDS,
      EDIT_EMPLOYEE_CUSTOM_FIELDS,
      EMPLOYEE_SCOPE_ALL,
    ].map((permission) => ({ tenantId, roleId: admin.id, permission })),
  });

  const member = await tx.role.create({ data: { tenantId, name: 'Member' } });
  await tx.roleModulePermission.createMany({
    data: ['view_hr', VIEW_EMPLOYEE_CUSTOM_FIELDS, EMPLOYEE_SCOPE_ALL].map((permission) => ({
      tenantId,
      roleId: member.id,
      permission,
    })),
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

const SEED_ROLE_NAME_BY_USER_ROLE: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

// Last-resort, no-DB-write fallback used only when a User/Invitation predates the backfill
// (scripts/backfill-custom-roles.ts) — reproduces the legacy rolePermissions map (permissionService.ts)
// from the plain `role` enum, so nothing depends on the backfill having already run.
function legacyRoleContext(role: UserRole): RoleContext {
  const permissions =
    role === 'owner'
      ? [] // isOwner below already bypasses every check for 'owner'
      : role === 'admin'
        ? ['view_hr', 'create_hr', 'manage_custom_fields', 'invite_users', 'manage_users', 'view_activity_log', VIEW_EMPLOYEE_CUSTOM_FIELDS, EDIT_EMPLOYEE_CUSTOM_FIELDS, EMPLOYEE_SCOPE_ALL]
        : ['view_hr', VIEW_EMPLOYEE_CUSTOM_FIELDS, EMPLOYEE_SCOPE_ALL];

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
