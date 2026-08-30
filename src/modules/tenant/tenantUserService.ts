import prisma from '../../lib/prisma.js';
import { recordActivity } from '../activity/activityLogService.js';
import { userActivityFieldConfig, userDisplayName } from '../activity/fieldConfigs/userFieldConfig.js';
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
      status: true,
    },
    orderBy: { firstName: 'asc' },
  });
}

export interface UpdateTenantUserInput {
  role?: UserRole;
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
  actingUser: User,
  input: UpdateTenantUserInput,
): Promise<TenantUserUpdateResult> {
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target || target.tenantId !== tenantId) {
    return { success: false, error: 'User not found' };
  }

  if (target.id === actingUser.id) {
    return { success: false, error: 'Use your profile page to change your own account' };
  }

  if ((input.role === 'owner' || target.role === 'owner') && actingUser.role !== 'owner') {
    return { success: false, error: 'Only an owner can manage owner access' };
  }

  if (input.role === 'owner') {
    // A tenant can only ever have one owner. Promoting someone to owner is a
    // transfer: the acting owner is demoted to admin in the same transaction,
    // so the tenant never has zero or two owners at once.
    const targetData: { role: UserRole; status?: UserStatus } = { role: 'owner' };
    if (input.status) {
      targetData.status = input.status;
    }

    const [updatedTarget] = await prisma.$transaction([
      prisma.user.update({ where: { id: targetUserId }, data: targetData }),
      prisma.user.update({ where: { id: actingUser.id }, data: { role: 'admin' } }),
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

  const data: { role?: UserRole; status?: UserStatus } = {};
  if (input.role) {
    data.role = input.role;
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
