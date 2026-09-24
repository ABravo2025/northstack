import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StatTile from '../../components/metrics/StatTile';
import { useTenantMetrics } from '../../lib/useTenantMetrics';
import type { DashboardsOutletContext } from '../../layouts/DashboardsLayout';

export default function DashboardsAdoptionPage() {
  const { t } = useTranslation('dashboards');
  const { token, range } = useOutletContext<DashboardsOutletContext>();
  const { metrics, loading } = useTenantMetrics(token, range);

  // Module keys ('hr', 'sales', 'time_off', 'payroll') come from the API — the snake_case
  // 'time_off' is the one that doesn't match a JSON key directly, hence the lookup below instead
  // of a plain `t(`adoption.moduleLabels.${m.module}`)` template.
  const MODULE_LABEL_KEYS: Record<string, string> = {
    hr: 'adoption.moduleLabels.hr',
    sales: 'adoption.moduleLabels.sales',
    time_off: 'adoption.moduleLabels.timeOff',
    payroll: 'adoption.moduleLabels.payroll',
  };

  if (!metrics) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('common.loading')}</p>;
  if (!metrics.adoption) {
    return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('common.notVisibleToRole')}</p>;
  }

  const { adoption } = metrics;

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile
          label={t('adoption.seatUtilization')}
          value={adoption.seatUtilization.ratePct === null ? '—' : `${adoption.seatUtilization.ratePct}%`}
          subtitle={t('adoption.invitationsAcceptedSubtitle', {
            accepted: adoption.seatUtilization.accepted,
            total: adoption.seatUtilization.nonRevokedTotal,
          })}
        />
        <StatTile
          label={t('adoption.loginFrequency')}
          value={adoption.loginFrequency.medianDistinctLoginDays === null ? '—' : String(adoption.loginFrequency.medianDistinctLoginDays)}
          subtitle={t('adoption.loginFrequencySubtitle', { count: adoption.loginFrequency.usersWithSession })}
        />
      </div>
      <div className="card">
        <h3 className="card-title">{t('adoption.moduleUsage')}</h3>
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
              {MODULE_LABEL_KEYS[m.module] ? t(MODULE_LABEL_KEYS[m.module]) : m.module} — {m.used ? t('adoption.inUse') : t('adoption.notUsedYet')}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-faint dark:text-dark-ink-faint">{t('adoption.loginFrequencyDisclaimer')}</p>
    </div>
  );
}
