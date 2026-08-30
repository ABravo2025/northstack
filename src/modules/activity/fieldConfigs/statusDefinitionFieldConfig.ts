import type { ActivityFieldConfigMap } from '../activityLogService.js';

export const statusDefinitionActivityFieldConfig: ActivityFieldConfigMap = {
  name: { label: 'Name' },
  color: { label: 'Color' },
  order: { label: 'Order' },
  isDefault: { label: 'Default' },
  isActive: { label: 'Active' },
};
