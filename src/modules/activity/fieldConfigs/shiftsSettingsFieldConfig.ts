import type { ActivityFieldConfigMap } from '../activityLogService.js';

export const shiftsSettingsActivityFieldConfig: ActivityFieldConfigMap = {
  requireConfirmation: { label: 'Ask people to confirm shifts' },
  remindUnanswered: { label: 'Remind people who haven\'t answered' },
  remindDayBefore: { label: 'Remind people the day before' },
  minRestHours: { label: 'Minimum rest between shifts (hours)' },
  weekStartsOn: { label: 'Week starts on' },
  timesheetEnabled: { label: 'Timesheets' },
  timesheetReminder: { label: 'Timesheet reminder' },
  showScheduleCost: { label: 'Show schedule cost' },
};
