import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BarChartCard from '../../components/metrics/BarChartCard';
import StatTile from '../../components/metrics/StatTile';
import { useTenantMetrics } from '../../lib/useTenantMetrics';
import { seriesColor } from '../../lib/metricsFormat';
import type { DashboardsOutletContext } from '../../layouts/DashboardsLayout';

export default function DashboardsHrPage() {
  const { t } = useTranslation('dashboards');
  const { token, range } = useOutletContext<DashboardsOutletContext>();
  const { metrics, loading } = useTenantMetrics(token, range);

  if (!metrics) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('common.loading')}</p>;
  if (!metrics.hr) {
    return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('common.notVisibleToRole')}</p>;
  }

  const { hr } = metrics;
  const byDepartment = hr.byDepartment.map((d) => ({ name: d.name, count: d.count }));
  const byJobTitle = hr.byJobTitle.map((d) => ({ name: d.name, count: d.count }));
  const growth = hr.growth.map((g) => ({ name: g.month, count: g.count }));
  const contractMix = hr.contractTypeMix.map((c) => ({ name: c.contractType, count: c.count }));
  const personMix = hr.personTypeMix.map((c) => ({ name: c.personType, count: c.count }));

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t('hr.headcount')} value={String(hr.headcount.total)} />
        <StatTile
          label={t('hr.medianTenure')}
          value={hr.tenure.medianDays === null ? '—' : t('common.daysValue', { count: hr.tenure.medianDays })}
          subtitle={t('common.sampleSubtitle', { count: hr.tenure.sampleSize })}
        />
        <StatTile
          label={t('hr.avgDirectReports')}
          value={hr.spanOfControl.avgReports === null ? '—' : String(hr.spanOfControl.avgReports)}
          subtitle={t('hr.managers', { count: hr.spanOfControl.managerCount })}
        />
        <StatTile
          label={t('hr.customFields')}
          value={String(hr.customFields.activeDefinitionCount)}
          subtitle={t('hr.activeOnEmployees', { count: hr.customFields.employeeCount })}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard title={t('hr.chartByDepartment')} data={byDepartment} series={[{ key: 'count', label: t('hr.seriesEmployees'), color: seriesColor(0) }]} />
        <BarChartCard title={t('hr.chartByJobTitle')} data={byJobTitle} series={[{ key: 'count', label: t('hr.seriesEmployees'), color: seriesColor(0) }]} />
        <BarChartCard title={t('hr.chartNewHiresByMonth')} data={growth} series={[{ key: 'count', label: t('hr.seriesHires'), color: seriesColor(1) }]} />
        <BarChartCard title={t('hr.chartContractTypeMix')} data={contractMix} series={[{ key: 'count', label: t('hr.seriesEmployees'), color: seriesColor(2) }]} />
        <BarChartCard title={t('hr.chartPersonTypeMix')} data={personMix} series={[{ key: 'count', label: t('hr.seriesEmployees'), color: seriesColor(3) }]} />
      </div>
      {hr.customFields.fields.length > 0 && (
        <div className="card mt-4">
          <h3 className="card-title">{t('hr.customFieldCompletion')}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint dark:text-dark-ink-faint">
                <th className="pb-2 font-medium">{t('hr.colField')}</th>
                <th className="pb-2 font-medium">{t('hr.colFilled')}</th>
                <th className="pb-2 font-medium">{t('hr.colCompletion')}</th>
              </tr>
            </thead>
            <tbody>
              {hr.customFields.fields.map((f) => (
                <tr key={f.id} className="border-t border-line-soft dark:border-dark-line-soft">
                  <td className="py-1.5 text-ink dark:text-dark-ink">{f.name}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">
                    {f.filledCount} / {hr.customFields.employeeCount}
                  </td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{f.completionPct === null ? '—' : `${f.completionPct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
