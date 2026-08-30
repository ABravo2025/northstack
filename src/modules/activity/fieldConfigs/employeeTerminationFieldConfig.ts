import type { ActivityFieldConfigMap } from '../activityLogService.js';

export const employeeTerminationActivityFieldConfig: ActivityFieldConfigMap = {
  terminationDate: { label: 'Termination date' },
  revokeAccess: { label: 'Revoke access' },
  cancelledAt: { label: 'Cancelled at' },
  executedAt: { label: 'Executed at' },
};
