import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type ClientsDashboard } from '../../api';
import BarChartCard from '../../components/metrics/BarChartCard';
import StatTile from '../../components/metrics/StatTile';
import { pivotByCurrency, seriesColor } from '../../lib/metricsFormat';
import { formatMoney } from '../../lib/currencies';
import type { DashboardsOutletContext } from '../../layouts/DashboardsLayout';
import { DepartmentFilter, dashboardDates } from './dashboardFilters';

// Clientes C9 (spec-clientes-gastos-formularios.md): Dashboards → Clientes — how many clients, their
// recurring revenue, health spread, support (tickets and SLA) and check-ins. Shared Dashboards period
// plus the account owner's department.
export default function DashboardsClientsPage() {
  const { t } = useTranslation('crm');
  const { token, range } = useOutletContext<DashboardsOutletContext>();
  const [departmentId, setDepartmentId] = useState('');
  const [data, setData] = useState<ClientsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const { from, to } = dashboardDates(range);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getClientsDashboard(token, { from, to, departmentId: departmentId || undefined })
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, from, to, departmentId]);

  if (!data) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('company360.loading')}</p>;

  const newMrr = pivotByCurrency(data.newMrrByMonth.map((m) => ({ name: m.month, amounts: m.byCurrency.map((c) => ({ currency: c.currency, amountCents: c.cents })) })));
  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <DepartmentFilter token={token} value={departmentId} onChange={setDepartmentId} hint={t('clientsDash.departmentHint')} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t('clientsDash.clients')} value={String(data.clients)} subtitle={t('clientsDash.checkIns', { count: data.checkIns })} />
        <StatTile label={t('clientsDash.mrr')} value={data.mrr.length ? data.mrr.map((m) => formatMoney(m.cents, m.currency)).join(' + ') : '—'} subtitle={t('clientsDash.cancelled', { count: data.cancelledInPeriod })} />
        <StatTile label={t('clientsDash.atRisk')} value={String(data.health.at_risk + data.health.critical)} subtitle={t('clientsDash.critical', { count: data.health.critical })} />
        <StatTile
          label={t('clientsDash.sla')}
          value={data.tickets.slaPct === null ? '—' : `${data.tickets.slaPct}%`}
          subtitle={t('clientsDash.ticketsOpen', { open: data.tickets.open, overdue: data.tickets.overdue })}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard
          title={t('clientsDash.healthSpread')}
          data={(['healthy', 'at_risk', 'critical'] as const).map((s) => ({ name: t(`company360.health.status.${s}`), count: data.health[s] }))}
          series={[{ key: 'count', label: t('clientsDash.clients'), color: seriesColor(0) }]}
        />
        <BarChartCard title={t('clientsDash.newMrr')} data={newMrr.data} series={newMrr.series} valueFormatter={(v, currency) => formatMoney(v * 100, currency)} />
        <BarChartCard
          title={t('clientsDash.ticketsByPriority')}
          data={data.tickets.byPriority.map((p) => ({ name: t(`tickets.priority.${p.priority}`), count: p.count }))}
          series={[{ key: 'count', label: t('clientsDash.opened'), color: seriesColor(2) }]}
        />
      </div>
    </div>
  );
}
