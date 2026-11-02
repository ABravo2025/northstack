import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type SalesExtras } from '../../api';
import BarChartCard from '../../components/metrics/BarChartCard';
import StatTile from '../../components/metrics/StatTile';
import { pivotByCurrency, seriesColor } from '../../lib/metricsFormat';
import { formatMoney } from '../../lib/currencies';
import type { DateRange } from '../../lib/dateRangePresets';
import { DepartmentFilter, dashboardDates } from './dashboardFilters';

// Clientes C9: the Sales dashboard's additions — won by pipeline purpose (new business, expansion,
// renewals) and the Leads inbox funnel — with the owner's department filter.
export default function SalesExtrasSection({ token, range }: { token: string; range: DateRange }) {
  const { t } = useTranslation('crm');
  const [departmentId, setDepartmentId] = useState('');
  const [data, setData] = useState<SalesExtras | null>(null);
  const { from, to } = dashboardDates(range);

  useEffect(() => {
    let cancelled = false;
    api
      .getSalesExtras(token, { from, to, departmentId: departmentId || undefined })
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData(null));
    return () => {
      cancelled = true;
    };
  }, [token, from, to, departmentId]);

  if (!data) return null;
  const purposes = ['new_business', 'expansion', 'renewal', 'other'];
  const won = pivotByCurrency(
    purposes.map((p) => ({
      name: t(`salesDash.purpose.${p}`),
      amounts: data.wonByPurpose.filter((w) => w.purpose === p).map((w) => ({ currency: w.currency, amountCents: w.cents })),
    })),
  );
  const conversion = data.leads.total ? Math.round((data.leads.converted / data.leads.total) * 100) : null;

  return (
    <section className="mt-6">
      <h3 className="card-title mb-3">{t('salesDash.title')}</h3>
      <DepartmentFilter token={token} value={departmentId} onChange={setDepartmentId} hint={t('salesDash.departmentHint')} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t('salesDash.leads')} value={String(data.leads.total)} subtitle={t('salesDash.worked', { count: data.leads.worked })} />
        <StatTile label={t('salesDash.qualified')} value={String(data.leads.qualified)} />
        <StatTile label={t('salesDash.converted')} value={String(data.leads.converted)} subtitle={conversion === null ? undefined : t('salesDash.conversion', { pct: conversion })} />
        <StatTile label={t('salesDash.disqualified')} value={String(data.leads.disqualified)} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChartCard title={t('salesDash.wonByPurpose')} data={won.data} series={won.series} valueFormatter={(v, currency) => formatMoney(v * 100, currency)} />
        <BarChartCard
          title={t('salesDash.leadsFunnel')}
          data={[
            { name: t('salesDash.leads'), count: data.leads.total },
            { name: t('salesDash.workedShort'), count: data.leads.worked },
            { name: t('salesDash.qualified'), count: data.leads.qualified },
            { name: t('salesDash.converted'), count: data.leads.converted },
          ]}
          series={[{ key: 'count', label: t('salesDash.leads'), color: seriesColor(0) }]}
        />
        <BarChartCard
          title={t('salesDash.leadsBySource')}
          data={data.leads.bySource.slice(0, 8).map((s) => ({ name: s.source === 'form' ? t('salesDash.sourceForm') : s.source === 'manual' ? t('salesDash.sourceManual') : s.source, total: s.total, converted: s.converted }))}
          series={[
            { key: 'total', label: t('salesDash.leads'), color: seriesColor(0) },
            { key: 'converted', label: t('salesDash.converted'), color: seriesColor(1) },
          ]}
        />
      </div>
    </section>
  );
}
