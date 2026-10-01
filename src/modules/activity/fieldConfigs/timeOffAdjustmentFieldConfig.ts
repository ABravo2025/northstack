import type { ActivityFieldConfigMap } from '../activityLogService.js';

export const timeOffAdjustmentActivityFieldConfig: ActivityFieldConfigMap = {
  policyName: { label: 'Policy' },
  year: { label: 'Year' },
  days: { label: 'Days' },
  reason: { label: 'Reason' },
};
