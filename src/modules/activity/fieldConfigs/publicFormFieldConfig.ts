import type { ActivityFieldConfigMap } from '../activityLogService.js';
import { resolvePipelineName } from './resolvers.js';

// fieldsConfig is stored as a JSON string — shown as raw JSON in the diff, same tradeoff as
// SavedView's filters/sortBy.
export const publicFormActivityFieldConfig: ActivityFieldConfigMap = {
  name: { label: 'Name' },
  slug: { label: 'Link slug' },
  fieldsConfig: { label: 'Fields' },
  thankYouMessage: { label: 'Thank-you message' },
  accessMode: { label: 'Access mode' },
  isActive: { label: 'Active' },
  pipelineId: { label: 'Pipeline', resolve: resolvePipelineName },
};
