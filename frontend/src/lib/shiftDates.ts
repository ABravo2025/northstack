// Shifts module — calendar-day math on "YYYY-MM-DD" strings. Shift days are the location's local
// day, not the viewer's, so everything stays as plain day strings computed in UTC; nothing here
// converts through the browser's own time zone except todayString().

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// The first day of the week containing `date`, given the company's week start (0 = Sunday).
export function weekStartOf(date: string, weekStartsOn: number): string {
  return addDays(date, -((weekdayOf(date) - weekStartsOn + 7) % 7));
}

export function weekDays(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

// The viewer's own calendar day — only used to pick which week to open and to mark "today".
export function todayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

// "07:30" (an <input type="time"> value) → 450. null for anything else.
export function parseTimeInput(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const minute = Number(m[1]) * 60 + Number(m[2]);
  return minute >= 0 && minute < 1440 ? minute : null;
}

export function shiftDurationMinutes(startMinute: number, endMinute: number): number {
  return endMinute <= startMinute ? endMinute + 1440 - startMinute : endMinute - startMinute;
}

// 270 → "4h 30m", 480 → "8h".
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const localeTag = (lng: string) => (lng.startsWith('es') ? 'es-AR' : 'en-US');

export function formatDay(date: string, lng: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(localeTag(lng), { ...opts, timeZone: 'UTC' });
}

// "Oct 12 – Oct 18, 2026" / "12 oct – 18 oct 2026". (Intl's formatRange would be nicer but isn't in
// this project's TypeScript lib target.)
export function formatWeekRange(weekStart: string, lng: string): string {
  const end = addDays(weekStart, 6);
  const start = formatDay(weekStart, lng, { day: 'numeric', month: 'short' });
  return `${start} – ${formatDay(end, lng, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
