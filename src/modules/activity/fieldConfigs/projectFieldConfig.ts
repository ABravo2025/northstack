import type { ActivityFieldConfigMap } from '../activityLogService.js';
import { resolveCompanyName, resolveEmployeeName } from './resolvers.js';

// `team` isn't a Project column — projectService.ts passes a synthetic "names, comma-separated"
// value in before/after when someone joins or leaves, so team changes read as one ordinary field
// change ("Changed Team: Ana, Luis → Ana, Luis, Sofía") instead of needing an entity type of their own.
export const projectActivityFieldConfig: ActivityFieldConfigMap = {
  name: { label: 'Name' },
  description: { label: 'Description' },
  companyId: { label: 'Company', resolve: resolveCompanyName },
  ownerEmployeeId: { label: 'Owner', resolve: resolveEmployeeName },
  status: { label: 'Status' },
  startDate: { label: 'Start date' },
  dueDate: { label: 'Due date' },
  isActive: { label: 'Active' },
  team: { label: 'Team' },
};

export const projectPhaseActivityFieldConfig: ActivityFieldConfigMap = {
  name: { label: 'Name' },
  color: { label: 'Color' },
  order: { label: 'Order' },
};
