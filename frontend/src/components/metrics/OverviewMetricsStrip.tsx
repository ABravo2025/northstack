import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../lib/currencies';
import { useTenantMetrics } from '../../lib/useTenantMetrics';
import StatTile from './StatTile';

interface OverviewMetricsStripProps {
  token: string;
}

function sumByCurrencyLabel(amounts: { currency: string; amountCents: number }[]): string {
  if (amounts.length === 0) return '—';
  return amounts.map((a) => formatMoney(a.amountCents, a.currency)).join(' + ');
}

// General/generic numbers only — the deep breakdowns (by department, by
// stage, by lead source...) live in /dashboards instead. No Payroll tile
// here on purpose: that data is owner-only (see tenantMetrics.ts's payroll
// gate), and this strip is meant to read the same for every role.
//
// hr/sales/tasks/timeOff all come back null together for a role without view_dashboards (same
// gate as the /dashboards pages themselves, tenantMetrics.ts) — a default Member never gets this
// company-wide strip on /overview, same "only my own info" policy as the rest of the app.
export default function OverviewMetricsStrip({ token }: OverviewMetricsStripProps) {
  const { t } = useTranslation('dashboards');
  const { metrics } = useTenantMetrics(token);

  if (!metrics || !metrics.hr || !metrics.sales || !metrics.tasks || !metrics.timeOff) return null;

  const pipelineTotals = new Map<string, number>();
  for (const p of metrics.sales.openPipeline) {
    pipelineTotals.set(p.currency, (pipelineTotals.get(p.currency) ?? 0) + p.amountCents);
  }
  const pipelineAmounts = [...pipelineTotals].map(([currency, amountCents]) => ({ currency, amountCents }));

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatTile label={t('overviewStrip.headcount')} value={String(metrics.hr.headcount.total)} />
      <StatTile
        label={t('overviewStrip.openPipeline')}
        value={sumByCurrencyLabel(pipelineAmounts)}
        subtitle={t('overviewStrip.deals', { count: metrics.sales.openPipeline.reduce((s, p) => s + p.count, 0) })}
      />
      <StatTile
        label={t('overviewStrip.tasksCompleted')}
        value={metrics.tasks.completion.completionRatePct === null ? '—' : `${metrics.tasks.completion.completionRatePct}%`}
        subtitle={`${metrics.tasks.completion.completed} / ${metrics.tasks.completion.total}`}
      />
      <StatTile label={t('overviewStrip.timeOffPending')} value={String(metrics.timeOff.pending)} />
    </div>
  );
}
