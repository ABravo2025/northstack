import type { ActivityFieldConfigMap } from '../activityLogService.js';

// fieldType is deliberately not tracked — customFieldService.ts never allows it to be edited after
// creation (a type change could orphan already-saved values), so it never actually changes.
export const customFieldDefinitionActivityFieldConfig: ActivityFieldConfigMap = {
  name: { label: 'Name' },
  required: { label: 'Required' },
  options: { label: 'Options' },
  isActive: { label: 'Active' },
};
