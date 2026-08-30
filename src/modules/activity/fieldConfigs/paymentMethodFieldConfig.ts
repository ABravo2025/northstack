import type { ActivityFieldConfigMap } from '../activityLogService.js';

export const paymentMethodActivityFieldConfig: ActivityFieldConfigMap = {
  name: { label: 'Name' },
  isActive: { label: 'Active' },
  order: { label: 'Order' },
};
