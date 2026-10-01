import type { TimeOffAccrualMethod, TimeOffDayCount, TimeOffHolidayKind, TimeOffPolicyDayCount, TimeOffUnusedAction } from '@prisma/client';

// Pure math behind the Time Off company rules (2026-10): how many days a request takes, what a
// person can still ask for, and what happens to unused days when a year ends. No database access
// here — the services load the data and call these, so the rules are unit-testable on their own.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Dates are calendar days. Request dates arrive as UTC midnight and holidays are @db.Date, so all
// day arithmetic stays in UTC to avoid a timezone shifting "Oct 13" into "Oct 12".
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface DayOff {
  kind: TimeOffHolidayKind;
  name: string;
}

export interface HolidayRow {
  date: Date;
  name: string;
  kind: TimeOffHolidayKind;
  religion: string | null;
  isOff: boolean;
}

// The days off that apply to ONE person: national holidays, the días no laborables the company
// gives off, company days off, and the religious holidays of the religions this person has (and
// the company has enabled).
export function buildDayOffMap(holidays: HolidayRow[], personReligions: string[], enabledReligions: string[]): Map<string, DayOff> {
  const map = new Map<string, DayOff>();
  const mine = new Set(personReligions.filter((r) => enabledReligions.includes(r)));
  for (const h of holidays) {
    if (h.kind === 'non_working' && !h.isOff) continue;
    if (h.kind === 'religious' && (!h.religion || !mine.has(h.religion))) continue;
    const key = isoDay(h.date);
    if (!map.has(key)) map.set(key, { kind: h.kind, name: h.name });
  }
  return map;
}

export function resolveDayCount(policyDayCount: TimeOffPolicyDayCount, companyDefault: TimeOffDayCount): TimeOffDayCount {
  return policyDayCount === 'inherit' ? companyDefault : policyDayCount;
}

export interface ExcludedDay {
  date: string;
  reason: 'non_working_weekday' | TimeOffHolidayKind;
  name: string | null;
}

export interface DayCountResult {
  days: number;
  excluded: ExcludedDay[];
}

// calendar: every day from start to end counts (the original behavior). business: skips weekdays
// outside the company's work week and the person's days off.
export function countRequestDays(
  start: Date,
  end: Date,
  mode: TimeOffDayCount,
  workWeek: number[],
  daysOff: Map<string, DayOff>,
): DayCountResult {
  const excluded: ExcludedDay[] = [];
  let days = 0;
  const total = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  for (let i = 0; i < total; i++) {
    const day = new Date(start.getTime() + i * MS_PER_DAY);
    if (mode === 'business') {
      if (!workWeek.includes(day.getUTCDay())) {
        excluded.push({ date: isoDay(day), reason: 'non_working_weekday', name: null });
        continue;
      }
      const off = daysOff.get(isoDay(day));
      if (off) {
        excluded.push({ date: isoDay(day), reason: off.kind, name: off.name });
        continue;
      }
    }
    days++;
  }
  return { days, excluded };
}

// Whole calendar months completed since `start`, as of `now` — e.g. assigned Jan 15, now Feb 10
// → 0; now Feb 20 → 1. Monthly accrual grants a month's worth as soon as the month begins, so the
// caller adds 1.
function monthsElapsed(start: Date, now: Date): number {
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

// Days granted for `year` as of `asOf` (pass Dec 31 of the year for the full-year amount).
export function allocatedDays(
  accrualMethod: TimeOffAccrualMethod,
  daysPerYear: number,
  assignedAt: Date,
  year: number,
  asOf: Date,
): number {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);
  const at = asOf > yearEnd ? yearEnd : asOf;
  if (assignedAt > yearEnd) return 0;
  if (accrualMethod === 'fixed_annual') return daysPerYear;
  const accrualStart = assignedAt > yearStart ? assignedAt : yearStart;
  if (accrualStart > at) return 0;
  const months = Math.min(12, monthsElapsed(accrualStart, at) + 1);
  return round2((daysPerYear / 12) * months);
}

export interface BalanceInput {
  accrualMethod: TimeOffAccrualMethod;
  daysPerYear: number;
  assignedAt: Date;
  allowAdvance: boolean;
  year: number;
  now: Date;
  used: number;
  pending: number;
  carriedIn: number;
  adjusted: number;
}

export interface BalanceNumbers {
  // Granted so far this year (accrual), and what the full year will grant.
  allocated: number;
  fullYear: number;
  // What the person can use with what's already accrued (never shown below 0).
  available: number;
  // The most a new request can take: same as `available`, or — when the policy allows asking in
  // advance — up to the full year's total. Balances never go negative, so this is the hard cap.
  maxRequestable: number;
}

export function computeBalance(input: BalanceInput): BalanceNumbers {
  const yearEndDate = new Date(input.year, 11, 31, 23, 59, 59);
  const allocated = allocatedDays(input.accrualMethod, input.daysPerYear, input.assignedAt, input.year, input.now);
  const fullYear = allocatedDays(input.accrualMethod, input.daysPerYear, input.assignedAt, input.year, yearEndDate);
  const base = input.carriedIn + input.adjusted - input.used - input.pending;
  const available = round2(Math.max(0, allocated + base));
  const ceiling = input.allowAdvance && input.accrualMethod === 'monthly' ? fullYear : allocated;
  const maxRequestable = round2(Math.max(0, ceiling + base));
  return { allocated, fullYear, available, maxRequestable };
}

export interface YearCloseNumbers {
  unusedDays: number;
  carriedDays: number;
  expiredDays: number;
}

// Dec 31: whatever wasn't used is recorded, then carried into the next year (up to carryOverMax,
// when set) or expired, as the policy says.
export function closeYear(
  fullYear: number,
  carriedIn: number,
  adjusted: number,
  used: number,
  unusedAction: TimeOffUnusedAction,
  carryOverMax: number | null,
): YearCloseNumbers {
  const unusedDays = round2(Math.max(0, fullYear + carriedIn + adjusted - used));
  const carriedDays = unusedAction === 'carry' ? round2(carryOverMax == null ? unusedDays : Math.min(unusedDays, carryOverMax)) : 0;
  return { unusedDays, carriedDays, expiredDays: round2(unusedDays - carriedDays) };
}
