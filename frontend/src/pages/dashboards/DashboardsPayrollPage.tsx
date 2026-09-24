import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import BarChartCard from '../../components/metrics/BarChartCard';
import StatTile from '../../components/metrics/StatTile';
import { useTenantMetrics } from '../../lib/useTenantMetrics';
import { pivotByCurrency } from '../../lib/metricsFormat';
import { formatMoney } from '../../lib/currencies';
import type { DashboardsOutletContext } from '../../layouts/DashboardsLayout';

export default function DashboardsPayrollPage() {
  const { t } = useTranslation('dashboards');
  const { token, range } = useOutletContext<DashboardsOutletContext>();
  const { metrics, loading } = useTenantMetrics(token, range);

  if (!metrics) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('common.loading')}</p>;
  if (!metrics.payroll) {
    return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('payroll.notVisibleOwnerOnly')}</p>;
  }

  const { payroll } = metrics;
  const costByPeriod = pivotByCurrency(payroll.costByPeriod.map((p) => ({ name: p.month, amounts: p.byCurrency })));
  const typeGroups = new Map<string, { currency: string; amountCents: number }[]>();
  for (const t of payroll.costByType) {
    if (!typeGroups.has(t.type)) typeGroups.set(t.type, []);
    typeGroups.get(t.type)!.push({ currency: t.currency, amountCents: t.amountCents });
  }
  const costByType = pivotByCurrency([...typeGroups].map(([name, amounts]) => ({ name, amounts })));

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label={t('payroll.contractConfirmation')}
          value={payroll.contractConfirmation.ratePct === null ? '—' : `${payroll.contractConfirmation.ratePct}%`}
          subtitle={`${payroll.contractConfirmation.confirmed} / ${payroll.contractConfirmation.total}`}
        />
        <StatTile label={t('payroll.offCyclePayments')} value={String(payroll.offCycle.count)} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard
          title={t('payroll.chartCostByMonth')}
          data={costByPeriod.data}
          series={costByPeriod.series}
          valueFormatter={(v, currency) => formatMoney(v * 100, currency)}
        />
        <BarChartCard
          title={t('payroll.chartCostByType')}
          data={costByType.data}
          series={costByType.series}
          valueFormatter={(v, currency) => formatMoney(v * 100, currency)}
        />
      </div>
      {payroll.compensationByDepartment.length > 0 && (
        <div className="card mt-4">
          <h3 className="card-title">{t('payroll.compensationByDepartment')}</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint dark:text-dark-ink-faint">
                <th className="pb-2 font-medium">{t('payroll.colDepartment')}</th>
                <th className="pb-2 font-medium">{t('payroll.colType')}</th>
                <th className="pb-2 font-medium">{t('payroll.colMedian')}</th>
                <th className="pb-2 font-medium">{t('payroll.colAvg')}</th>
                <th className="pb-2 font-medium">{t('payroll.colSample')}</th>
              </tr>
            </thead>
            <tbody>
              {payroll.compensationByDepartment.map((c, i) => (
                <tr key={i} className="border-t border-line-soft dark:border-dark-line-soft">
                  <td className="py-1.5 text-ink dark:text-dark-ink">{c.departmentName}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{c.compensationType}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{formatMoney(c.medianRateCents, c.currency)}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{formatMoney(c.avgRateCents, c.currency)}</td>
                  <td className="py-1.5 text-ink-muted dark:text-dark-ink-muted">{c.sampleSize}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
