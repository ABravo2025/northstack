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

// Pivots a list of {currency, amountCents} groups, one per x-axis bucket (period or type), into
// Recharts rows — one column per currency, so multi-currency amounts render as grouped bars,
// never summed together. Shared by DashboardsSalesPage and DashboardsPayrollPage.
export interface CurrencyPivotBucket {
  name: string;
  amounts: { currency: string; amountCents: number }[];
}

export interface CurrencyPivotSeries {
  key: string;
  label: string;
  color: string;
}

export function pivotByCurrency(buckets: CurrencyPivotBucket[]): {
  data: Record<string, string | number>[];
  series: CurrencyPivotSeries[];
} {
  const currencies = [...new Set(buckets.flatMap((b) => b.amounts.map((a) => a.currency)))];
  const data = buckets.map((b) => {
    const row: Record<string, string | number> = { name: b.name };
    for (const a of b.amounts) row[a.currency] = a.amountCents / 100;
    return row;
  });
  const series = currencies.map((currency, i) => ({ key: currency, label: currency, color: seriesColor(i) }));
  return { data, series };
}
