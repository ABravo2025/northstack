import { useOutletContext } from 'react-router-dom';
import BarChartCard, { type BarSeries } from '../../components/metrics/BarChartCard';
import StatTile from '../../components/metrics/StatTile';
import { useTenantMetrics } from '../../lib/useTenantMetrics';
import { seriesColor } from '../../lib/metricsFormat';
import { formatMoney } from '../../lib/currencies';
import type { DashboardsOutletContext } from '../../layouts/DashboardsLayout';

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

export default function DashboardsSalesPage() {
  const { token, range } = useOutletContext<DashboardsOutletContext>();
  const { metrics, loading } = useTenantMetrics(token, range);

  if (!metrics) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">Loading…</p>;

  const { sales } = metrics;
  const pipelineByCurrency = pivotByCurrency(
    Object.values(
      sales.openPipeline.reduce<Record<string, { name: string; amounts: { currency: string; amountCents: number }[] }>>((acc, p) => {
        if (!acc[p.pipelineName]) acc[p.pipelineName] = { name: p.pipelineName, amounts: [] };
        acc[p.pipelineName].amounts.push({ currency: p.currency, amountCents: p.amountCents });
        return acc;
      }, {}),
    ),
  );
  const leadSourceData = sales.leadSourceEffectiveness.map((s) => ({ name: s.name, winRatePct: s.winRatePct ?? 0 }));
  const lossReasonData = sales.lossReasons.map((r) => ({ name: r.name, count: r.count }));
  const companyGrowthData = sales.companyGrowth.byMonth.map((m) => ({ name: m.month, count: m.count }));

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Win rate"
          value={sales.winRateAndCycle.winRatePct === null ? '—' : `${sales.winRateAndCycle.winRatePct}%`}
          subtitle={`${sales.winRateAndCycle.wonCount} won / ${sales.winRateAndCycle.lostCount} lost`}
        />
        <StatTile label="Median sales cycle" value={`${sales.winRateAndCycle.cycleDaysMedian} days`} />
        <StatTile
          label="Multi-threaded deals"
          value={sales.multiThreading.multiThreadedPct === null ? '—' : `${sales.multiThreading.multiThreadedPct}%`}
          subtitle={`of ${sales.multiThreading.openCount} open`}
        />
        <StatTile
          label="Lead conversion"
          value={sales.leadConversion.conversionPct === null ? '—' : `${sales.leadConversion.conversionPct}%`}
          subtitle={`${sales.leadConversion.leadsWithOpportunity} / ${sales.leadConversion.totalLeads} leads`}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard title="Open pipeline value" data={pipelineByCurrency.data} series={pipelineByCurrency.series} valueFormatter={(v) => `$${v}`} />
        <BarChartCard title="Companies added by month" data={companyGrowthData} series={[{ key: 'count', label: 'Companies', color: seriesColor(0) }]} />
        <BarChartCard
          title="Win rate by lead source"
          data={leadSourceData}
          series={[{ key: 'winRatePct', label: 'Win rate %', color: seriesColor(1) }]}
          valueFormatter={(v) => `${v}%`}
        />
        <BarChartCard title="Loss reasons" data={lossReasonData} series={[{ key: 'count', label: 'Opportunities', color: seriesColor(7) }]} />
      </div>

      {sales.stageVelocity.byStage.length > 0 && (
        <div className="card mt-4">
          <h3 className="card-title">Stage velocity</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint dark:text-dark-ink-faint">
                <th className="pb-2 font-medium">Pipeline</th>
                <th className="pb-2 font-medium">Stage</th>
                <th className="pb-2 font-medium">Historical median</th>
                <th className="pb-2 font-medium">Sample</th>
              </tr>
            </thead>
            <tbody>
              {sales.stageVelocity.byStage.map((s) => (
                <tr key={s.stageId} className="border-t border-line-soft dark:border-dark-line-soft">
                  <td className="py-1.5 text-ink dark:text-dark-ink">{s.pipelineName}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{s.stageName}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{s.historicalMedianDays} days</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{s.sampleSize}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sales.stageVelocity.atRisk.length > 0 && (
        <div className="card mt-4">
          <h3 className="card-title">Deals at risk (over the historical median for their stage)</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint dark:text-dark-ink-faint">
                <th className="pb-2 font-medium">Opportunity</th>
                <th className="pb-2 font-medium">Stage</th>
                <th className="pb-2 font-medium">Days in stage</th>
                <th className="pb-2 font-medium">Stage median</th>
              </tr>
            </thead>
            <tbody>
              {sales.stageVelocity.atRisk.map((o) => (
                <tr key={o.opportunityId} className="border-t border-line-soft dark:border-dark-line-soft">
                  <td className="py-1.5 text-ink dark:text-dark-ink">{o.name}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{o.stageName}</td>
                  <td className="py-1.5 font-medium" style={{ color: 'var(--chart-status-critical)' }}>
                    {o.daysInStage} days
                  </td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{o.stageMedianDays} days</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sales.dealsByOwner.length > 0 && (
        <div className="card mt-4">
          <h3 className="card-title">Deals by owner</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint dark:text-dark-ink-faint">
                <th className="pb-2 font-medium">Owner</th>
                <th className="pb-2 font-medium">Open</th>
                <th className="pb-2 font-medium">Won</th>
                <th className="pb-2 font-medium">Won amount</th>
              </tr>
            </thead>
            <tbody>
              {sales.dealsByOwner.map((o) => (
                <tr key={o.ownerId} className="border-t border-line-soft dark:border-dark-line-soft">
                  <td className="py-1.5 text-ink dark:text-dark-ink">{o.ownerName}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{o.openCount}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{o.wonCount}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">
                    {o.wonAmountByCurrency.map((a) => formatMoney(a.amountCents, a.currency)).join(' + ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
