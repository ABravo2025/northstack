import { useOutletContext } from 'react-router-dom';
import BarChartCard from '../../components/metrics/BarChartCard';
import StatTile from '../../components/metrics/StatTile';
import { useTenantMetrics } from '../../lib/useTenantMetrics';
import { seriesColor } from '../../lib/metricsFormat';
import type { DashboardsOutletContext } from '../../layouts/DashboardsLayout';

export default function DashboardsTimeOffPage() {
  const { token, range } = useOutletContext<DashboardsOutletContext>();
  const { metrics, loading } = useTenantMetrics(token, range);

  if (!metrics) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">Loading…</p>;

  const { timeOff } = metrics;
  const byPolicy = timeOff.byPolicy.map((p) => ({ name: p.name, days: p.totalDays }));

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Approval rate"
          value={timeOff.approval.approvalRatePct === null ? '—' : `${timeOff.approval.approvalRatePct}%`}
          subtitle={`sample: ${timeOff.approval.sampleSize}`}
        />
        <StatTile label="Median time to decide" value={`${timeOff.approval.medianApprovalHours}h`} />
        <StatTile label="Pending requests" value={String(timeOff.pending)} />
        <StatTile
          label="Policy adoption"
          value={timeOff.policyAdoption.adoptionPct === null ? '—' : `${timeOff.policyAdoption.adoptionPct}%`}
          subtitle={`${timeOff.policyAdoption.employeesWithPolicy} / ${timeOff.policyAdoption.totalEmployees} employees`}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard
          title="Days taken by policy"
          data={byPolicy}
          series={[{ key: 'days', label: 'Days', color: seriesColor(0) }]}
          valueFormatter={(v) => `${v}d`}
        />
      </div>
      <p className="mt-3 text-xs text-ink-faint dark:text-dark-ink-faint">
        "Days taken this period" total: {timeOff.daysTaken.totalDays} days across {timeOff.daysTaken.requestCount} requests.
      </p>
    </div>
  );
}
