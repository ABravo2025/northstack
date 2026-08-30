import type { ActivityFieldConfigMap } from '../activityLogService.js';

// `type` is deliberately not tracked — immutable once a Pipeline is created (pipelineService.ts),
// so it never actually changes.
export const pipelineActivityFieldConfig: ActivityFieldConfigMap = {
  name: { label: 'Name' },
  order: { label: 'Order' },
  isActive: { label: 'Active' },
  assignmentMode: { label: 'Assignment mode' },
  stalledThresholdDays: { label: 'Stalled threshold (days)' },
};

export const pipelineStageActivityFieldConfig: ActivityFieldConfigMap = {
  name: { label: 'Name' },
  color: { label: 'Color' },
  order: { label: 'Order' },
  outcome: { label: 'Outcome' },
  probability: { label: 'Probability' },
  isActive: { label: 'Active' },
  notifyOwnerOnEnter: { label: 'Notify owner on enter' },
};
