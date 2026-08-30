import type { ActivityFieldConfigMap } from '../activityLogService.js';

// Deliberately narrow — only role/status, the 2 fields updateTenantUser (tenantUserService.ts)
// actually touches. Never add passwordHash or anything else sensitive here.
export const userActivityFieldConfig: ActivityFieldConfigMap = {
  role: { label: 'Role' },
  status: { label: 'Status' },
};

export function userDisplayName(record: { firstName: string; lastName: string }): string {
  return `${record.firstName} ${record.lastName}`;
}
