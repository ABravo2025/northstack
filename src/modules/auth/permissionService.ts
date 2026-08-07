import type { UserRole } from '@prisma/client';

export const rolePermissions: Record<UserRole, string[]> = {
  owner: ['view_hr', 'create_hr', 'manage_custom_fields', 'invite_users', 'manage_users', 'manage_payroll'],
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
