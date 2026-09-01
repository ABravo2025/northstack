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
