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
export default function OverviewMetricsStrip({ token }: OverviewMetricsStripProps) {
  const { metrics } = useTenantMetrics(token);

  if (!metrics) return null;

  const pipelineTotals = new Map<string, number>();
  for (const p of metrics.sales.openPipeline) {
    pipelineTotals.set(p.currency, (pipelineTotals.get(p.currency) ?? 0) + p.amountCents);
  }
  const pipelineAmounts = [...pipelineTotals].map(([currency, amountCents]) => ({ currency, amountCents }));

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="Headcount" value={String(metrics.hr.headcount.total)} />
      <StatTile label="Open pipeline" value={sumByCurrencyLabel(pipelineAmounts)} subtitle={`${metrics.sales.openPipeline.reduce((s, p) => s + p.count, 0)} deals`} />
      <StatTile
        label="Tasks completed"
        value={metrics.tasks.completion.completionRatePct === null ? '—' : `${metrics.tasks.completion.completionRatePct}%`}
        subtitle={`${metrics.tasks.completion.completed} / ${metrics.tasks.completion.total}`}
      />
      <StatTile label="Time off pending" value={String(metrics.timeOff.pending)} />
    </div>
  );
}
