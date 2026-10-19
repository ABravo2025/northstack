import type { ActivityFieldConfigMap } from '../activityLogService.js';

// Deliberately narrow — only role/status (and the two-step verification state), the fields updateTenantUser (tenantUserService.ts)
// actually touches. Never add passwordHash or anything else sensitive here.
export const userActivityFieldConfig: ActivityFieldConfigMap = {
  role: { label: 'Role' },
  status: { label: 'Status' },
  // spec-2fa.md: 'on' | 'off' | 'reset' — never the secret or codes.
  twoStep: { label: 'Two-step verification' },
};

export function userDisplayName(record: { firstName: string; lastName: string }): string {
  return `${record.firstName} ${record.lastName}`;
}
