import type { ActivityFieldConfigMap } from '../activityLogService.js';
import { resolveUserName } from './resolvers.js';

export const taskActivityFieldConfig: ActivityFieldConfigMap = {
  title: { label: 'Title' },
  description: { label: 'Description' },
  assigneeId: { label: 'Assignee', resolve: resolveUserName },
  dueDate: { label: 'Due date' },
  completedAt: { label: 'Completed' },
};
