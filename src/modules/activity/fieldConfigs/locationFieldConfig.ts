import type { ActivityFieldConfigMap } from '../activityLogService.js';
import { resolveEmployeeName } from './resolvers.js';

export const locationActivityFieldConfig: ActivityFieldConfigMap = {
  name: { label: 'Name' },
  address: { label: 'Address' },
  timezone: { label: 'Time zone' },
  isActive: { label: 'Active' },
  managerEmployeeId: { label: 'Manager', resolve: resolveEmployeeName },
};
