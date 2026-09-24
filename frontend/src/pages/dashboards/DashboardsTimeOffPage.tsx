import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BarChartCard from '../../components/metrics/BarChartCard';
import StatTile from '../../components/metrics/StatTile';
import { useTenantMetrics } from '../../lib/useTenantMetrics';
import { seriesColor } from '../../lib/metricsFormat';
import type { DashboardsOutletContext } from '../../layouts/DashboardsLayout';

export default function DashboardsTimeOffPage() {
  const { t } = useTranslation('dashboards');
  const { token, range } = useOutletContext<DashboardsOutletContext>();
  const { metrics, loading } = useTenantMetrics(token, range);

  if (!metrics) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('common.loading')}</p>;
  if (!metrics.timeOff) {
    return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('common.notVisibleToRole')}</p>;
  }

  const { timeOff } = metrics;
  const byPolicy = timeOff.byPolicy.map((p) => ({ name: p.name, days: p.totalDays }));

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label={t('timeOff.approvalRate')}
          value={timeOff.approval.approvalRatePct === null ? '—' : `${timeOff.approval.approvalRatePct}%`}
          subtitle={t('common.sampleSubtitle', { count: timeOff.approval.sampleSize })}
        />
        <StatTile
          label={t('timeOff.medianTimeToDecide')}
          value={timeOff.approval.medianApprovalHours === null ? '—' : `${timeOff.approval.medianApprovalHours}h`}
        />
        <StatTile label={t('timeOff.pendingRequests')} value={String(timeOff.pending)} />
        <StatTile
          label={t('timeOff.policyAdoption')}
          value={timeOff.policyAdoption.adoptionPct === null ? '—' : `${timeOff.policyAdoption.adoptionPct}%`}
          subtitle={t('timeOff.employeesWithPolicy', {
            withPolicy: timeOff.policyAdoption.employeesWithPolicy,
            total: timeOff.policyAdoption.totalEmployees,
          })}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard
          title={t('timeOff.chartDaysTakenByPolicy')}
          data={byPolicy}
          series={[{ key: 'days', label: t('timeOff.seriesDays'), color: seriesColor(0) }]}
          valueFormatter={(v) => `${v}d`}
        />
      </div>
      <p className="mt-3 text-xs text-ink-faint dark:text-dark-ink-faint">
        {t('timeOff.daysTakenSummary', { days: timeOff.daysTaken.totalDays, requests: timeOff.daysTaken.requestCount })}
      </p>
    </div>
  );
}
