import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BarChartCard from '../../components/metrics/BarChartCard';
import StatTile from '../../components/metrics/StatTile';
import { useTenantMetrics } from '../../lib/useTenantMetrics';
import { seriesColor } from '../../lib/metricsFormat';
import type { DashboardsOutletContext } from '../../layouts/DashboardsLayout';

export default function DashboardsTasksPage() {
  const { t } = useTranslation('dashboards');
  const { token, range } = useOutletContext<DashboardsOutletContext>();
  const { metrics, loading } = useTenantMetrics(token, range);

  if (!metrics) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('common.loading')}</p>;
  if (!metrics.tasks) {
    return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('common.notVisibleToRole')}</p>;
  }

  const { tasks } = metrics;
  const notesByMonth = tasks.notes.byMonth.map((m) => ({ name: m.month, count: m.count }));

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label={t('tasks.completionRate')}
          value={tasks.completion.completionRatePct === null ? '—' : `${tasks.completion.completionRatePct}%`}
          subtitle={`${tasks.completion.completed} / ${tasks.completion.total}`}
        />
        <StatTile label={t('tasks.overdue')} value={String(tasks.overdueCount)} />
        <StatTile
          label={t('tasks.medianTimeToComplete')}
          value={tasks.timeToComplete.medianHours === null ? '—' : `${tasks.timeToComplete.medianHours}h`}
          subtitle={t('common.sampleSubtitle', { count: tasks.timeToComplete.sampleSize })}
        />
        <StatTile label={t('tasks.notesCreated')} value={String(tasks.notes.total)} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard title={t('tasks.chartNotesByMonth')} data={notesByMonth} series={[{ key: 'count', label: t('tasks.seriesNotes'), color: seriesColor(4) }]} />
      </div>
    </div>
  );
}
