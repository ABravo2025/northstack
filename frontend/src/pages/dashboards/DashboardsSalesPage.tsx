import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BarChartCard from '../../components/metrics/BarChartCard';
import StatTile from '../../components/metrics/StatTile';
import { useTenantMetrics } from '../../lib/useTenantMetrics';
import { pivotByCurrency, seriesColor } from '../../lib/metricsFormat';
import { formatMoney } from '../../lib/currencies';
import type { DashboardsOutletContext } from '../../layouts/DashboardsLayout';

export default function DashboardsSalesPage() {
  const { t } = useTranslation('dashboards');
  const { token, range } = useOutletContext<DashboardsOutletContext>();
  const { metrics, loading } = useTenantMetrics(token, range);

  if (!metrics) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('common.loading')}</p>;
  if (!metrics.sales) {
    return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('common.notVisibleToRole')}</p>;
  }

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
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label={t('sales.winRate')}
          value={sales.winRateAndCycle.winRatePct === null ? '—' : `${sales.winRateAndCycle.winRatePct}%`}
          subtitle={t('sales.wonLostSubtitle', { won: sales.winRateAndCycle.wonCount, lost: sales.winRateAndCycle.lostCount })}
        />
        <StatTile
          label={t('sales.medianSalesCycle')}
          value={sales.winRateAndCycle.cycleDaysMedian === null ? '—' : t('common.daysValue', { count: sales.winRateAndCycle.cycleDaysMedian })}
          subtitle={t('common.sampleSubtitle', { count: sales.winRateAndCycle.cycleSampleSize })}
        />
        <StatTile
          label={t('sales.multiThreadedDeals')}
          value={sales.multiThreading.multiThreadedPct === null ? '—' : `${sales.multiThreading.multiThreadedPct}%`}
          subtitle={t('sales.ofOpenSubtitle', { count: sales.multiThreading.openCount })}
        />
        <StatTile
          label={t('sales.leadConversion')}
          value={sales.leadConversion.conversionPct === null ? '—' : `${sales.leadConversion.conversionPct}%`}
          subtitle={t('sales.leadsSubtitle', { withOpportunity: sales.leadConversion.leadsWithOpportunity, total: sales.leadConversion.totalLeads })}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard
          title={t('sales.chartOpenPipelineValue')}
          data={pipelineByCurrency.data}
          series={pipelineByCurrency.series}
          valueFormatter={(v, currency) => formatMoney(v * 100, currency)}
        />
        <BarChartCard
          title={t('sales.chartCompaniesAddedByMonth')}
          data={companyGrowthData}
          series={[{ key: 'count', label: t('sales.seriesCompanies'), color: seriesColor(0) }]}
        />
        <BarChartCard
          title={t('sales.chartWinRateByLeadSource')}
          data={leadSourceData}
          series={[{ key: 'winRatePct', label: t('sales.seriesWinRatePct'), color: seriesColor(1) }]}
          valueFormatter={(v) => `${v}%`}
        />
        <BarChartCard
          title={t('sales.chartLossReasons')}
          data={lossReasonData}
          series={[{ key: 'count', label: t('sales.seriesOpportunities'), color: seriesColor(7) }]}
        />
      </div>

      {sales.stageVelocity.byStage.length > 0 && (
        <div className="card mt-4">
          <h3 className="card-title">{t('sales.stageVelocity')}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint dark:text-dark-ink-faint">
                <th className="pb-2 font-medium">{t('sales.colPipeline')}</th>
                <th className="pb-2 font-medium">{t('sales.colStage')}</th>
                <th className="pb-2 font-medium">{t('sales.colHistoricalMedian')}</th>
                <th className="pb-2 font-medium">{t('sales.colSample')}</th>
              </tr>
            </thead>
            <tbody>
              {sales.stageVelocity.byStage.map((s) => (
                <tr key={s.stageId} className="border-t border-line-soft dark:border-dark-line-soft">
                  <td className="py-1.5 text-ink dark:text-dark-ink">{s.pipelineName}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{s.stageName}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{t('common.daysValue', { count: s.historicalMedianDays })}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{s.sampleSize}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sales.stageVelocity.atRisk.length > 0 && (
        <div className="card mt-4">
          <h3 className="card-title">{t('sales.dealsAtRisk')}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint dark:text-dark-ink-faint">
                <th className="pb-2 font-medium">{t('sales.colOpportunity')}</th>
                <th className="pb-2 font-medium">{t('sales.colStage')}</th>
                <th className="pb-2 font-medium">{t('sales.colDaysInStage')}</th>
                <th className="pb-2 font-medium">{t('sales.colStageMedian')}</th>
              </tr>
            </thead>
            <tbody>
              {sales.stageVelocity.atRisk.map((o) => (
                <tr key={o.opportunityId} className="border-t border-line-soft dark:border-dark-line-soft">
                  <td className="py-1.5 text-ink dark:text-dark-ink">{o.name}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{o.stageName}</td>
                  <td className="py-1.5 font-medium" style={{ color: 'var(--chart-status-critical)' }}>
                    {t('common.daysValue', { count: o.daysInStage })}
                  </td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{t('common.daysValue', { count: o.stageMedianDays })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sales.dealsByOwner.length > 0 && (
        <div className="card mt-4">
          <h3 className="card-title">{t('sales.dealsByOwner')}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint dark:text-dark-ink-faint">
                <th className="pb-2 font-medium">{t('sales.colOwner')}</th>
                <th className="pb-2 font-medium">{t('sales.colOpen')}</th>
                <th className="pb-2 font-medium">{t('sales.colWon')}</th>
                <th className="pb-2 font-medium">{t('sales.colWonAmount')}</th>
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
