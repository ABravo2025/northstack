import prisma from '../../lib/prisma.js';
import { recordActivity } from '../activity/activityLogService.js';
import { userActivityFieldConfig, userDisplayName } from '../activity/fieldConfigs/userFieldConfig.js';
import { findSeedRoleId } from '../auth/roleService.js';
import type { AuthenticatedUser } from '../auth/authService.js';
import type { User, UserRole, UserStatus } from '@prisma/client';

export async function listTenantUsers(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      roleId: true,
      // Custom Roles Fase I — the real role name for display (CompanyUsersPage.tsx), since a
      // custom (non-seed) role assignment leaves the legacy `role` enum at its 'member' placeholder
      // (see updateTenantUser's roleId branch below) — the enum alone can't represent it anymore.
      roleRef: { select: { name: true } },
      status: true,
    },
    orderBy: { firstName: 'asc' },
  });
}

export interface UpdateTenantUserInput {
  role?: UserRole;
  roleId?: string;
  status?: UserStatus;
}

export interface TenantUserUpdateResult {
  success: boolean;
  user?: User;
  error?: string;
}

export async function updateTenantUser(
  tenantId: string,
  targetUserId: string,
  actingUser: AuthenticatedUser,
  input: UpdateTenantUserInput,
): Promise<TenantUserUpdateResult> {
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target || target.tenantId !== tenantId) {
    return { success: false, error: 'User not found' };
  }

  if (target.id === actingUser.id) {
    return { success: false, error: 'Use your profile page to change your own account' };
  }

  // Fase B (Custom Roles) — reads the resolved RoleContext instead of comparing the legacy
  // UserRole enum string; still "the owner specifically", not a named permission (same reasoning
  // as savedViewService.ts's canEditOrDelete — ownership-transfer safety isn't something a custom
  // role should ever be able to grant itself).
  if ((input.role === 'owner' || target.role === 'owner') && !actingUser.roleContext.isOwner) {
    return { success: false, error: 'Only an owner can manage owner access' };
  }

  if (input.role === 'owner') {
    // A tenant can only ever have one owner. Promoting someone to owner is a
    // transfer: the acting owner is demoted to admin in the same transaction,
    // so the tenant never has zero or two owners at once.
    // roleId is kept in sync alongside the enum (Fase B, Custom Roles) — see findSeedRoleId's
    // comment for why this matters.
    const [ownerRoleId, adminRoleId] = await Promise.all([
      findSeedRoleId(tenantId, 'owner'),
      findSeedRoleId(tenantId, 'admin'),
    ]);
    const targetData: { role: UserRole; roleId: string | null; status?: UserStatus } = {
      role: 'owner',
      roleId: ownerRoleId,
    };
    if (input.status) {
      targetData.status = input.status;
    }

    const [updatedTarget] = await prisma.$transaction([
      prisma.user.update({ where: { id: targetUserId }, data: targetData }),
      prisma.user.update({ where: { id: actingUser.id }, data: { role: 'admin', roleId: adminRoleId } }),
    ]);

    await recordActivity({
      tenantId,
      entityType: 'user',
      entityId: targetUserId,
      entityLabel: userDisplayName(updatedTarget),
      action: 'update',
      changedByUserId: actingUser.id,
      before: target,
      after: updatedTarget,
      fieldConfig: userActivityFieldConfig,
    });

    return { success: true, user: updatedTarget };
  }

  const data: { role?: UserRole; roleId?: string | null; status?: UserStatus } = {};
  if (input.roleId) {
    // Custom Roles Fase I — assigning any tenant role (seed or genuinely custom) directly by id,
    // not just the 3 legacy enum values. The legacy `role` column can't represent a custom role
    // name, so it's set to the least-privileged placeholder ('member') — purely cosmetic from here
    // on, since resolveRoleContextForUser always prefers roleId when present. Ownership itself
    // stays out of reach of this path: it can only move via the atomic transfer branch above.
    const targetRole = await prisma.role.findUnique({ where: { id: input.roleId } });
    if (!targetRole || targetRole.tenantId !== tenantId) {
      return { success: false, error: 'Role not found' };
    }
    if (targetRole.isOwner) {
      return { success: false, error: 'Use the ownership transfer action to grant Owner' };
    }
    data.role = 'member';
    data.roleId = targetRole.id;
  } else if (input.role) {
    data.role = input.role;
    // roleId kept in sync alongside the enum (Fase B, Custom Roles) — see findSeedRoleId's comment.
    data.roleId = await findSeedRoleId(tenantId, input.role);
  }
  if (input.status) {
    data.status = input.status;
  }

  const updated = await prisma.user.update({ where: { id: targetUserId }, data });

  await recordActivity({
    tenantId,
    entityType: 'user',
    entityId: targetUserId,
    entityLabel: userDisplayName(updated),
    action: 'update',
    changedByUserId: actingUser.id,
    before: target,
    after: updated,
    fieldConfig: userActivityFieldConfig,
  });

  return { success: true, user: updated };
}
