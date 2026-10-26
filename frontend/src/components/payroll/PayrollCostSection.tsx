import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { PayrollCost, PayrollCostPeriod } from '../../api';
import { formatMoney } from '../../lib/currencies';

// Payroll v2 (2026-10-26): what was paid (confirmed runs + one-off payments). Like every metric
// (Alejandro's standing rule): a period selector — a week, 15 / 30 / 60 / 90 days or everything —
// and a department filter. Amounts per currency, never added across currencies.

const PERIODS: PayrollCostPeriod[] = ['7', '15', '30', '60', '90', 'all'];
const STORAGE_KEY = 'northstack:payroll:costFilter';

function readSaved(): { period: PayrollCostPeriod; departmentId: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return { period: PERIODS.includes(saved.period) ? saved.period : '90', departmentId: typeof saved.departmentId === 'string' ? saved.departmentId : '' };
  } catch {
    return { period: '90', departmentId: '' };
  }
}

export default function PayrollCostSection({ token }: { token: string }) {
  const { t, i18n } = useTranslation('hr');
  const [filter, setFilter] = useState(readSaved);
  const [data, setData] = useState<PayrollCost | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filter));
    } catch {
      // per-viewer convenience only
    }
    let alive = true;
    api
      .getPayrollCost(token, filter.period, filter.departmentId || undefined)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [token, filter]);

  const totals = (tt: Record<string, number>) =>
    Object.keys(tt).length ? Object.entries(tt).sort((a, b) => b[1] - a[1]).map(([c, v]) => formatMoney(v, c)).join(' + ') : '—';
  const monthLabel = (ym: string) => {
    const s = new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="payroll-cost-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="payroll-cost-title" className="card-title">{t('payroll.overview.cost.title')}</h3>
          <p className="m-0 text-sm text-ink-muted dark:text-dark-ink-muted">{totals(data?.total ?? {})}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-xs text-ink-muted dark:text-dark-ink-muted">
            {t('payroll.overview.cost.period')}
            <select className="select-compact" value={filter.period} onChange={(e) => setFilter((f) => ({ ...f, period: e.target.value as PayrollCostPeriod }))}>
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {t(`payroll.overview.cost.periods.${p}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted dark:text-dark-ink-muted">
            {t('payroll.overview.cost.department')}
            <select className="select-compact" value={filter.departmentId} onChange={(e) => setFilter((f) => ({ ...f, departmentId: e.target.value }))}>
              <option value="">{t('payroll.overview.cost.allDepartments')}</option>
              {(data?.departments ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
              <option value="none">{t('payroll.overview.cost.noArea')}</option>
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="full-table-wrap">
          <table className="table full-table !mt-0">
            <thead>
              <tr>
                <th>{t('payroll.overview.cost.month')}</th>
                <th>{t('payroll.overview.cost.paid')}</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byMonth ?? []).map((m) => (
                <tr key={m.month}>
                  <td>{monthLabel(m.month)}</td>
                  <td className="tabular-nums">{totals(m.totals)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="full-table-wrap">
          <table className="table full-table !mt-0">
            <thead>
              <tr>
                <th>{t('payroll.overview.cost.area')}</th>
                <th>{t('payroll.overview.cost.paid')}</th>
              </tr>
            </thead>
            <tbody>
              {!data || data.byArea.length === 0 ? (
                <tr>
                  <td colSpan={2} className="text-ink-faint dark:text-dark-ink-faint">{t('payroll.overview.cost.empty')}</td>
                </tr>
              ) : (
                data.byArea.map((a) => (
                  <tr key={a.area ?? '—'}>
                    <td>{a.area ?? t('payroll.overview.cost.noArea')}</td>
                    <td className="tabular-nums">{totals(a.totals)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
