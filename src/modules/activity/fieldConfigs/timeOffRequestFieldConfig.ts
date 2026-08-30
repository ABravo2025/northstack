import type { ActivityFieldConfigMap } from '../activityLogService.js';
import { resolveEmployeeName, resolveTimeOffPolicyName } from './resolvers.js';

export const timeOffRequestActivityFieldConfig: ActivityFieldConfigMap = {
  timeOffPolicyId: { label: 'Policy', resolve: resolveTimeOffPolicyName },
  startDate: { label: 'Start date' },
  endDate: { label: 'End date' },
  daysRequested: { label: 'Days requested' },
  note: { label: 'Note' },
  status: { label: 'Status' },
  approverId: { label: 'Approver', resolve: resolveEmployeeName },
  decisionNote: { label: 'Decision note' },
};
