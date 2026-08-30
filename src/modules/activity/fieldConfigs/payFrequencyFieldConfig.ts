import type { ActivityFieldConfigMap } from '../activityLogService.js';

export const payFrequencyActivityFieldConfig: ActivityFieldConfigMap = {
  name: { label: 'Name' },
  cadence: { label: 'Cadence' },
  dueDateOffset: { label: 'Due date offset' },
  dueDateCustomDays: { label: 'Due date custom days' },
  isActive: { label: 'Active' },
  order: { label: 'Order' },
};
