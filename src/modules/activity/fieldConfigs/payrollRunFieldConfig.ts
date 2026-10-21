import type { ActivityFieldConfigMap } from '../activityLogService.js';
import { resolvePayFrequencyName } from './resolvers.js';

export const payrollRunActivityFieldConfig: ActivityFieldConfigMap = {
  payFrequencyId: { label: 'Pay frequency', resolve: resolvePayFrequencyName },
  periodLabel: { label: 'Period' },
  status: { label: 'Status' },
  // Timesheet → Payroll: "period (people)" each time approved hours were brought in.
  hoursImport: { label: 'Hours from timesheets' },
};
