import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ExpenseInsights, type ExpensesMeta } from '../../api';
import { useToast } from '../../components/common/ToastProvider';
import { categoryLabel, useMoney } from './expensesShared';

// Cruces D4, on the Resumen: budgets per category (80% warns, 100% is over), charges that look like
// a subscription not yet set up as a fixed expense, and fixed expenses that came in higher.
export default function ExpensesInsights({ token, meta, period, onChanged }: { token: string; meta: ExpensesMeta; period: string; onChanged: () => void }) {
  const { t } = useTranslation('expenses');
  const toast = useToast();
  const money = useMoney(meta.currency);
  const [data, setData] = useState<ExpenseInsights | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    api.getExpenseInsights(token, period).then(setData).catch(() => setData(null));
  }, [token, period]);
  useEffect(load, [load]);

  if (!data) return null;
  const categories = new Map(meta.categories.map((c) => [c.id, c]));
  const accounts = new Map(meta.accounts.map((a) => [a.id, a]));
  const subs = data.subscriptions.filter((s) => !dismissed.has(s.key));
  if (!data.budgets.length && !subs.length && !data.increases.length) return null;

  const addFixed = async (s: ExpenseInsights['subscriptions'][number]) => {
    try {
      await api.createFixedExpense(token, {
        name: s.name,
        amount: String(s.amountCents / 100),
        dayOfMonth: s.dayOfMonth,
        paymentMethod: accounts.get(s.accountId)?.type === 'credit_card' ? 'card' : 'auto_debit',
        accountId: s.accountId,
        categoryId: s.categoryId,
        departmentId: null,
      });
      toast.success(t('insights.fixedCreated', { name: s.name }));
      load();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const updateAmount = async (i: ExpenseInsights['increases'][number]) => {
    try {
      await api.updateFixedExpense(token, i.fixedExpenseId, { amount: String(i.actualCents / 100) });
      toast.success(t('insights.amountUpdated', { name: i.name }));
      load();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="ex-two">
      {data.budgets.length > 0 && (
        <section className="card ex-card">
          <h3 className="card-title m-0">{t('insights.budgets')}</h3>
          <div className="flex flex-col gap-2.5">
            {data.budgets.map((b) => (
              <div key={b.categoryId} className="flex flex-col gap-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate">{categoryLabel(t, categories.get(b.categoryId))}</span>
                  <span className={`num ${b.status === 'over' ? 'font-semibold text-red-700 dark:text-red-300' : b.status === 'warn' ? 'text-amber-700 dark:text-amber-300' : ''}`}>
                    {money(b.spentCents)} / {money(b.budgetCents)} ({b.pct}%)
                  </span>
                </div>
                <div className="ex-bar">
                  <div className="ex-bar-fill" style={{ width: `${Math.min(100, Math.max(2, b.pct))}%`, background: b.status === 'over' ? '#dc2626' : b.status === 'warn' ? '#d97706' : undefined }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {(subs.length > 0 || data.increases.length > 0) && (
        <section className="card ex-card">
          <h3 className="card-title m-0">{t('insights.suggestions')}</h3>
          <ul className="ex-due">
            {data.increases.map((i) => (
              <li key={i.fixedExpenseId}>
                <span className="flex min-w-0 flex-col">
                  <strong className="truncate text-sm">{t('insights.increased', { name: i.name, pct: i.pct })}</strong>
                  <span className="ex-muted text-xs">{t('insights.increasedDetail', { expected: money(i.expectedCents), actual: money(i.actualCents) })}</span>
                </span>
                <button type="button" className="btn-secondary btn-sm" onClick={() => updateAmount(i)}>
                  {t('insights.updateAmount')}
                </button>
              </li>
            ))}
            {subs.map((s) => (
              <li key={s.key}>
                <span className="flex min-w-0 flex-col">
                  <strong className="truncate text-sm">{t('insights.subscription', { name: s.name })}</strong>
                  <span className="ex-muted text-xs">
                    {t('insights.subscriptionDetail', { amount: money(s.amountCents), day: s.dayOfMonth, months: s.months, account: accounts.get(s.accountId)?.name ?? '—' })}
                  </span>
                </span>
                <span className="flex gap-1.5">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setDismissed(new Set([...dismissed, s.key]))}>
                    {t('insights.dismiss')}
                  </button>
                  <button type="button" className="btn-primary btn-sm" onClick={() => addFixed(s)}>
                    {t('insights.addFixed')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
