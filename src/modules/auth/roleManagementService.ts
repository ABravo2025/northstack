import prisma from '../../lib/prisma.js';
import { DEPENDENT_PERMISSIONS, PERMISSION_PREREQUISITES, TOGGLEABLE_PERMISSION_KEYS, type ToggleablePermissionKey } from './roleService.js';

// Fase B2 (Custom Roles) — read/write for the Settings → Roles & Permissions page. Owner-only at
// the route layer (roles.ts): reconfiguring what Admin/Member can do is itself an
// ownership-level decision, so it's gated the same way ownership transfer is (a direct
// `roleContext.isOwner` check, not a grantable permission — a role should never be able to expand
// its own authority by being handed a permission that lets it edit permissions).

export interface RoleSummary {
  id: string;
  name: string;
  isOwner: boolean;
  isEditable: boolean;
  permissions: string[];
}

// "owner" is reserved so a tenant can never end up with a second role that reads as if it were
// the real Owner — case-insensitive, since "Owner"/"OWNER"/"owner" would all be equally confusing.
const RESERVED_ROLE_NAMES = new Set(['owner']);

async function findRoleByNameCaseInsensitive(tenantId: string, name: string, excludeRoleId?: string) {
  return prisma.role.findFirst({
    where: {
      tenantId,
      name: { equals: name, mode: 'insensitive' },
      ...(excludeRoleId ? { id: { not: excludeRoleId } } : {}),
    },
  });
}

export async function listRolesForTenant(tenantId: string): Promise<RoleSummary[]> {
  const roles = await prisma.role.findMany({
    where: { tenantId },
    include: { modulePermissions: true },
    orderBy: [{ isOwner: 'desc' }, { createdAt: 'asc' }],
  });

  return roles.map((role) => ({
    id: role.id,
    name: role.name,
    isOwner: role.isOwner,
    isEditable: role.isEditable,
    permissions: role.modulePermissions.map((p) => p.permission),
  }));
}

export interface SetRolePermissionResult {
  success: boolean;
  permissions?: string[];
  error?: string;
}

export async function setRolePermission(
  tenantId: string,
  roleId: string,
  permission: string,
  granted: boolean,
): Promise<SetRolePermissionResult> {
  if (!TOGGLEABLE_PERMISSION_KEYS.includes(permission as ToggleablePermissionKey)) {
    return { success: false, error: 'This permission cannot be changed from this screen' };
  }

  const role = await prisma.role.findUnique({ where: { id: roleId }, include: { modulePermissions: true } });
  if (!role || role.tenantId !== tenantId) {
    return { success: false, error: 'Role not found' };
  }
  if (role.isOwner) {
    return { success: false, error: 'Owner always has full access and cannot be changed' };
  }

  const current = new Set(role.modulePermissions.map((p) => p.permission));

  if (granted) {
    const prerequisites = PERMISSION_PREREQUISITES[permission as ToggleablePermissionKey] ?? [];
    const missing = prerequisites.filter((p) => !current.has(p));
    if (missing.length > 0) {
      return { success: false, error: `Grant ${missing.join(' and ')} first` };
    }

    await prisma.roleModulePermission.upsert({
      where: { roleId_permission: { roleId, permission } },
      create: { tenantId, roleId, permission },
      update: {},
    });
    current.add(permission);
  } else {
    // Cascade: revoking a prerequisite also revokes whatever depends on it, so the role never
    // ends up holding a dormant grant that would silently reactivate once the prerequisite comes
    // back (see DEPENDENT_PERMISSIONS's comment in roleService.ts).
    const toRevoke = [permission, ...(DEPENDENT_PERMISSIONS[permission as ToggleablePermissionKey] ?? [])];
    await prisma.roleModulePermission.deleteMany({ where: { roleId, permission: { in: toRevoke } } });
    for (const p of toRevoke) current.delete(p);
  }

  return { success: true, permissions: Array.from(current) };
}

export interface CreateRoleResult {
  success: boolean;
  role?: RoleSummary;
  error?: string;
}

// The user explicitly asked that creating a role isn't just a UI toggle exercise — the tenant
// needs to be able to make a genuinely new role, name it, and have it persist for good, not just
// reconfigure the 2 seed ones. `duplicateFromRoleId` is optional — lets a tenant start from a
// close match (e.g. "same as Admin, minus Payroll") instead of unchecking 18 boxes from a blank
// role every time. Duplicating from Owner copies every TOGGLEABLE_PERMISSION_KEYS explicitly
// (Owner itself has zero permission rows — it bypasses via isOwner — so a literal copy of its rows
// would produce an empty, misleadingly-named "based on Owner" role).
export async function createRole(tenantId: string, name: string, duplicateFromRoleId?: string): Promise<CreateRoleResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: 'Name is required' };
  }
  if (RESERVED_ROLE_NAMES.has(trimmed.toLowerCase())) {
    return { success: false, error: '"Owner" is a reserved name' };
  }
  if (await findRoleByNameCaseInsensitive(tenantId, trimmed)) {
    return { success: false, error: 'A role with this name already exists' };
  }

  let sourcePermissions: string[] = [];
  if (duplicateFromRoleId) {
    const source = await prisma.role.findUnique({ where: { id: duplicateFromRoleId }, include: { modulePermissions: true } });
    if (!source || source.tenantId !== tenantId) {
      return { success: false, error: 'Role to duplicate from not found' };
    }
    sourcePermissions = source.isOwner ? [...TOGGLEABLE_PERMISSION_KEYS] : source.modulePermissions.map((p) => p.permission);
  }

  const role = await prisma.role.create({ data: { tenantId, name: trimmed, isOwner: false, isEditable: true } });
  if (sourcePermissions.length > 0) {
    await prisma.roleModulePermission.createMany({
      data: sourcePermissions.map((permission) => ({ tenantId, roleId: role.id, permission })),
    });
  }

  return { success: true, role: { id: role.id, name: role.name, isOwner: false, isEditable: true, permissions: sourcePermissions } };
}

export interface RenameRoleResult {
  success: boolean;
  error?: string;
}

export async function renameRole(tenantId: string, roleId: string, name: string): Promise<RenameRoleResult> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: 'Name is required' };
  }
  if (RESERVED_ROLE_NAMES.has(trimmed.toLowerCase())) {
    return { success: false, error: '"Owner" is a reserved name' };
  }

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role || role.tenantId !== tenantId) {
    return { success: false, error: 'Role not found' };
  }
  if (role.isOwner || !role.isEditable) {
    return { success: false, error: 'This role cannot be renamed' };
  }
  if (await findRoleByNameCaseInsensitive(tenantId, trimmed, roleId)) {
    return { success: false, error: 'A role with this name already exists' };
  }

  await prisma.role.update({ where: { id: roleId }, data: { name: trimmed } });
  return { success: true };
}

export interface DeleteRoleResult {
  success: boolean;
  error?: string;
}

// Blocks the delete outright rather than silently reassigning affected Users/Invitations to some
// fallback role — reassignment-on-delete is a real product decision (reassign to what? Member?
// prompt the owner to choose?) that shouldn't be made implicitly inside a delete call. The owner
// moves people off the role first (Settings → Users), then deletes it.
export async function deleteRole(tenantId: string, roleId: string): Promise<DeleteRoleResult> {
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role || role.tenantId !== tenantId) {
    return { success: false, error: 'Role not found' };
  }
  if (role.isOwner || !role.isEditable) {
    return { success: false, error: 'This role cannot be deleted' };
  }

  const [userCount, invitationCount] = await Promise.all([
    prisma.user.count({ where: { roleId } }),
    prisma.invitation.count({ where: { roleId, status: 'pending' } }),
  ]);
  if (userCount > 0 || invitationCount > 0) {
    const parts: string[] = [];
    if (userCount > 0) parts.push(`${userCount} user(s)`);
    if (invitationCount > 0) parts.push(`${invitationCount} pending invitation(s)`);
    return { success: false, error: `Move ${parts.join(' and ')} to a different role first` };
  }

  await prisma.roleModulePermission.deleteMany({ where: { roleId } });
  await prisma.role.delete({ where: { id: roleId } });
  return { success: true };
}
