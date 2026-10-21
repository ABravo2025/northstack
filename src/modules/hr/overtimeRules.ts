// Overtime and surcharges (spec-overtime.md): pure rules, no database — tested. Each company sets its
// own rules in Payroll → Payment policies → Overtime; payrollHoursService applies them when approved
// timesheet hours are brought into a pay run.

export interface OvertimeRules {
  dailyThresholdMinutes: number | null;
  weeklyThresholdMinutes: number | null;
  weekdayPct: number;
  restPct: number;
  // Whole days paid as rest-day overtime: 0 = Sunday … 6 = Saturday.
  restWeekdays: number[];
  // Saturdays from this minute of the day on count as rest (Argentina: 13:00 = 780). Null = off.
  saturdayFromMinute: number | null;
  holidaysAreRest: boolean;
  nightPct: number;
  // Night window, wrapping midnight when start > end (21:00–06:00 = 1260–360). Null = off.
  nightStartMinute: number | null;
  nightEndMinute: number | null;
}

export type OvertimeTemplate = 'ar' | 'us' | 'custom';

export const TEMPLATES: Record<OvertimeTemplate, OvertimeRules> = {
  // Argentina, Ley de Contrato de Trabajo: 8 h a day / 48 a week; 50 % on working days, 100 % from
  // Saturday 13:00, Sundays and holidays. Night window 21–06; its surcharge is the company's call.
  ar: { dailyThresholdMinutes: 480, weeklyThresholdMinutes: 2880, weekdayPct: 50, restPct: 100, restWeekdays: [0], saturdayFromMinute: 780, holidaysAreRest: true, nightPct: 0, nightStartMinute: 1260, nightEndMinute: 360 },
  // United States, federal FLSA: time and a half over 40 hours a week. No daily rule, no rest-day or
  // night premium (some states, like California, add daily rules — entered by hand).
  us: { dailyThresholdMinutes: null, weeklyThresholdMinutes: 2400, weekdayPct: 50, restPct: 50, restWeekdays: [], saturdayFromMinute: null, holidaysAreRest: false, nightPct: 0, nightStartMinute: null, nightEndMinute: null },
  custom: { dailyThresholdMinutes: null, weeklyThresholdMinutes: null, weekdayPct: 50, restPct: 100, restWeekdays: [], saturdayFromMinute: null, holidaysAreRest: false, nightPct: 0, nightStartMinute: null, nightEndMinute: null },
};

export interface DayInput {
  date: string; // YYYY-MM-DD
  // Approved minutes that day — the number that's paid.
  minutes: number;
  holiday: boolean;
  // When it was worked, in that day's local minutes (0–1440), from the clock-in or else the shift.
  // Empty = unknown: only the hour thresholds and whole rest days apply.
  intervals: { start: number; end: number }[];
}

export interface OvertimeResult {
  regularMinutes: number;
  weekdayOvertimeMinutes: number;
  restOvertimeMinutes: number;
  nightMinutes: number;
}

const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const overlap = (a: { start: number; end: number }, from: number, to: number) => Math.max(0, Math.min(a.end, to) - Math.max(a.start, from));

function nightOf(i: { start: number; end: number }, r: OvertimeRules): number {
  if (r.nightStartMinute === null || r.nightEndMinute === null) return 0;
  if (r.nightStartMinute <= r.nightEndMinute) return overlap(i, r.nightStartMinute, r.nightEndMinute);
  return overlap(i, r.nightStartMinute, 1440) + overlap(i, 0, r.nightEndMinute);
}

// Start of the week `date` belongs to (weekStartsOn: 0 = Sunday, 1 = Monday).
export function weekStartOf(date: string, weekStartsOn: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - weekStartsOn + 7) % 7));
  return d.toISOString().slice(0, 10);
}

// Splits a period's approved minutes. Days before `countFrom` only feed the weekly total (a week that
// started in the previous period), so the same hour is never paid as overtime twice.
// Interval-based shares (rest from Saturday 13:00, night) are taken in proportion to the approved
// minutes, so logged and clocked time can differ without breaking the totals.
export function computeOvertime(days: DayInput[], rules: OvertimeRules, weekStartsOn: number, countFrom: string): OvertimeResult {
  const out: OvertimeResult = { regularMinutes: 0, weekdayOvertimeMinutes: 0, restOvertimeMinutes: 0, nightMinutes: 0 };
  const weekRegular = new Map<string, number>();
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const counts = day.date >= countFrom;
    const minutes = Math.max(0, day.minutes);
    if (minutes === 0) continue;
    const intervalTotal = day.intervals.reduce((n, i) => n + Math.max(0, i.end - i.start), 0);
    const share = (part: number) => (intervalTotal > 0 ? Math.round((minutes * Math.min(part, intervalTotal)) / intervalTotal) : 0);

    const wd = weekday(day.date);
    let rest = 0;
    if ((day.holiday && rules.holidaysAreRest) || rules.restWeekdays.includes(wd)) rest = minutes;
    else if (wd === 6 && rules.saturdayFromMinute !== null) rest = share(day.intervals.reduce((n, i) => n + overlap(i, rules.saturdayFromMinute!, 1440), 0));

    const worked = minutes - rest;
    const daily = rules.dailyThresholdMinutes !== null ? Math.max(0, worked - rules.dailyThresholdMinutes) : 0;
    let regular = worked - daily;
    let weekly = 0;
    if (rules.weeklyThresholdMinutes !== null) {
      const key = weekStartOf(day.date, weekStartsOn);
      const before = weekRegular.get(key) ?? 0;
      weekly = Math.max(0, before + regular - rules.weeklyThresholdMinutes) - Math.max(0, before - rules.weeklyThresholdMinutes);
      regular -= weekly;
      weekRegular.set(key, before + regular + weekly);
    }
    if (!counts) continue;
    out.regularMinutes += regular;
    out.weekdayOvertimeMinutes += daily + weekly;
    out.restOvertimeMinutes += rest;
    if (rules.nightPct > 0) out.nightMinutes += share(day.intervals.reduce((n, i) => n + nightOf(i, rules), 0));
  }
  return out;
}

export function parseRules(input: Record<string, unknown>): { success: true; value: OvertimeRules } | { success: false; error: string; field: string } {
  const minutesOrNull = (v: unknown, max: number) => (v === null || v === undefined || v === '' ? null : Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : NaN);
  const pct = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 500 ? (v as number) : NaN);
  const r: OvertimeRules = {
    dailyThresholdMinutes: minutesOrNull(input.dailyThresholdMinutes, 1440),
    weeklyThresholdMinutes: minutesOrNull(input.weeklyThresholdMinutes, 10080),
    weekdayPct: pct(input.weekdayPct),
    restPct: pct(input.restPct),
    restWeekdays: Array.isArray(input.restWeekdays) ? [...new Set(input.restWeekdays as unknown[])].filter((d): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6) : [],
    saturdayFromMinute: minutesOrNull(input.saturdayFromMinute, 1439),
    holidaysAreRest: input.holidaysAreRest === true,
    nightPct: pct(input.nightPct ?? 0),
    nightStartMinute: minutesOrNull(input.nightStartMinute, 1439),
    nightEndMinute: minutesOrNull(input.nightEndMinute, 1440),
  };
  for (const [field, v] of Object.entries(r)) if (typeof v === 'number' && Number.isNaN(v)) return { success: false, error: 'Check this value', field };
  if ((r.nightStartMinute === null) !== (r.nightEndMinute === null)) return { success: false, error: 'Set both ends of the night window', field: 'nightEndMinute' };
  return { success: true, value: r };
}
