import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type CashflowProjection, type ExpensesMeta } from '../../api';
import TableSkeleton from '../../components/common/TableSkeleton';
import { ExpensesPage, shortDate, useMoney } from './expensesShared';

// Cruces D2: the next 13 weeks of cash — fixed expenses on their charge day, remaining card
// installments, and clients' recurring revenue (with the Clients module). With an opening balance
// (kept in this browser only, never sent to be stored) each week shows the running balance.
const OPENING_KEY = 'ns.expenses.openingBalance';

export default function ExpensesCashflowPage({ token }: { token: string }) {
  return <ExpensesPage token={token} section="cashflow">{(meta) => <CashflowBody token={token} meta={meta} />}</ExpensesPage>;
}

function CashflowBody({ token, meta }: { token: string; meta: ExpensesMeta }) {
  const { t, i18n } = useTranslation('expenses');
  const money = useMoney(meta.currency);
  const [opening, setOpening] = useState(() => {
    try {
      return localStorage.getItem(OPENING_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [data, setData] = useState<CashflowProjection | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(OPENING_KEY, opening);
    } catch {
      // private mode: the balance just isn't remembered
    }
    const h = setTimeout(() => {
      api
        .getCashflow(token, opening.trim() || undefined)
        .then(setData)
        .catch(() => setData(null));
    }, 300);
    return () => clearTimeout(h);
  }, [token, opening]);

  if (!data) return <TableSkeleton rows={6} />;
  const hasBalance = data.weeks[0]?.balanceCents !== null;
  const maxAbs = Math.max(1, ...data.weeks.map((w) => Math.max(w.inCents, w.outCents)));

  return (
    <>
      <div className="ex-filters">
        <label className="ex-field">
          {t('cashflow.opening')}
          <input inputMode="decimal" className="w-44" value={opening} placeholder={t('cashflow.openingPlaceholder')} onChange={(e) => setOpening(e.target.value)} />
        </label>
        <span className="ex-hint mb-2">{t('cashflow.openingHint')}</span>
      </div>

      <div className="sh-kpis">
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('cashflow.in')}</span>
          <span className="sh-kpi-value num">{money(data.totalInCents)}</span>
          <span className="sh-kpi-hint">{t('cashflow.next13')}</span>
        </div>
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('cashflow.out')}</span>
          <span className="sh-kpi-value num">{money(data.totalOutCents)}</span>
          <span className="sh-kpi-hint">{t('cashflow.next13')}</span>
        </div>
        <div className="sh-kpi">
          <span className="sh-kpi-label">{hasBalance ? t('cashflow.endBalance') : t('cashflow.net')}</span>
          <span className="sh-kpi-value num">{money(hasBalance ? data.weeks[data.weeks.length - 1].balanceCents! : data.totalInCents - data.totalOutCents)}</span>
          <span className="sh-kpi-hint">{shortDate(data.to, i18n.language)}</span>
        </div>
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('cashflow.negativeWeeks')}</span>
          <span className={`sh-kpi-value num ${data.negativeWeeks.length ? 'text-red-700 dark:text-red-300' : ''}`}>{data.negativeWeeks.length}</span>
          <span className="sh-kpi-hint">{hasBalance ? t('cashflow.negativeBalanceHint') : t('cashflow.negativeNetHint')}</span>
        </div>
      </div>

      {data.negativeWeeks.length > 0 && (
        <div className="card sh-note-warn text-sm">{t('cashflow.alert', { date: shortDate(data.negativeWeeks[0], i18n.language) })}</div>
      )}

      <div className="full-table-wrap">
        <table className="table full-table to-table">
          <thead>
            <tr>
              <th>{t('cashflow.week')}</th>
              <th className="text-right">{t('cashflow.in')}</th>
              <th className="text-right">{t('cashflow.out')}</th>
              <th className="text-right">{t('cashflow.net')}</th>
              {hasBalance && <th className="text-right">{t('cashflow.balance')}</th>}
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w) => {
              const negative = hasBalance ? (w.balanceCents ?? 0) < 0 : w.netCents < 0;
              return (
                <Fragment key={w.start}>
                  <tr className="cursor-pointer" onClick={() => setOpen(open === w.start ? null : w.start)}>
                    <td className="whitespace-nowrap">
                      {shortDate(w.start, i18n.language)} – {shortDate(w.end, i18n.language)}
                    </td>
                    <td className="num text-right text-emerald-700 dark:text-emerald-300">{w.inCents ? money(w.inCents) : '—'}</td>
                    <td className="num text-right">{w.outCents ? money(w.outCents) : '—'}</td>
                    <td className={`num text-right ${w.netCents < 0 ? 'text-red-700 dark:text-red-300' : ''}`}>{money(w.netCents)}</td>
                    {hasBalance && <td className={`num text-right font-semibold ${negative ? 'text-red-700 dark:text-red-300' : ''}`}>{money(w.balanceCents!)}</td>}
                    <td className="w-32">
                      <div className="ex-bar">
                        <div className="ex-bar-fill" style={{ width: `${Math.max(2, (w.outCents / maxAbs) * 100)}%`, background: negative ? '#dc2626' : undefined }} />
                      </div>
                    </td>
                  </tr>
                  {open === w.start && (
                    <tr>
                      <td colSpan={hasBalance ? 6 : 5} className="!whitespace-normal">
                        {w.items.length === 0 ? (
                          <span className="ex-muted text-sm">{t('cashflow.nothing')}</span>
                        ) : (
                          <ul className="ex-due">
                            {w.items.map((it, i) => (
                              <li key={i}>
                                <span className="text-sm">
                                  {shortDate(it.date, i18n.language)} · {it.label} <span className="ex-muted text-xs">({t(`cashflow.kind.${it.kind}`)})</span>
                                </span>
                                <span className={`num text-sm ${it.cents >= 0 ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>{money(it.cents)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="ex-hint">
        {t('cashflow.howItWorks')}
        {data.otherCurrencyLines > 0 ? ` ${t('cashflow.otherCurrency', { count: data.otherCurrencyLines })}` : ''}
      </p>
    </>
  );
}
