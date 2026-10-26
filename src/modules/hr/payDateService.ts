import prisma from '../../lib/prisma.js';
import type { PayFrequencyCadence } from '@prisma/client';

// Payroll v2 (2026-10-26): the real pay date of a run, from its frequency's anchor (see
// docs/spec-payroll.md Unidad 1 for anchorConfig's shapes) instead of "today". The suggestion is
// the next pay day on or after `from`; a fixed day (a weekday, the 1st/15th/last, a custom day)
// that falls on a weekend or company holiday moves to the business day before it, so people are
// never paid late; "first business day" moves forward by definition. Always editable while draft.

const DAY = 86_400_000;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function previousBusinessDay(d: Date, isBusinessDay: (d: Date) => boolean): Date {
  let x = d;
  for (let i = 0; i < 10 && !isBusinessDay(x); i++) x = new Date(x.getTime() - DAY);
  return x;
}

export function nextBusinessDay(d: Date, isBusinessDay: (d: Date) => boolean): Date {
  let x = d;
  for (let i = 0; i < 10 && !isBusinessDay(x); i++) x = new Date(x.getTime() + DAY);
  return x;
}

// Candidate pay days of one month, already moved to business days, ascending.
function payDaysOfMonth(cadence: PayFrequencyCadence, anchor: Record<string, unknown>, y: number, m: number, isBusinessDay: (d: Date) => boolean): Date[] {
  const last = lastDayOf(y, m);
  const fixed = (day: number) => previousBusinessDay(utc(y, m, Math.min(Math.max(1, day), last)), isBusinessDay);
  if (cadence === 'monthly') {
    if (anchor.preset === 'first_business_day') return [nextBusinessDay(utc(y, m, 1), isBusinessDay)];
    if (anchor.preset === 'last_business_day') return [fixed(last)];
    return [fixed(Number(anchor.day) || last)];
  }
  if (cadence === 'semimonthly') {
    if (anchor.preset === 'first_15') return [fixed(1), fixed(15)];
    if (anchor.preset === 'fifteen_last') return [fixed(15), fixed(last)];
    const days = Array.isArray(anchor.days) ? anchor.days.map(Number).filter((n) => n > 0) : [];
    return (days.length ? days : [15, last]).sort((a, b) => a - b).map(fixed);
  }
  // weekly: every matching weekday of the month
  const target = WEEKDAYS.indexOf(String(anchor.dayOfWeek ?? 'friday').toLowerCase());
  const out: Date[] = [];
  for (let d = 1; d <= last; d++) {
    const date = utc(y, m, d);
    if (date.getUTCDay() === (target < 0 ? 5 : target)) out.push(previousBusinessDay(date, isBusinessDay));
  }
  return out;
}

// Pure (tested): the first pay day on or after `from` (a UTC date at midnight).
export function suggestPayDate(cadence: PayFrequencyCadence, anchor: Record<string, unknown>, from: Date, isBusinessDay: (d: Date) => boolean): Date {
  const start = utc(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  for (let i = 0; i < 3; i++) {
    const y = start.getUTCFullYear();
    const m = start.getUTCMonth() + i;
    const found = payDaysOfMonth(cadence, anchor, y + Math.floor(m / 12), m % 12, isBusinessDay).find((d) => d.getTime() >= start.getTime());
    if (found) return found;
  }
  return start;
}

// Weekends and the company's own days off (national / non-working / company holidays; religious
// holidays are per person, so they don't move a company-wide pay day).
export async function businessDayChecker(tenantId: string, from: Date): Promise<(d: Date) => boolean> {
  const holidays = await prisma.timeOffHoliday.findMany({
    where: { tenantId, isOff: true, kind: { not: 'religious' }, date: { gte: new Date(from.getTime() - 15 * DAY), lte: new Date(from.getTime() + 100 * DAY) } },
    select: { date: true },
  });
  const off = new Set(holidays.map((h) => isoDay(h.date)));
  return (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !off.has(isoDay(d));
}

export async function suggestPayDateForFrequency(tenantId: string, payFrequencyId: string, from = new Date()): Promise<Date | null> {
  const freq = await prisma.payFrequencyDefinition.findFirst({ where: { id: payFrequencyId, tenantId } });
  if (!freq) return null;
  let anchor: Record<string, unknown> = {};
  try {
    anchor = JSON.parse(freq.anchorConfig) as Record<string, unknown>;
  } catch {
    anchor = {};
  }
  return suggestPayDate(freq.cadence, anchor, from, await businessDayChecker(tenantId, from));
}
