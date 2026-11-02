import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, type ExpenseDirection, type ExpenseKind, type ExpenseMovement, type ExpensesMeta } from '../../api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import RequiredMark from '../../components/common/RequiredMark';
import TableBody from '../../components/common/TableBody';
import TableSkeleton from '../../components/common/TableSkeleton';
import { TrashIcon, UploadIcon } from '../../components/common/Icons';
import { useToast } from '../../components/common/ToastProvider';
import { ExpensesPage, MonthStepper, categoryLabel, currentPeriod, monthName, shortDate, useMoney } from './expensesShared';

// Gastos → Movimientos (A5). Changing an expense's category teaches a rule (backend), so the
// toast says how many similar ones it fixed too. "Importar CSV" opens the wizard (A6).
export default function ExpensesMovementsPage({ token }: { token: string }) {
  return (
    <ExpensesPage token={token} section="movements">
      {(meta, reloadMeta) => <MovementsBody token={token} meta={meta} reloadMeta={reloadMeta} />}
    </ExpensesPage>
  );
}

const KIND_CHIP: Record<ExpenseKind, string> = {
  expense: 'to-chip-cancelled',
  credit: 'to-chip-approved',
  internal: 'ex-chip-auto',
};

function MovementsBody({ token, meta, reloadMeta }: { token: string; meta: ExpensesMeta; reloadMeta: () => void }) {
  const { t, i18n } = useTranslation('expenses');
  const toast = useToast();
  const navigate = useNavigate();
  const money = useMoney(meta.currency);
  const [period, setPeriod] = useState(currentPeriod(meta.today));
  const [rows, setRows] = useState<ExpenseMovement[] | null>(null);
  const [q, setQ] = useState('');
  const [accountId, setAccountId] = useState('');
  const [kind, setKind] = useState<'' | ExpenseKind>('');
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<ExpenseMovement | null>(null);

  const accounts = useMemo(() => new Map(meta.accounts.map((a) => [a.id, a])), [meta.accounts]);
  // Cruces D1: an expense can be assigned to a client, to count in that client's profitability.
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api
      .listCompanies(token)
      .then((cs) => setCompanies(cs.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setCompanies([]));
  }, [token]);
  const activeCategories = meta.categories.filter((c) => c.isActive);

  const load = () =>
    api
      .listExpenseMovements(token, { period, accountId: accountId || undefined, kind: kind || undefined })
      .then(setRows)
      .catch((e) => toast.error((e as Error).message));
  useEffect(() => {
    setRows(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, period, accountId, kind]);

  // Search runs on the already-decrypted rows of the month.
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((m) => !needle || m.description.toLowerCase().includes(needle));
  }, [rows, q]);
  const filteredSpend = visible
    .filter((m) => m.kind === 'expense')
    .reduce((sum, m) => sum + (m.direction === 'debit' ? m.amountCents : -m.amountCents), 0);

  const patch = async (m: ExpenseMovement, input: { categoryId?: string | null; departmentId?: string | null; companyId?: string | null }) => {
    try {
      const { movement, appliedToOthers } = await api.updateExpenseMovement(token, m.id, input);
      setRows((prev) => prev?.map((r) => (r.id === movement.id ? movement : r)) ?? prev);
      if (input.categoryId !== undefined && input.categoryId) {
        toast.success(appliedToOthers > 0 ? t('movements.ruleApplied', { count: appliedToOthers }) : t('movements.ruleSaved'));
        if (appliedToOthers > 0) load();
        reloadMeta();
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await api.deleteExpenseMovement(token, deleting.id);
      setRows((prev) => prev?.filter((r) => r.id !== deleting.id) ?? prev);
      toast.success(t('movements.deleted'));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(null);
    }
  };

  const filtered = Boolean(q || accountId || kind);

  return (
    <>
      <div className="ex-filters">
        <MonthStepper period={period} onChange={setPeriod} />
        <label className="ex-field grow">
          {t('movements.search')}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('movements.searchPlaceholder')} />
        </label>
        <label className="ex-field">
          {t('movements.account')}
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">{t('movements.allAccounts')}</option>
            {meta.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="ex-field">
          {t('movements.type')}
          <select value={kind} onChange={(e) => setKind(e.target.value as '' | ExpenseKind)}>
            <option value="">{t('movements.allTypes')}</option>
            <option value="expense">{t('kind.expense')}</option>
            <option value="credit">{t('kind.credit')}</option>
            <option value="internal">{t('kind.internal')}</option>
          </select>
        </label>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => navigate(`/expenses/import${accountId ? `?account=${accountId}` : ''}`)}
        >
          <UploadIcon className="h-4 w-4" />
          {t('movements.importCsv')}
        </button>
      </div>

      {rows === null ? (
        <TableSkeleton rows={6} />
      ) : (
        <div className="full-table-wrap">
          <table className="table full-table to-table">
            <thead>
              <tr>
                <th>{t('movements.columns.date')}</th>
                <th>{t('movements.columns.description')}</th>
                <th>{t('movements.columns.account')}</th>
                <th>{t('movements.columns.category')}</th>
                <th>{t('movements.columns.department')}</th>
                {companies.length > 0 && <th>{t('movements.columns.client')}</th>}
                <th>{t('movements.columns.type')}</th>
                <th className="text-right">{t('movements.columns.amount')}</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <TableBody
              colSpan={companies.length > 0 ? 9 : 8}
              isEmpty={visible.length === 0}
              empty={
                filtered
                  ? { title: t('movements.emptyFiltered') }
                  : meta.accounts.length === 0
                    ? { title: t('state.noAccountsTitle'), body: t('state.noAccountsBody') }
                    : { title: t('movements.emptyTitle', { month: monthName(period, i18n.language) }), body: t('movements.emptyBody') }
              }
              onAdd={meta.accounts.length > 0 ? () => setAdding(true) : undefined}
              addLabel={t('movements.add')}
            >
              {visible.map((m) => {
                const isRefund = m.kind === 'expense' && m.direction === 'credit';
                return (
                  <tr key={m.id}>
                    <td className="ex-muted whitespace-nowrap">{shortDate(m.date, i18n.language)}</td>
                    <td className="!whitespace-normal">
                      <span className="flex flex-col">
                        <span>{m.description}</span>
                        <span className="ex-muted text-xs">
                          {m.source === 'fixed_auto' && !m.isEstimated ? t('source.fixed_auto_confirmed') : t(`source.${m.source}`)}
                          {m.installment ? ` · ${m.installment}` : ''}
                        </span>
                      </span>
                    </td>
                    <td className="ex-muted">{accounts.get(m.accountId)?.name ?? '—'}</td>
                    <td>
                      {m.kind === 'expense' ? (
                        <select
                          className="ex-inline-select"
                          aria-label={t('movements.columns.category')}
                          value={m.categoryId ?? ''}
                          onChange={(e) => patch(m, { categoryId: e.target.value || null })}
                        >
                          <option value="">{t('categories.none')}</option>
                          {activeCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {categoryLabel(t, c)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="ex-muted">—</span>
                      )}
                    </td>
                    <td>
                      <select
                        className="ex-inline-select"
                        aria-label={t('movements.columns.department')}
                        value={m.departmentId ?? ''}
                        onChange={(e) => patch(m, { departmentId: e.target.value || null })}
                      >
                        <option value="">{t('movements.noDepartment')}</option>
                        {meta.departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    {companies.length > 0 && (
                      <td>
                        {m.kind === 'expense' ? (
                          <select
                            className="ex-inline-select"
                            aria-label={t('movements.columns.client')}
                            value={m.companyId ?? ''}
                            onChange={(e) => patch(m, { companyId: e.target.value || null })}
                          >
                            <option value="">{t('movements.noClient')}</option>
                            {companies.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="ex-muted">—</span>
                        )}
                      </td>
                    )}
                    <td>
                      <span className={`to-chip ${isRefund ? 'to-chip-approved' : KIND_CHIP[m.kind]}`}>
                        {isRefund ? t('kind.refund') : t(`kind.${m.kind}`)}
                      </span>
                      {m.isEstimated && <span className="ex-muted ml-1.5 text-xs">{t('movements.estimated')}</span>}
                    </td>
                    <td className={`num text-right whitespace-nowrap ${m.direction === 'credit' ? 'text-emerald-700 dark:text-emerald-300' : ''}`}>
                      {m.direction === 'credit' ? '+ ' : ''}
                      {money(m.amountCents)}
                    </td>
                    <td className="w-10 text-right">
                      {m.source === 'fixed_auto' ? (
                        <span className="ex-muted text-xs" title={t('movements.autoHint')}>
                          ·
                        </span>
                      ) : (
                        <button type="button" className="icon-btn" aria-label={t('movements.delete')} title={t('movements.delete')} onClick={() => setDeleting(m)}>
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </TableBody>
            {visible.length > 0 && (
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={companies.length > 0 ? 6 : 5}>{t('movements.count', { count: visible.length })}</td>
                  <td colSpan={3} className="num text-right">
                    {t('movements.filteredTotal', { amount: money(filteredSpend) })}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      <p className="m-0 text-xs text-ink-muted dark:text-dark-ink-muted">{t('movements.rulesNote', { count: meta.ruleCount })}</p>

      {adding && (
        <MovementModal
          token={token}
          meta={meta}
          defaultDate={period === currentPeriod(meta.today) ? meta.today : `${period}-01`}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t('movements.deleteConfirmTitle')}
          message={t('movements.deleteConfirmBody', { description: deleting.description, amount: money(deleting.amountCents) })}
          confirmLabel={t('movements.delete')}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function MovementModal({
  token,
  meta,
  defaultDate,
  onClose,
  onCreated,
}: {
  token: string;
  meta: ExpensesMeta;
  defaultDate: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation('expenses');
  const toast = useToast();
  const activeAccounts = meta.accounts.filter((a) => a.isActive);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    date: defaultDate,
    direction: 'debit' as ExpenseDirection,
    accountId: activeAccounts.find((a) => a.type === 'cash')?.id ?? activeAccounts[0]?.id ?? '',
    categoryId: '',
    departmentId: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createExpenseMovement(token, {
        ...form,
        categoryId: form.direction === 'debit' ? form.categoryId || null : null,
        departmentId: form.departmentId || null,
      });
      toast.success(t('movementModal.created'));
      onCreated();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={t('movementModal.title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('movementModal.cancel')}
          </button>
          <button type="submit" form="expense-movement-form" className="btn-primary" disabled={saving}>
            {saving ? t('movementModal.saving') : t('movementModal.save')}
          </button>
        </>
      }
    >
      <form id="expense-movement-form" onSubmit={submit}>
        <div className="form-group">
          <label htmlFor="exm-desc">
            {t('movementModal.description')}
            <RequiredMark />
          </label>
          <input
            id="exm-desc"
            required
            autoFocus
            maxLength={200}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder={t('movementModal.descriptionPlaceholder')}
          />
        </div>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <div className="form-group">
            <label htmlFor="exm-amount">
              {t('movementModal.amount')}
              <RequiredMark />
            </label>
            <input
              id="exm-amount"
              required
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder={t('movementModal.amountPlaceholder')}
            />
          </div>
          <div className="form-group">
            <label htmlFor="exm-date">{t('movementModal.date')}</label>
            <input id="exm-date" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="form-group">
            <label htmlFor="exm-dir">{t('movementModal.direction')}</label>
            <select id="exm-dir" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as ExpenseDirection })}>
              <option value="debit">{t('movementModal.debit')}</option>
              <option value="credit">{t('movementModal.credit')}</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="exm-acc">
              {t('movementModal.account')}
              <RequiredMark />
            </label>
            <select id="exm-acc" required value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          {form.direction === 'debit' && (
            <div className="form-group">
              <label htmlFor="exm-cat">{t('movementModal.category')}</label>
              <select id="exm-cat" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">{t('categories.none')}</option>
                {meta.categories
                  .filter((c) => c.isActive)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {categoryLabel(t, c)}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="form-group">
            <label htmlFor="exm-dept">{t('movementModal.department')}</label>
            <select id="exm-dept" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
              <option value="">{t('movementModal.noneOption')}</option>
              {meta.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="exm-note">{t('movementModal.note')}</label>
          <textarea id="exm-note" rows={2} maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>
      </form>
    </Modal>
  );
}
