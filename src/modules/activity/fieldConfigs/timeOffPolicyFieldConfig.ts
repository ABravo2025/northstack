import type { ActivityFieldConfigMap } from '../activityLogService.js';

export const timeOffPolicyActivityFieldConfig: ActivityFieldConfigMap = {
  name: { label: 'Name' },
  color: { label: 'Color' },
  accrualMethod: { label: 'Accrual method' },
  daysPerYear: { label: 'Days per year' },
  isPaid: { label: 'Paid' },
  requiresApproval: { label: 'Requires approval' },
  isActive: { label: 'Active' },
};
