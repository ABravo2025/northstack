import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { api, ApiError, type ExpenseCategory, type ExpensesMeta } from '../../api';
import { ChevronLeftIcon, ChevronRightIcon, LockIcon } from '../../components/common/Icons';
import TableSkeleton from '../../components/common/TableSkeleton';
import { formatMoney } from '../../lib/currencies';
import { usePermissions } from '../../contexts/PermissionsContext';

// Gastos / Expenses (spec-clientes-gastos-formularios.md, A5) — what every Gastos screen shares:
// loading the accounts/categories/departments once, the "not configured" and "no permission"
// states, the page header with the encryption badge, and the month stepper.

export type MetaState =
  | { status: 'loading' }
  | { status: 'ready'; meta: ExpensesMeta }
  | { status: 'notConfigured' }
  | { status: 'error'; message: string };

export function useExpensesMeta(token: string) {
  const [state, setState] = useState<MetaState>({ status: 'loading' });
  const load = useCallback(() => {
    api
      .getExpensesMeta(token)
      .then((meta) => setState({ status: 'ready', meta }))
      .catch((error) => {
        const body = error instanceof ApiError ? (error.body as { code?: string } | undefined) : undefined;
        if (body?.code === 'expenses_not_configured') setState({ status: 'notConfigured' });
        else setState({ status: 'error', message: (error as Error).message });
      });
  }, [token]);
  useEffect(load, [load]);
  return { state, reload: load };
}

export function currentPeriod(today?: string): string {
  return (today ?? new Date().toISOString()).slice(0, 7);
}

export function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function localeTag(language: string) {
  return language.startsWith('es') ? 'es-AR' : 'en-US';
}

export function monthName(period: string, language: string, withYear = false): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(localeTag(language), {
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

export function shortDate(date: string, language: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(localeTag(language), { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// Seeded categories are translated by their systemKey; a company's own ones show as typed.
export function categoryLabel(t: TFunction, category: Pick<ExpenseCategory, 'systemKey' | 'name'> | null | undefined): string {
  if (!category) return t('expenses:categories.none');
  return category.systemKey ? t(`expenses:categories.${category.systemKey}`, { defaultValue: category.name }) : category.name;
}

export function useMoney(currency: string) {
  return useCallback((cents: number) => formatMoney(cents, currency), [currency]);
}

export function EncryptedBadge() {
  const { t } = useTranslation('expenses');
  return (
    <span className="ex-lock">
      <LockIcon className="h-3.5 w-3.5" />
      {t('encrypted')}
    </span>
  );
}

export function MonthStepper({ period, onChange }: { period: string; onChange: (p: string) => void }) {
  const { t, i18n } = useTranslation('expenses');
  const label = monthName(period, i18n.language, true);
  return (
    <div className="ex-month">
      <button type="button" className="ex-month-btn" onClick={() => onChange(shiftPeriod(period, -1))} aria-label={t('month.previous')}>
        <ChevronLeftIcon className="h-4 w-4" />
      </button>
      <span className="ex-month-label">{label.charAt(0).toUpperCase() + label.slice(1)}</span>
      <button type="button" className="ex-month-btn" onClick={() => onChange(shiftPeriod(period, 1))} aria-label={t('month.next')}>
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

// The page frame: title + subtitle + badge, then either the page or the right blocking state.
export function ExpensesPage({
  token,
  section,
  actions,
  children,
}: {
  token: string;
  section: 'summary' | 'movements' | 'fixed' | 'accounts' | 'import' | 'cashflow';
  actions?: ReactNode;
  children: (meta: ExpensesMeta, reloadMeta: () => void) => ReactNode;
}) {
  const { t } = useTranslation('expenses');
  const permissions = usePermissions();
  const { state, reload } = useExpensesMeta(token);
  const allowed = permissions.has('manage_expenses');

  return (
    <div className="container sh-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="to-title">{t(`titles.${section}`)}</h2>
          <p className="to-subtitle max-w-3xl">{t(`subtitles.${section}`)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <EncryptedBadge />
        </div>
      </div>
      {!allowed ? (
        <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('state.noPermission')}</p>
      ) : state.status === 'loading' ? (
        <TableSkeleton rows={5} />
      ) : state.status === 'notConfigured' ? (
        <div className="card sh-note-warn text-sm">{t('state.notConfigured')}</div>
      ) : state.status === 'error' ? (
        <div className="card text-sm">{t('state.loadFailed', { error: state.message })}</div>
      ) : (
        children(state.meta, reload)
      )}
    </div>
  );
}
