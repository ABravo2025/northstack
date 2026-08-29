// Fixed categorical order matching index.css's --chart-series-1..8 — the
// dataviz skill's validated palette. Slot order is the CVD-safety mechanism,
// never reassign per-value (e.g. by sorting) — always by stable position.
export const CHART_SERIES_COLORS = [
  'var(--chart-series-1)',
  'var(--chart-series-2)',
  'var(--chart-series-3)',
  'var(--chart-series-4)',
  'var(--chart-series-5)',
  'var(--chart-series-6)',
  'var(--chart-series-7)',
  'var(--chart-series-8)',
];

export function seriesColor(index: number): string {
  return CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length];
}

export function formatPct(pct: number | null): string {
  return pct === null ? '—' : `${pct}%`;
}

export function formatDays(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
