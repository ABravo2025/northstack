import { useOutletContext } from 'react-router-dom';
import BarChartCard, { type BarSeries } from '../../components/metrics/BarChartCard';
import StatTile from '../../components/metrics/StatTile';
import { useTenantMetrics } from '../../lib/useTenantMetrics';
import { seriesColor } from '../../lib/metricsFormat';
import { formatMoney } from '../../lib/currencies';
import type { DashboardsOutletContext } from '../../layouts/DashboardsLayout';

// Pivots a list of {currency, amountCents} groups, one per x-axis bucket
// (period or type), into Recharts rows — one column per currency, so
// multi-currency amounts render as grouped bars, never summed together.
function pivotByCurrency(buckets: { name: string; amounts: { currency: string; amountCents: number }[] }[]) {
  const currencies = [...new Set(buckets.flatMap((b) => b.amounts.map((a) => a.currency)))];
  const data = buckets.map((b) => {
    const row: Record<string, string | number> = { name: b.name };
    for (const a of b.amounts) row[a.currency] = a.amountCents / 100;
    return row;
  });
  const series: BarSeries[] = currencies.map((currency, i) => ({ key: currency, label: currency, color: seriesColor(i) }));
  return { data, series };
}

export default function DashboardsPayrollPage() {
  const { token, range } = useOutletContext<DashboardsOutletContext>();
  const { metrics, loading } = useTenantMetrics(token, range);

  if (!metrics) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">Loading…</p>;
  if (!metrics.payroll) {
    return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">Payroll data is only visible to the workspace owner.</p>;
  }

  const { payroll } = metrics;
  const costByPeriod = pivotByCurrency(payroll.costByPeriod.map((p) => ({ name: p.month, amounts: p.byCurrency })));
  const typeGroups = new Map<string, { currency: string; amountCents: number }[]>();
  for (const t of payroll.costByType) {
    if (!typeGroups.has(t.type)) typeGroups.set(t.type, []);
    typeGroups.get(t.type)!.push({ currency: t.currency, amountCents: t.amountCents });
  }
  const costByType = pivotByCurrency([...typeGroups].map(([name, amounts]) => ({ name, amounts })));

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Contract confirmation"
          value={payroll.contractConfirmation.ratePct === null ? '—' : `${payroll.contractConfirmation.ratePct}%`}
          subtitle={`${payroll.contractConfirmation.confirmed} / ${payroll.contractConfirmation.total}`}
        />
        <StatTile label="Off-cycle payments" value={String(payroll.offCycle.count)} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard title="Payroll cost by month" data={costByPeriod.data} series={costByPeriod.series} valueFormatter={(v) => `$${v}`} />
        <BarChartCard title="Cost by type" data={costByType.data} series={costByType.series} valueFormatter={(v) => `$${v}`} />
      </div>
      {payroll.compensationByDepartment.length > 0 && (
        <div className="card mt-4">
          <h3 className="card-title">Compensation by department</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint dark:text-dark-ink-faint">
                <th className="pb-2 font-medium">Department</th>
                <th className="pb-2 font-medium">Type</th>
                <th className="pb-2 font-medium">Median</th>
                <th className="pb-2 font-medium">Avg</th>
                <th className="pb-2 font-medium">Sample</th>
              </tr>
            </thead>
            <tbody>
              {payroll.compensationByDepartment.map((c, i) => (
                <tr key={i} className="border-t border-line-soft dark:border-dark-line-soft">
                  <td className="py-1.5 text-ink dark:text-dark-ink">{c.departmentName}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{c.compensationType}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{formatMoney(c.medianRateCents, c.currency)}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{formatMoney(c.avgRateCents, c.currency)}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{c.sampleSize}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
