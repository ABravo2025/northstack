import type { ActivityFieldConfigMap } from '../activityLogService.js';
import { resolveTaskFolderName, resolveUserName } from './resolvers.js';

export const taskActivityFieldConfig: ActivityFieldConfigMap = {
  title: { label: 'Title' },
  description: { label: 'Description' },
  assigneeId: { label: 'Assignee', resolve: resolveUserName },
  dueDate: { label: 'Due date' },
  completedAt: { label: 'Completed' },
  timeSpentMinutes: { label: 'Time spent (minutes)' },
  folderId: { label: 'Folder', resolve: resolveTaskFolderName },
};
