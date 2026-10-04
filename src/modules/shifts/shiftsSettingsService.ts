import prisma from '../../lib/prisma.js';
import type { ShiftsSettings } from '@prisma/client';
import { recordActivity } from '../activity/activityLogService.js';
import { shiftsSettingsActivityFieldConfig } from '../activity/fieldConfigs/shiftsSettingsFieldConfig.js';

// Settings → Shifts (spec-shifts.md §1). One ShiftsSettings row per tenant, created on first save;
// until then every reader gets DEFAULTS — same "no row = defaults" approach as Time Off settings.

export interface EffectiveShiftsSettings {
  requireConfirmation: boolean;
  remindUnanswered: boolean;
  remindDayBefore: boolean;
  minRestHours: number | null;
  weekStartsOn: number;
  timesheetEnabled: boolean;
  timesheetReminder: boolean;
  showScheduleCost: boolean;
}

// Must match the @default()s on the ShiftsSettings model.
export const DEFAULT_SHIFTS_SETTINGS: EffectiveShiftsSettings = {
  requireConfirmation: true,
  remindUnanswered: true,
  remindDayBefore: true,
  minRestHours: 12,
  weekStartsOn: 1,
  timesheetEnabled: true,
  timesheetReminder: true,
  showScheduleCost: false,
};

const MAX_REST_HOURS = 48;

function toEffective(row: ShiftsSettings | null): EffectiveShiftsSettings {
  if (!row) return { ...DEFAULT_SHIFTS_SETTINGS };
  return {
    requireConfirmation: row.requireConfirmation,
    remindUnanswered: row.remindUnanswered,
    remindDayBefore: row.remindDayBefore,
    minRestHours: row.minRestHours,
    weekStartsOn: row.weekStartsOn,
    timesheetEnabled: row.timesheetEnabled,
    timesheetReminder: row.timesheetReminder,
    showScheduleCost: row.showScheduleCost,
  };
}

export async function getShiftsSettings(tenantId: string): Promise<EffectiveShiftsSettings> {
  return toEffective(await prisma.shiftsSettings.findUnique({ where: { tenantId } }));
}

export type UpdateShiftsSettingsInput = { [K in keyof EffectiveShiftsSettings]?: unknown };

type Result<T> = { success: true; value: T } | { success: false; error: string; field?: string };

const BOOLEAN_FIELDS = [
  'requireConfirmation',
  'remindUnanswered',
  'remindDayBefore',
  'timesheetEnabled',
  'timesheetReminder',
  'showScheduleCost',
] as const;

// Pure validation, exported for tests: turns untrusted input into the fields to write.
export function parseShiftsSettingsInput(input: UpdateShiftsSettingsInput): Result<Partial<EffectiveShiftsSettings>> {
  const data: Partial<EffectiveShiftsSettings> = {};
  for (const key of BOOLEAN_FIELDS) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') return { success: false, error: `${key} must be true or false`, field: key };
    data[key] = value;
  }
  if (input.minRestHours !== undefined) {
    const v = input.minRestHours;
    if (v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > MAX_REST_HOURS)) {
      return { success: false, error: `Minimum rest must be between 1 and ${MAX_REST_HOURS} hours`, field: 'minRestHours' };
    }
    data.minRestHours = v as number | null;
  }
  if (input.weekStartsOn !== undefined) {
    const v = input.weekStartsOn;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 6) {
      return { success: false, error: 'Week start must be a weekday (0 = Sunday … 6 = Saturday)', field: 'weekStartsOn' };
    }
    data.weekStartsOn = v;
  }
  return { success: true, value: data };
}

export async function updateShiftsSettings(
  tenantId: string,
  input: UpdateShiftsSettingsInput,
  changedByUserId: string,
): Promise<Result<EffectiveShiftsSettings>> {
  const parsed = parseShiftsSettingsInput(input);
  if (!parsed.success) return parsed;

  const before = await prisma.shiftsSettings.findUnique({ where: { tenantId } });
  const saved = await prisma.shiftsSettings.upsert({
    where: { tenantId },
    create: { tenantId, ...parsed.value },
    update: parsed.value,
  });

  await recordActivity({
    tenantId,
    entityType: 'shiftsSettings',
    entityId: saved.id,
    entityLabel: 'Shift settings',
    action: before ? 'update' : 'create',
    changedByUserId,
    before: before ? (toEffective(before) as unknown as Record<string, unknown>) : null,
    after: toEffective(saved) as unknown as Record<string, unknown>,
    fieldConfig: shiftsSettingsActivityFieldConfig,
  });

  return { success: true, value: toEffective(saved) };
}
