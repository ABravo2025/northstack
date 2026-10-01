import prisma from '../../lib/prisma.js';
import type { TimeOffDayCount, TimeOffHoliday, TimeOffHolidayKind, TimeOffSettings } from '@prisma/client';
import { recordActivity } from '../activity/activityLogService.js';
import { timeOffSettingsActivityFieldConfig } from '../activity/fieldConfigs/timeOffSettingsFieldConfig.js';
import { isReligionKey, seedReligiousHolidays, type ReligionKey } from './religiousHolidays.js';
import { buildDayOffMap, type DayOff } from './timeOffRules.js';

// Settings → Time Off (2026-10): the company's holiday calendar, work week, default day counting,
// company days off and religious holidays. One TimeOffSettings row per tenant, created on first
// save; until then everything behaves as before (calendar days, no holidays).

export interface EffectiveTimeOffSettings {
  holidayCountry: string | null;
  workWeek: number[];
  defaultDayCount: TimeOffDayCount;
  enabledReligions: ReligionKey[];
}

const DEFAULTS: EffectiveTimeOffSettings = { holidayCountry: null, workWeek: [1, 2, 3, 4, 5], defaultDayCount: 'calendar', enabledReligions: [] };

function toEffective(row: TimeOffSettings | null): EffectiveTimeOffSettings {
  if (!row) return { ...DEFAULTS };
  return {
    holidayCountry: row.holidayCountry,
    workWeek: row.workWeek,
    defaultDayCount: row.defaultDayCount,
    enabledReligions: row.enabledReligions.filter(isReligionKey),
  };
}

export async function getTimeOffSettings(tenantId: string): Promise<EffectiveTimeOffSettings> {
  return toEffective(await prisma.timeOffSettings.findUnique({ where: { tenantId } }));
}

export interface UpdateTimeOffSettingsInput {
  holidayCountry?: unknown;
  workWeek?: unknown;
  defaultDayCount?: unknown;
  enabledReligions?: unknown;
}

type Result<T> = { success: true; value: T } | { success: false; error: string; field?: string };

export async function updateTimeOffSettings(
  tenantId: string,
  input: UpdateTimeOffSettingsInput,
  changedByUserId: string,
): Promise<Result<EffectiveTimeOffSettings>> {
  const data: Partial<EffectiveTimeOffSettings> = {};
  if (input.holidayCountry !== undefined) {
    if (input.holidayCountry !== null && (typeof input.holidayCountry !== 'string' || !/^[A-Z]{2}$/.test(input.holidayCountry))) {
      return { success: false, error: 'Holiday calendar must be a two-letter country code', field: 'holidayCountry' };
    }
    data.holidayCountry = input.holidayCountry as string | null;
  }
  if (input.workWeek !== undefined) {
    const days = Array.isArray(input.workWeek) ? input.workWeek : null;
    if (!days || days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return { success: false, error: 'Pick at least one working day', field: 'workWeek' };
    }
    data.workWeek = [...new Set(days as number[])].sort();
  }
  if (input.defaultDayCount !== undefined) {
    if (input.defaultDayCount !== 'calendar' && input.defaultDayCount !== 'business') {
      return { success: false, error: 'Day counting must be calendar or business', field: 'defaultDayCount' };
    }
    data.defaultDayCount = input.defaultDayCount;
  }
  if (input.enabledReligions !== undefined) {
    if (!Array.isArray(input.enabledReligions) || !input.enabledReligions.every(isReligionKey)) {
      return { success: false, error: 'Unknown religion', field: 'enabledReligions' };
    }
    data.enabledReligions = [...new Set(input.enabledReligions as ReligionKey[])];
  }

  const before = await prisma.timeOffSettings.findUnique({ where: { tenantId } });
  const saved = await prisma.timeOffSettings.upsert({
    where: { tenantId },
    create: { tenantId, ...data },
    update: data,
  });

  // A newly enabled religion gets this year's and next year's dates copied in for the owner to
  // review (only if none exist yet for that religion and year — never overwrites their edits).
  const newlyEnabled = (data.enabledReligions ?? []).filter((r) => !(before?.enabledReligions ?? []).includes(r));
  if (newlyEnabled.length > 0) {
    const thisYear = new Date().getFullYear();
    for (const religion of newlyEnabled) {
      for (const year of [thisYear, thisYear + 1]) {
        const existing = await prisma.timeOffHoliday.count({ where: { tenantId, kind: 'religious', religion, date: yearRange(year) } });
        if (existing > 0) continue;
        const seed = seedReligiousHolidays(religion, year);
        if (seed.length === 0) continue;
        await prisma.timeOffHoliday.createMany({
          data: seed.map(([date, name]) => ({ tenantId, date: new Date(`${date}T00:00:00.000Z`), name, kind: 'religious', religion, source: 'seed' })),
        });
      }
    }
  }

  await recordActivity({
    tenantId,
    entityType: 'timeOffSettings',
    entityId: saved.id,
    entityLabel: 'Time Off settings',
    action: before ? 'update' : 'create',
    changedByUserId,
    before: before ? (toEffective(before) as unknown as Record<string, unknown>) : null,
    after: toEffective(saved) as unknown as Record<string, unknown>,
    fieldConfig: timeOffSettingsActivityFieldConfig,
  });

  return { success: true, value: toEffective(saved) };
}

const yearRange = (year: number) => ({ gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) });

export async function listHolidays(tenantId: string, year: number): Promise<TimeOffHoliday[]> {
  return prisma.timeOffHoliday.findMany({ where: { tenantId, date: yearRange(year) }, orderBy: [{ date: 'asc' }, { name: 'asc' }] });
}

// ---- Nager.Date (public holidays API, free, no credentials) ----
const NAGER_BASE = 'https://date.nager.at/api/v3';

interface NagerHoliday {
  date: string;
  localName: string;
  name: string;
  types?: string[];
}

let countriesCache: { at: number; list: { countryCode: string; name: string }[] } | null = null;

export async function listHolidayCountries(): Promise<{ countryCode: string; name: string }[]> {
  if (countriesCache && Date.now() - countriesCache.at < 24 * 60 * 60 * 1000) return countriesCache.list;
  const res = await fetch(`${NAGER_BASE}/AvailableCountries`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Holiday calendars are unavailable right now (${res.status})`);
  const list = ((await res.json()) as { countryCode: string; name: string }[]).sort((a, b) => a.name.localeCompare(b.name));
  countriesCache = { at: Date.now(), list };
  return list;
}

// Replaces this calendar's previously imported rows for the year (manual rows are untouched).
// "Public" holidays become national days off; "Optional" ones become días no laborables the owner
// can choose to give off (off by default).
export async function importNationalHolidays(tenantId: string, year: number): Promise<Result<{ imported: number }>> {
  const settings = await getTimeOffSettings(tenantId);
  if (!settings.holidayCountry) return { success: false, error: 'Pick a holiday calendar first', field: 'holidayCountry' };
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { success: false, error: 'Invalid year', field: 'year' };

  let holidays: NagerHoliday[];
  try {
    const res = await fetch(`${NAGER_BASE}/PublicHolidays/${year}/${settings.holidayCountry}`, { signal: AbortSignal.timeout(8000) });
    if (res.status === 204 || res.status === 404) holidays = [];
    else if (!res.ok) return { success: false, error: `The holiday calendar service answered ${res.status}. Try again in a few minutes.` };
    else holidays = (await res.json()) as NagerHoliday[];
  } catch {
    return { success: false, error: 'Could not reach the holiday calendar service. Try again in a few minutes.' };
  }

  const rows: { date: string; name: string; kind: TimeOffHolidayKind }[] = [];
  for (const h of holidays) {
    const types = h.types ?? ['Public'];
    const kind: TimeOffHolidayKind | null = types.includes('Public') ? 'national' : types.includes('Optional') ? 'non_working' : null;
    if (kind) rows.push({ date: h.date, name: h.localName || h.name, kind });
  }
  // The same date can come twice (regional variants) — keep one row per date.
  const unique = [...new Map(rows.map((r) => [r.date, r])).values()];

  await prisma.$transaction([
    prisma.timeOffHoliday.deleteMany({ where: { tenantId, source: 'nager', countryCode: settings.holidayCountry, date: yearRange(year) } }),
    prisma.timeOffHoliday.createMany({
      data: unique.map((r) => ({
        tenantId,
        date: new Date(`${r.date}T00:00:00.000Z`),
        name: r.name,
        kind: r.kind,
        countryCode: settings.holidayCountry,
        isOff: r.kind === 'national',
        source: 'nager',
      })),
    }),
  ]);
  return { success: true, value: { imported: unique.length } };
}

export interface CreateHolidayInput {
  date?: unknown;
  name?: unknown;
  kind?: unknown;
  religion?: unknown;
}

export async function createHoliday(tenantId: string, input: CreateHolidayInput): Promise<Result<TimeOffHoliday>> {
  if (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date))) {
    return { success: false, error: 'Pick a date', field: 'date' };
  }
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return { success: false, error: 'Give the day a name', field: 'name' };
  if (name.length > 120) return { success: false, error: 'Name is too long', field: 'name' };
  const kind = input.kind;
  if (kind !== 'company' && kind !== 'religious' && kind !== 'national' && kind !== 'non_working') {
    return { success: false, error: 'Unknown kind of day off', field: 'kind' };
  }
  if (kind === 'religious' && !isReligionKey(input.religion)) return { success: false, error: 'Unknown religion', field: 'religion' };
  const settings = await getTimeOffSettings(tenantId);
  const holiday = await prisma.timeOffHoliday.create({
    data: {
      tenantId,
      date: new Date(`${input.date}T00:00:00.000Z`),
      name,
      kind,
      religion: kind === 'religious' ? (input.religion as string) : null,
      countryCode: kind === 'national' || kind === 'non_working' ? settings.holidayCountry : null,
      isOff: true,
      source: 'manual',
    },
  });
  return { success: true, value: holiday };
}

export async function updateHoliday(tenantId: string, id: string, input: { isOff?: unknown; name?: unknown }): Promise<Result<TimeOffHoliday>> {
  const existing = await prisma.timeOffHoliday.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) return { success: false, error: 'Day off not found' };
  const data: { isOff?: boolean; name?: string } = {};
  if (input.isOff !== undefined) {
    if (typeof input.isOff !== 'boolean') return { success: false, error: 'isOff must be true or false', field: 'isOff' };
    data.isOff = input.isOff;
  }
  if (input.name !== undefined) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 120) return { success: false, error: 'Give the day a name', field: 'name' };
    data.name = name;
  }
  return { success: true, value: await prisma.timeOffHoliday.update({ where: { id }, data }) };
}

export async function deleteHoliday(tenantId: string, id: string): Promise<Result<null>> {
  const existing = await prisma.timeOffHoliday.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) return { success: false, error: 'Day off not found' };
  await prisma.timeOffHoliday.delete({ where: { id } });
  return { success: true, value: null };
}

// ---- Who has which religious holidays (sensitive: HR + the person only) ----
export async function listReligionAssignments(tenantId: string): Promise<{ employeeId: string; religion: string }[]> {
  return prisma.employeeReligiousHoliday.findMany({ where: { tenantId }, select: { employeeId: true, religion: true } });
}

export async function getEmployeeReligions(tenantId: string, employeeId: string): Promise<string[]> {
  const rows = await prisma.employeeReligiousHoliday.findMany({ where: { tenantId, employeeId }, select: { religion: true } });
  return rows.map((r) => r.religion);
}

export async function setEmployeeReligions(tenantId: string, employeeId: string, religions: unknown): Promise<Result<string[]>> {
  if (!Array.isArray(religions) || !religions.every(isReligionKey)) return { success: false, error: 'Unknown religion', field: 'religions' };
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { tenantId: true } });
  if (!employee || employee.tenantId !== tenantId) return { success: false, error: 'Employee not found' };
  const unique = [...new Set(religions as string[])];
  await prisma.$transaction([
    prisma.employeeReligiousHoliday.deleteMany({ where: { tenantId, employeeId, religion: { notIn: unique } } }),
    prisma.employeeReligiousHoliday.createMany({ data: unique.map((religion) => ({ tenantId, employeeId, religion })), skipDuplicates: true }),
  ]);
  return { success: true, value: unique };
}

// The days off that apply to one person between two dates (inclusive) — used to count a
// request's days.
export async function loadDaysOffFor(tenantId: string, employeeId: string, from: Date, to: Date): Promise<{ settings: EffectiveTimeOffSettings; daysOff: Map<string, DayOff> }> {
  const [settings, holidays, religions] = await Promise.all([
    getTimeOffSettings(tenantId),
    prisma.timeOffHoliday.findMany({ where: { tenantId, date: { gte: from, lte: to } } }),
    getEmployeeReligions(tenantId, employeeId),
  ]);
  // National/non-working days only count when they belong to the calendar currently picked.
  const relevant = holidays.filter((h) => (h.kind === 'national' || h.kind === 'non_working' ? h.countryCode === settings.holidayCountry : true));
  return { settings, daysOff: buildDayOffMap(relevant, religions, settings.enabledReligions) };
}
