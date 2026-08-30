import type { ActivityFieldConfigMap } from '../activityLogService.js';
import { resolvePayFrequencyName } from './resolvers.js';

export const payrollRunActivityFieldConfig: ActivityFieldConfigMap = {
  payFrequencyId: { label: 'Pay frequency', resolve: resolvePayFrequencyName },
  periodLabel: { label: 'Period' },
  status: { label: 'Status' },
};
