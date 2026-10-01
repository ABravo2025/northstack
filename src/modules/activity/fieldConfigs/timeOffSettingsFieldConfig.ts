import type { ActivityFieldConfigMap } from '../activityLogService.js';

export const timeOffSettingsActivityFieldConfig: ActivityFieldConfigMap = {
  holidayCountry: { label: 'Holiday calendar' },
  workWeek: { label: 'Work week' },
  defaultDayCount: { label: 'Day counting' },
  enabledReligions: { label: 'Religious holidays' },
};
