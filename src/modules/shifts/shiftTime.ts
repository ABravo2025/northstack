// Shifts module — local wall-clock ↔ UTC conversion (spec-shifts.md §1). A shift is typed and shown
// in its location's timezone ("Tuesday 22:00 → 06:00 in Buenos Aires"), but overlap/rest checks
// and ordering compare UTC instants. Built on Intl alone (no date library in the project), and it
// resolves DST correctly: the offset is taken at the target instant, not at "now".

export const MINUTES_PER_DAY = 24 * 60;
const MS_PER_MINUTE = 60_000;

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function isValidMinute(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < MINUTES_PER_DAY;
}

// "YYYY-MM-DD" strictly, and a real calendar date (no 2026-02-30).
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Wall-clock fields of `instant` as seen in `timeZone`.
export function zonedParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

// How far `timeZone` is ahead of UTC at `instant`, in minutes (Buenos Aires = -180).
export function offsetMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asIfUtc - Math.floor(instant.getTime() / 1000) * 1000) / MS_PER_MINUTE);
}

// The UTC instant at which the wall clock in `timeZone` reads `date` + `minute`. A wall time that
// doesn't exist (the hour skipped by a DST jump) lands just after the jump, which is what a person
// standing at the location would experience.
export function zonedToUtc(date: string, minute: number, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minute);
  // The offset at the first guess can differ from the offset at the answer when a DST change falls
  // between them, so try both offsets and keep the one that really reads as the requested time.
  const first = wall - offsetMinutes(new Date(wall), timeZone) * MS_PER_MINUTE;
  const second = wall - offsetMinutes(new Date(first), timeZone) * MS_PER_MINUTE;
  for (const candidate of [first, second]) {
    const p = zonedParts(new Date(candidate), timeZone);
    if (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) === wall) return new Date(candidate);
  }
  // Neither does: the time falls in a spring-forward gap. The later candidate is the one after the jump.
  return new Date(Math.max(first, second));
}

// endMinute <= startMinute means the shift ends the next day (22:00 → 06:00).
export function endsNextDay(startMinute: number, endMinute: number): boolean {
  return endMinute <= startMinute;
}

export function shiftDurationMinutes(startMinute: number, endMinute: number): number {
  return endsNextDay(startMinute, endMinute) ? endMinute + MINUTES_PER_DAY - startMinute : endMinute - startMinute;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function shiftInstants(
  date: string,
  startMinute: number,
  endMinute: number,
  timeZone: string,
): { startsAt: Date; endsAt: Date } {
  const endDate = endsNextDay(startMinute, endMinute) ? addDays(date, 1) : date;
  return {
    startsAt: zonedToUtc(date, startMinute, timeZone),
    endsAt: zonedToUtc(endDate, endMinute, timeZone),
  };
}

// The local calendar day `instant` falls on in `timeZone`, as "YYYY-MM-DD" — e.g. "what is
// tomorrow at this location" for the daily reminder cron.
export function zonedDateString(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

// 420 → "07:00". For emails and .ics summaries; the frontend formats on its own.
export function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

// Two half-open ranges [aStart, aEnd) and [bStart, bEnd) overlap. Back-to-back (one ends exactly
// when the next starts) is not an overlap.
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}
