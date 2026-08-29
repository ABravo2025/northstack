import StatTile from '../../components/metrics/StatTile';
import { useTenantMetrics } from '../../lib/useTenantMetrics';

interface DashboardsAdoptionPageProps {
  token: string;
}

const MODULE_LABELS: Record<string, string> = {
  hr: 'HR',
  sales: 'Sales',
  time_off: 'Time Off',
  payroll: 'Payroll',
};

export default function DashboardsAdoptionPage({ token }: DashboardsAdoptionPageProps) {
  const { metrics, loading } = useTenantMetrics(token);

  if (loading || !metrics) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">Loading…</p>;

  const { adoption } = metrics;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Seat utilization"
          value={adoption.seatUtilization.ratePct === null ? '—' : `${adoption.seatUtilization.ratePct}%`}
          subtitle={`${adoption.seatUtilization.accepted} / ${adoption.seatUtilization.nonRevokedTotal} invitations accepted`}
        />
        <StatTile
          label="Login frequency (proxy)"
          value={String(adoption.loginFrequency.medianDistinctLoginDays)}
          subtitle={`median distinct login days · ${adoption.loginFrequency.usersWithSession} users`}
        />
      </div>
      <div className="card">
        <h3 className="card-title">Module usage</h3>
        <div className="flex flex-wrap gap-2">
          {adoption.moduleUsage.map((m) => (
            <div
              key={m.module}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                m.used
                  ? 'border-line bg-surface-2 text-ink dark:border-dark-line dark:bg-dark-raised dark:text-dark-ink'
                  : 'border-dashed border-line-strong text-ink-faint dark:border-dark-line dark:text-dark-ink-faint'
              }`}
              title={m.detail}
            >
              {MODULE_LABELS[m.module] ?? m.module} — {m.used ? 'in use' : 'not used yet'}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-faint dark:text-dark-ink-faint">
        Login frequency is a weak proxy (counts distinct days a login happened, not ongoing activity) — sessions stay valid for 30 days, so
        someone who logs in once and stays logged in won't show up again until their session slides.
      </p>
    </div>
  );
}
