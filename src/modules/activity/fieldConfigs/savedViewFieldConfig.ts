import type { ActivityFieldConfigMap } from '../activityLogService.js';

// filters/sortBy are stored as JSON strings — shown as raw JSON in the diff (low readability, but
// not worth building a human-readable filter-description renderer just for an audit log entry).
export const savedViewActivityFieldConfig: ActivityFieldConfigMap = {
  name: { label: 'Name' },
  type: { label: 'Type' },
  visibility: { label: 'Visibility' },
  filters: { label: 'Filters' },
  sortBy: { label: 'Sort' },
  groupByField: { label: 'Group by' },
};
