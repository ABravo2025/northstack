import type { UserRole } from '@prisma/client';

export const rolePermissions: Record<UserRole, string[]> = {
  owner: ['view_hr', 'create_hr', 'manage_custom_fields'],
  admin: ['view_hr', 'create_hr', 'manage_custom_fields'],
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
