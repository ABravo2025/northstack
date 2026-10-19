import type { ActivityFieldConfigMap } from '../activityLogService.js';

// Deliberately narrow — every token column is a secret hash, and lastUsedAt is bumped on each call
// by the assistant itself, not something a person changed.
export const aiConnectionActivityFieldConfig: ActivityFieldConfigMap = {
  clientName: { label: 'Assistant' },
};
