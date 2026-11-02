import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ExpensesMeta, type ExpensesSummary, type FixedExpense } from '../../api';
import { useToast } from '../../components/common/ToastProvider';
import TableSkeleton from '../../components/common/TableSkeleton';
import { formatNumber } from '../../lib/currencies';
import ExpensesInsights from './ExpensesInsights';
import { ExpensesPage, MonthStepper, categoryLabel, currentPeriod, monthName, shortDate, useMoney } from './expensesShared';

// Gastos → Resumen (A5): the month in four numbers, what's still due, and spending by category.
export default function ExpensesSummaryPage({ token }: { token: string }) {
  return <ExpensesPage token={token} section="summary">{(meta) => <SummaryBody token={token} meta={meta} />}</ExpensesPage>;
}

function SummaryBody({ token, meta }: { token: string; meta: ExpensesMeta }) {
  const { t, i18n } = useTranslation('expenses');
  const toast = useToast();
  const money = useMoney(meta.currency);
  const [period, setPeriod] = useState(currentPeriod(meta.today));
  const [data, setData] = useState<ExpensesSummary | null>(null);
  const [paying, setPaying] = useState<string | null>(null);

  const load = () =>
    api
      .getExpensesSummary(token, period)
      .then(setData)
      .catch((e) => toast.error((e as Error).message));
  useEffect(() => {
    setData(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, period]);

  const month = monthName(period, i18n.language);
  const prevMonth = monthName(data?.previousPeriod ?? period, i18n.language);
  const categories = new Map(meta.categories.map((c) => [c.id, c]));
  const accounts = new Map(meta.accounts.map((a) => [a.id, a]));

  const pay = async (f: FixedExpense) => {
    setPaying(f.id);
    try {
      await api.payFixedExpense(token, f.id, { period });
      toast.success(t('fixed.paidToast', { name: f.name, month }));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPaying(null);
    }
  };

  if (!data) return <TableSkeleton rows={4} />;

  const variation = data.previousTotalCents > 0 ? ((data.totalCents - data.previousTotalCents) / data.previousTotalCents) * 100 : null;
  const maxCat = Math.max(1, ...data.byCategory.map((c) => c.cents));

  return (
    <>
      <MonthStepper period={period} onChange={setPeriod} />

      <div className="sh-kpis">
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('summary.monthSpending', { month })}</span>
          <span className="sh-kpi-value num">{money(data.totalCents)}</span>
          <span className="sh-kpi-hint">{t('summary.noInternal')}</span>
        </div>
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('summary.fixed')}</span>
          <span className="sh-kpi-value num">{money(data.fixedCents)}</span>
          <span className="sh-kpi-hint">{t('summary.fixedPaid', { paid: data.fixedPaidCount, total: data.fixedCount })}</span>
        </div>
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('summary.variable')}</span>
          <span className="sh-kpi-value num">{money(data.variableCents)}</span>
          <span className="sh-kpi-hint"> </span>
        </div>
        <div className="sh-kpi">
          <span className="sh-kpi-label">{t('summary.vsPrevious', { month: prevMonth })}</span>
          <span className={`sh-kpi-value num ${variation !== null && variation > 0 ? 'text-amber-700 dark:text-amber-300' : ''}`}>
            {variation === null ? '—' : `${variation > 0 ? '+' : ''}${formatNumber(variation, 1)} %`}
          </span>
          <span className="sh-kpi-hint">
            {data.previousTotalCents > 0 ? t('summary.previousWas', { month: prevMonth, amount: money(data.previousTotalCents) }) : t('summary.noPrevious')}
          </span>
        </div>
      </div>
      {data.estimatedCount > 0 && (
        <p className="m-0 text-xs text-ink-muted dark:text-dark-ink-muted">{t('summary.estimatedNote', { count: data.estimatedCount })}</p>
      )}

      <div className="ex-two">
        <section className="card ex-card">
          <h3 className="card-title m-0">{t('summary.dueTitle')}</h3>
          {data.fixedCount === 0 ? (
            <p className="ex-muted">{t('summary.noFixed')}</p>
          ) : data.due.length === 0 ? (
            <p className="ex-muted">{t('summary.allPaid', { month })}</p>
          ) : (
            <ul className="ex-due">
              {data.due.map((f) => (
                <li key={f.id}>
                  <span className="flex min-w-0 flex-col">
                    <strong className="truncate">{f.name}</strong>
                    <span className={f.status === 'overdue' ? 'text-xs text-red-700 dark:text-red-300' : 'ex-muted text-xs'}>
                      {f.status === 'overdue' ? t('when.overdue', { date: shortDate(f.chargeDate, i18n.language) }) : shortDate(f.chargeDate, i18n.language)}
                      {' · '}
                      <span className="num">{money(f.amountCents)}</span>
                      {f.accountId && accounts.get(f.accountId) ? ` · ${accounts.get(f.accountId)!.name}` : ''}
                    </span>
                  </span>
                  {f.paymentMethod === 'manual' ? (
                    <button type="button" className="btn-secondary btn-sm" disabled={paying === f.id} onClick={() => pay(f)}>
                      {t('fixed.markPaid')}
                    </button>
                  ) : (
                    <span className="to-chip ex-chip-auto">{t('status.automatic')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card ex-card">
          <h3 className="card-title m-0">{t('summary.byCategory')}</h3>
          {data.byCategory.length === 0 ? (
            <p className="ex-muted">{t('summary.noSpending', { month })}</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {data.byCategory.map((c) => (
                <div key={c.categoryId ?? 'none'} className="ex-cat-row">
                  <span className="truncate">{categoryLabel(t, c.categoryId ? categories.get(c.categoryId) : null)}</span>
                  <div className="ex-bar">
                    <div className="ex-bar-fill" style={{ width: `${Math.max(2, (c.cents / maxCat) * 100)}%` }} />
                  </div>
                  <span className="num text-right">{money(c.cents)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <ExpensesInsights token={token} meta={meta} period={period} onChanged={load} />

      <section className="card ex-info">
        <div>
          <strong>{t('summary.infoEncryptedTitle')}</strong>
          <span>{t('summary.infoEncryptedBody')}</span>
        </div>
        <div>
          <strong>{t('summary.infoCsvTitle')}</strong>
          <span>{t('summary.infoCsvBody')}</span>
        </div>
        <div>
          <strong>{t('summary.infoWhoTitle')}</strong>
          <span>{t('summary.infoWhoBody')}</span>
        </div>
      </section>
    </>
  );
}
