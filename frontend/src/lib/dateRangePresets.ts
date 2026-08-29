export interface DateRange {
  since: Date;
  until: Date;
}

export type PresetKey = 'today' | 'last7' | 'last30' | 'last90' | 'mtd' | 'last6months' | 'thisYear' | 'allTime' | 'custom';

export const PRESETS: { key: Exclude<PresetKey, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'last90', label: 'Last 90 days' },
  { key: 'mtd', label: 'Month to date' },
  { key: 'last6months', label: 'Last 6 months' },
  { key: 'thisYear', label: 'This year' },
  { key: 'allTime', label: 'All time' },
];

export const DEFAULT_PRESET: Exclude<PresetKey, 'custom'> = 'last6months';

function daysAgo(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d;
}

function monthsAgo(from: Date, months: number): Date {
  return new Date(from.getFullYear(), from.getMonth() - months, from.getDate());
}

// "All time" needs a concrete lower bound (queries filter with a real Date,
// not an open-ended range) — 2020-01-01 predates this product's first
// tenant by a wide margin, so it behaves as "no lower bound" in practice.
const ALL_TIME_START = new Date(2020, 0, 1);

export function rangeForPreset(key: Exclude<PresetKey, 'custom'>, now: Date = new Date()): DateRange {
  const until = now;
  switch (key) {
    case 'today': {
      const since = new Date(now);
      since.setHours(0, 0, 0, 0);
      return { since, until };
    }
    case 'last7':
      return { since: daysAgo(now, 7), until };
    case 'last30':
      return { since: daysAgo(now, 30), until };
    case 'last90':
      return { since: daysAgo(now, 90), until };
    case 'mtd':
      return { since: new Date(now.getFullYear(), now.getMonth(), 1), until };
    case 'last6months':
      return { since: monthsAgo(now, 6), until };
    case 'thisYear':
      return { since: new Date(now.getFullYear(), 0, 1), until };
    case 'allTime':
      return { since: ALL_TIME_START, until };
  }
}

export function presetLabel(key: PresetKey): string {
  if (key === 'custom') return 'Custom range';
  return PRESETS.find((p) => p.key === key)?.label ?? 'Last 6 months';
}

export function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10);
}
