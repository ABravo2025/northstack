import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ProfitabilityRow } from '../../api';
import { moneyList } from '../../components/crm/company360/CompanyProfitabilityTab';

// Cruces D1: the Clients dashboard's profitability table — every client for the period, revenue
// estimated from products (the client's own tab uses Stripe when linked), least profitable first.
export default function ProfitabilityTable({ token, from, to, departmentId }: { token: string; from: string; to: string; departmentId: string }) {
  const { t } = useTranslation('crm');
  const [rows, setRows] = useState<ProfitabilityRow[] | null>(null);
  const [access, setAccess] = useState<{ canSeeLabor: boolean; canSeeExpenses: boolean } | null>(null);

  useEffect(() => {
    api
      .getProfitabilityTable(token, { from, to, departmentId: departmentId || undefined })
      .then((r) => {
        setRows(r.rows);
        setAccess(r.access);
      })
      .catch(() => setRows([]));
  }, [token, from, to, departmentId]);

  if (!rows || !rows.length) return null;
  const firstCents = (r: ProfitabilityRow) => r.profit[0]?.cents ?? 0;
  const sorted = [...rows].sort((a, b) => firstCents(a) - firstCents(b));
  return (
    <div className="card mt-4">
      <h3 className="card-title">{t('profit.tableTitle')}</h3>
      <p className="mt-0 text-xs text-ink-muted dark:text-dark-ink-muted">
        {t('profit.tableHint')}
        {access && !access.canSeeLabor ? ` ${t('profit.needsPayroll')}` : ''}
        {access && !access.canSeeExpenses ? ` ${t('profit.needsExpenses')}` : ''}
      </p>
      <div className="full-table-wrap">
        <table className="full-table">
          <thead>
            <tr>
              <th>{t('profit.client')}</th>
              <th className="text-right">{t('profit.revenue')}</th>
              <th className="text-right">{t('profit.labor')}</th>
              <th className="text-right">{t('profit.expenses')}</th>
              <th className="text-right">{t('profit.result')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.companyId} className="border-t border-line-soft dark:border-dark-line-soft">
                <td>{r.companyName}</td>
                <td className="num text-right">{moneyList(r.revenue)}</td>
                <td className="num text-right">{moneyList(r.labor)}</td>
                <td className="num text-right">{moneyList(r.expenses)}</td>
                <td className={`num text-right font-semibold ${firstCents(r) < 0 ? 'text-red-700 dark:text-red-300' : ''}`}>{moneyList(r.profit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
