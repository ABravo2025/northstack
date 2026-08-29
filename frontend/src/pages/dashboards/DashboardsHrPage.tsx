import { useOutletContext } from 'react-router-dom';
import BarChartCard from '../../components/metrics/BarChartCard';
import StatTile from '../../components/metrics/StatTile';
import { useTenantMetrics } from '../../lib/useTenantMetrics';
import { seriesColor } from '../../lib/metricsFormat';
import type { DashboardsOutletContext } from '../../layouts/DashboardsLayout';

export default function DashboardsHrPage() {
  const { token, range } = useOutletContext<DashboardsOutletContext>();
  const { metrics, loading } = useTenantMetrics(token, range);

  if (!metrics) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">Loading…</p>;

  const { hr } = metrics;
  const byDepartment = hr.byDepartment.map((d) => ({ name: d.name, count: d.count }));
  const byJobTitle = hr.byJobTitle.map((d) => ({ name: d.name, count: d.count }));
  const growth = hr.growth.map((g) => ({ name: g.month, count: g.count }));
  const contractMix = hr.contractTypeMix.map((c) => ({ name: c.contractType, count: c.count }));
  const personMix = hr.personTypeMix.map((c) => ({ name: c.personType, count: c.count }));

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Headcount" value={String(hr.headcount.total)} />
        <StatTile label="Median tenure" value={`${hr.tenure.medianDays} days`} subtitle={`sample: ${hr.tenure.sampleSize}`} />
        <StatTile label="Avg. direct reports" value={String(hr.spanOfControl.avgReports)} subtitle={`${hr.spanOfControl.managerCount} managers`} />
        <StatTile
          label="Custom fields"
          value={String(hr.customFields.activeDefinitionCount)}
          subtitle={`active on ${hr.customFields.employeeCount} employees`}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard title="Headcount by department" data={byDepartment} series={[{ key: 'count', label: 'Employees', color: seriesColor(0) }]} />
        <BarChartCard title="Headcount by job title" data={byJobTitle} series={[{ key: 'count', label: 'Employees', color: seriesColor(0) }]} />
        <BarChartCard title="New hires by month" data={growth} series={[{ key: 'count', label: 'Hires', color: seriesColor(1) }]} />
        <BarChartCard title="Contract type mix" data={contractMix} series={[{ key: 'count', label: 'Employees', color: seriesColor(2) }]} />
        <BarChartCard title="Person type mix" data={personMix} series={[{ key: 'count', label: 'Employees', color: seriesColor(3) }]} />
      </div>
      {hr.customFields.fields.length > 0 && (
        <div className="card mt-4">
          <h3 className="card-title">Custom field completion</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint dark:text-dark-ink-faint">
                <th className="pb-2 font-medium">Field</th>
                <th className="pb-2 font-medium">Filled</th>
                <th className="pb-2 font-medium">Completion</th>
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
