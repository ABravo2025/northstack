// null (not 0) on an empty array — same convention as pct() below: "0" would misleadingly imply
// a real sample that happens to average/median to zero, when there's actually no data at all.
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function avg(values: number[]): number | null {
  if (values.length === 0) return null;
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

// Every month key from `since`'s month through `until`'s month inclusive,
// oldest first — the bucketing window for every "trend by month" chart,
// driven by the tenant-picked date range instead of a fixed month count.
export function monthKeysInRange(since: Date, until: Date): string[] {
  const months: string[] = [];
  const cursor = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), 1));
  const end = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth(), 1));
  while (cursor <= end) {
    months.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

export function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 86400000;
}
