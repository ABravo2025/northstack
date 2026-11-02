import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ApiError, type ExpensesDashboard, type ExpensesMeta } from '../../api';
import BarChartCard from '../../components/metrics/BarChartCard';
import StatTile from '../../components/metrics/StatTile';
import { seriesColor } from '../../lib/metricsFormat';
import { formatMoney } from '../../lib/currencies';
import type { DashboardsOutletContext } from '../../layouts/DashboardsLayout';
import { categoryLabel, monthName } from '../expenses/expensesShared';

// Dashboards → Gastos (spec-clientes-gastos-formularios.md, A7). The range comes from the shared
// Dashboards filter; the department filter lives here. Amounts are decrypted and added up on the
// server, so this page only draws them.
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function DashboardsExpensesPage() {
  const { t, i18n } = useTranslation('expenses');
  const { token, range } = useOutletContext<DashboardsOutletContext>();
  const [meta, setMeta] = useState<ExpensesMeta | null>(null);
  const [departmentId, setDepartmentId] = useState('');
  const [data, setData] = useState<ExpensesDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    api
      .getExpensesMeta(token)
      .then(setMeta)
      .catch((e) => {
        const code = e instanceof ApiError ? (e.body as { code?: string } | undefined)?.code : undefined;
        setFailure(code === 'expenses_not_configured' ? t('state.notConfigured') : (e as Error).message);
      });
  }, [token, t]);

  const from = localDate(range.since);
  const to = localDate(range.until);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getExpensesDashboard(token, { from, to, departmentId: departmentId || undefined })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setFailure((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, from, to, departmentId]);

  if (failure) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{failure}</p>;
  if (!data || !meta) return <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('dashboard.loading')}</p>;

  const money = (cents: number) => formatMoney(cents, data.currency);
  const categories = new Map(meta.categories.map((c) => [c.id, c]));
  const departments = new Map(meta.departments.map((d) => [d.id, d.name]));
  const monthLabel = (period: string) => {
    const name = monthName(period, i18n.language);
    return `${name.charAt(0).toUpperCase()}${name.slice(1, 3)} ${period.slice(2, 4)}`;
  };
  const byMonth = data.byMonth.map((m) => ({ name: monthLabel(m.month), fixed: m.fixedCents / 100, variable: m.variableCents / 100 }));
  const byCategory = data.byCategory.map((c) => ({
    name: categoryLabel(t, c.categoryId ? categories.get(c.categoryId) : null),
    amount: c.cents / 100,
  }));
  const byDepartment = data.byDepartment.map((d) => ({
    name: d.departmentId ? (departments.get(d.departmentId) ?? '—') : t('movements.noDepartment'),
    amount: d.cents / 100,
  }));
  const fmt = (v: number) => formatMoney(Math.round(v * 100), data.currency);
  const empty = data.expenseCount === 0;

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="ex-field">
          {t('dashboard.department')}
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">{t('dashboard.allDepartments')}</option>
            <option value="none">{t('movements.noDepartment')}</option>
            {meta.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t('dashboard.total')} value={money(data.totalCents)} subtitle={t('dashboard.expenseCount', { count: data.expenseCount })} />
        <StatTile label={t('summary.fixed')} value={money(data.fixedCents)} />
        <StatTile label={t('summary.variable')} value={money(data.variableCents)} />
        <StatTile label={t('dashboard.credits')} value={money(data.creditsCents)} subtitle={t('dashboard.creditsHint')} />
      </div>
      {data.estimatedCount > 0 && (
        <p className="mt-0 mb-4 text-xs text-ink-muted dark:text-dark-ink-muted">{t('summary.estimatedNote', { count: data.estimatedCount })}</p>
      )}

      {empty ? (
        <div className="card text-sm text-ink-muted dark:text-dark-ink-muted">{t('dashboard.empty')}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarChartCard
              title={t('dashboard.byMonth')}
              data={byMonth}
              series={[
                { key: 'fixed', label: t('summary.fixed'), color: seriesColor(0) },
                { key: 'variable', label: t('summary.variable'), color: seriesColor(1) },
              ]}
              valueFormatter={fmt}
            />
            <BarChartCard
              title={t('summary.byCategory')}
              data={byCategory}
              series={[{ key: 'amount', label: t('dashboard.total'), color: seriesColor(0) }]}
              valueFormatter={fmt}
            />
            <BarChartCard
              title={t('dashboard.byDepartment')}
              data={byDepartment}
              series={[{ key: 'amount', label: t('dashboard.total'), color: seriesColor(0) }]}
              valueFormatter={fmt}
            />
            <div className="card">
              <h3 className="card-title">{t('dashboard.topMerchants')}</h3>
              <p className="mt-0 text-xs text-ink-muted dark:text-dark-ink-muted">{t('dashboard.topMerchantsHint')}</p>
              <div className="full-table-wrap">
                <table className="full-table">
                  <thead>
                    <tr>
                      <th>{t('dashboard.merchant')}</th>
                      <th className="text-right">{t('dashboard.purchases')}</th>
                      <th className="text-right">{t('movements.columns.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topMerchants.map((m) => (
                      <tr key={m.name} className="border-t border-line-soft dark:border-dark-line-soft">
                        <td>{m.name}</td>
                        <td className="num text-right">{m.count}</td>
                        <td className="num text-right">{money(m.cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
