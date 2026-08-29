import BarChartCard from '../../components/metrics/BarChartCard';
import StatTile from '../../components/metrics/StatTile';
import { useTenantMetrics } from '../../lib/useTenantMetrics';
import { seriesColor } from '../../lib/metricsFormat';

interface DashboardsTasksPageProps {
  token: string;
}

export default function DashboardsTasksPage({ token }: DashboardsTasksPageProps) {
  const { metrics, loading } = useTenantMetrics(token);

  if (loading || !metrics) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">Loading…</p>;

  const { tasks } = metrics;
  const notesByMonth = tasks.notes.byMonth.map((m) => ({ name: m.month, count: m.count }));

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Completion rate"
          value={tasks.completion.completionRatePct === null ? '—' : `${tasks.completion.completionRatePct}%`}
          subtitle={`${tasks.completion.completed} / ${tasks.completion.total}`}
        />
        <StatTile label="Overdue" value={String(tasks.overdueCount)} />
        <StatTile label="Median time to complete" value={`${tasks.timeToComplete.medianHours}h`} subtitle={`sample: ${tasks.timeToComplete.sampleSize}`} />
        <StatTile label="Notes created" value={String(tasks.notes.total)} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard title="Notes by month" data={notesByMonth} series={[{ key: 'count', label: 'Notes', color: seriesColor(4) }]} />
      </div>
    </div>
  );
}
