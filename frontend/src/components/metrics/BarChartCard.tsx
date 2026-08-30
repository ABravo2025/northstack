import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

interface BarChartCardProps {
  title: string;
  data: Record<string, string | number>[];
  series: BarSeries[];
  // seriesKey is the hovered/ticked series' `key` (e.g. a currency code for a pivotByCurrency
  // chart) — a caller whose series aren't currency-denominated can ignore the second argument.
  valueFormatter?: (value: number, seriesKey: string) => string;
  height?: number;
}

const AXIS_TICK = { fill: 'var(--chart-muted)', fontSize: 12 };

// Shared category/trend bar chart — used for both "by category" data (name on
// the x-axis: department, job title, lead source...) and "by month" trend
// data (month key on the x-axis) since both are the same shape: a categorical
// x-axis with one or more numeric series. Multiple series render as grouped
// (never stacked) bars — stacking currency series would visually blend them,
// which docs/metrics/tenant-metrics-spec.md's currency rule forbids.
export default function BarChartCard({ title, data, series, valueFormatter, height = 260 }: BarChartCardProps) {
  const formatValue = valueFormatter ?? ((v: number) => String(v));
  // The Y-axis is one shared scale across every series — for a single-series chart that's
  // unambiguous (label it in that series' unit), but for a multi-currency chart no single
  // series' formatter (e.g. one currency symbol) is correct for the whole axis, so it falls back
  // to a plain number there. The Tooltip below doesn't have this problem — each hovered bar knows
  // its own series key.
  const formatAxisTick = (v: number) => (series.length === 1 ? formatValue(v, series[0].key) : String(v));

  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      {data.length === 0 ? (
        <p className="text-xs text-ink-faint dark:text-dark-ink-faint">No data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="name" tick={AXIS_TICK} axisLine={{ stroke: 'var(--chart-axis)' }} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatAxisTick} width={56} />
            <Tooltip
              formatter={(value, _name, props) => formatValue(Number(value), String(props?.dataKey ?? series[0]?.key ?? ''))}
              contentStyle={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-line)', borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: 'var(--chart-grid)' }}
            />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={40} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
