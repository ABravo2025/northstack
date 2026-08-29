export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// null (not 0) when whole=0 — "0%" would misleadingly imply data exists and
// happens to be zero, when really there's nothing to divide.
export function pct(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Last `n` month keys ending at the reference month (inclusive), oldest first —
// shared bucketing window for every "trend by month" metric across services.
export function lastNMonthKeys(n: number, reference: Date = new Date()): string[] {
  const months: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    months.push(monthKey(new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - i, 1))));
  }
  return months;
}

// UTC first-of-month, `n` months before the reference month — the standard
// "since" bound for a last-N-months window query.
export function monthsAgoUtc(n: number, reference: Date = new Date()): Date {
  return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - n, 1));
}

export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 86400000;
}
