import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ExpensesMeta, type FixedExpense, type FixedPaymentMethod, type FixedStatus } from '../../api';
import Modal from '../../components/common/Modal';
import RequiredMark from '../../components/common/RequiredMark';
import TableBody from '../../components/common/TableBody';
import TableSkeleton from '../../components/common/TableSkeleton';
import { useToast } from '../../components/common/ToastProvider';
import { formatNumber } from '../../lib/currencies';
import { ExpensesPage, MonthStepper, categoryLabel, currentPeriod, monthName, useMoney } from './expensesShared';

// Gastos → Gastos fijos (A5). Auto debit and card book themselves on their day (A3, estimated until
// a CSV import confirms them); only manual-payment ones get the "Mark paid" button.
export default function ExpensesFixedPage({ token }: { token: string }) {
  return <ExpensesPage token={token} section="fixed">{(meta) => <FixedBody token={token} meta={meta} />}</ExpensesPage>;
}

const STATUS_CHIP: Record<FixedStatus, string> = {
  paid: 'to-chip-approved',
  estimated: 'ex-chip-auto',
  scheduled: 'to-chip-cancelled',
  due: 'to-chip-pending',
  overdue: 'to-chip-rejected',
};

function FixedBody({ token, meta }: { token: string; meta: ExpensesMeta }) {
  const { t, i18n } = useTranslation('expenses');
  const toast = useToast();
  const money = useMoney(meta.currency);
  const [period, setPeriod] = useState(currentPeriod(meta.today));
  const [rows, setRows] = useState<FixedExpense[] | null>(null);
  const [editing, setEditing] = useState<FixedExpense | 'new' | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const accounts = useMemo(() => new Map(meta.accounts.map((a) => [a.id, a])), [meta.accounts]);
  const categories = useMemo(() => new Map(meta.categories.map((c) => [c.id, c])), [meta.categories]);
  const month = monthName(period, i18n.language);

  const load = () =>
    api
      .listFixedExpenses(token, period)
      .then(setRows)
      .catch((e) => toast.error((e as Error).message));
  useEffect(() => {
    setRows(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, period]);

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

  return (
    <>
      <MonthStepper period={period} onChange={setPeriod} />
      {rows === null ? (
        <TableSkeleton rows={5} />
      ) : (
        <div className="full-table-wrap">
          <table className="table full-table to-table">
            <thead>
              <tr>
                <th>{t('fixed.columns.day')}</th>
                <th>{t('fixed.columns.name')}</th>
                <th>{t('fixed.columns.method')}</th>
                <th>{t('fixed.columns.account')}</th>
                <th className="text-right">{t('fixed.columns.amount')}</th>
                <th className="capitalize">{month}</th>
                <th>{t('fixed.columns.action')}</th>
              </tr>
            </thead>
            <TableBody
              colSpan={7}
              isEmpty={rows.length === 0}
              empty={
                meta.accounts.length === 0
                  ? { title: t('state.noAccountsTitle'), body: t('state.noAccountsBody') }
                  : { title: t('fixed.emptyTitle'), body: t('fixed.emptyBody') }
              }
              onAdd={meta.accounts.length > 0 ? () => setEditing('new') : undefined}
              addLabel={t('fixed.add')}
            >
              {rows.map((f) => (
                <tr key={f.id} className={f.isActive ? '' : 'opacity-60'}>
                  <td className="whitespace-nowrap">{t('fixed.day', { day: f.dayOfMonth })}</td>
                  <td className="!whitespace-normal">
                    <button type="button" className="table-link text-left" onClick={() => setEditing(f)}>
                      <span className="flex flex-col">
                        <strong>{f.name}</strong>
                        <span className="ex-muted text-xs">{categoryLabel(t, f.categoryId ? categories.get(f.categoryId) : null)}</span>
                      </span>
                    </button>
                  </td>
                  <td>{t(`method.${f.paymentMethod}`)}</td>
                  <td className="ex-muted">{f.accountId ? (accounts.get(f.accountId)?.name ?? '—') : '—'}</td>
                  <td className="num text-right whitespace-nowrap">
                    {money(f.amountCents)}
                    {f.bookedAmountCents !== null && f.bookedAmountCents !== f.amountCents && (
                      <span className="ex-muted block text-xs">{t('fixed.realAmount', { amount: money(f.bookedAmountCents) })}</span>
                    )}
                  </td>
                  <td>
                    {f.isActive ? (
                      <span className={`to-chip ${STATUS_CHIP[f.status]}`}>{t(`status.${f.status}`)}</span>
                    ) : (
                      <span className="to-chip to-chip-cancelled">{t('fixed.inactive')}</span>
                    )}
                  </td>
                  <td>
                    {!f.isActive ? null : f.paymentMethod === 'manual' ? (
                      <button
                        type="button"
                        className="btn-secondary btn-sm"
                        disabled={paying === f.id || f.status === 'paid'}
                        onClick={() => pay(f)}
                      >
                        {t('fixed.markPaid')}
                      </button>
                    ) : (
                      <span className="ex-muted text-xs">{t('status.chargesItself')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </TableBody>
          </table>
        </div>
      )}

      <section className="card ex-info">
        <div>
          <strong>{t('fixed.infoAutoTitle')}</strong>
          <span>{t('fixed.infoAutoBody')}</span>
        </div>
        <div>
          <strong>{t('fixed.infoCsvTitle')}</strong>
          <span>{t('fixed.infoCsvBody')}</span>
        </div>
        <div>
          <strong>{t('fixed.infoManualTitle')}</strong>
          <span>{t('fixed.infoManualBody')}</span>
        </div>
      </section>

      {editing && (
        <FixedModal
          token={token}
          meta={meta}
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

// Amount typed back in the company's number format, so editing shows "25.000,00" in Argentina.
function centsToInput(cents: number) {
  return formatNumber(cents / 100, 2);
}

function FixedModal({
  token,
  meta,
  existing,
  onClose,
  onSaved,
}: {
  token: string;
  meta: ExpensesMeta;
  existing: FixedExpense | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation('expenses');
  const toast = useToast();
  const selectableAccounts = meta.accounts.filter((a) => a.isActive || a.id === existing?.accountId);
  const [form, setForm] = useState({
    name: existing?.name ?? '',
    amount: existing ? centsToInput(existing.amountCents) : '',
    dayOfMonth: String(existing?.dayOfMonth ?? ''),
    paymentMethod: (existing?.paymentMethod ?? 'auto_debit') as FixedPaymentMethod,
    accountId: existing?.accountId ?? selectableAccounts[0]?.id ?? '',
    categoryId: existing?.categoryId ?? '',
    departmentId: existing?.departmentId ?? '',
    isActive: existing?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  // A card charge naturally comes out of a credit card account, auto debit out of a bank account.
  const pickMethod = (paymentMethod: FixedPaymentMethod) => {
    const wanted = paymentMethod === 'card' ? 'credit_card' : paymentMethod === 'auto_debit' ? 'bank' : null;
    const current = meta.accounts.find((a) => a.id === form.accountId);
    const better = wanted && current?.type !== wanted ? selectableAccounts.find((a) => a.type === wanted) : undefined;
    setForm({ ...form, paymentMethod, accountId: better?.id ?? form.accountId });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const input = {
      name: form.name,
      amount: form.amount,
      dayOfMonth: Number(form.dayOfMonth),
      paymentMethod: form.paymentMethod,
      accountId: form.accountId,
      categoryId: form.categoryId || null,
      departmentId: form.departmentId || null,
    };
    try {
      if (existing) {
        await api.updateFixedExpense(token, existing.id, { ...input, isActive: form.isActive });
        toast.success(t('fixedModal.updated'));
      } else {
        await api.createFixedExpense(token, input);
        toast.success(t('fixedModal.created'));
      }
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={existing ? t('fixedModal.editTitle') : t('fixedModal.newTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('fixedModal.cancel')}
          </button>
          <button type="submit" form="fixed-expense-form" className="btn-primary" disabled={saving}>
            {saving ? t('fixedModal.saving') : t('fixedModal.save')}
          </button>
        </>
      }
    >
      <form id="fixed-expense-form" onSubmit={submit}>
        <div className="form-group">
          <label htmlFor="fx-name">
            {t('fixedModal.name')}
            <RequiredMark />
          </label>
          <input
            id="fx-name"
            required
            autoFocus
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('fixedModal.namePlaceholder')}
          />
        </div>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <div className="form-group">
            <label htmlFor="fx-amount">
              {t('fixedModal.amount')}
              <RequiredMark />
            </label>
            <input
              id="fx-amount"
              required
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder={t('fixedModal.amountPlaceholder')}
            />
          </div>
          <div className="form-group">
            <label htmlFor="fx-day">
              {t('fixedModal.day')}
              <RequiredMark />
            </label>
            <input
              id="fx-day"
              required
              type="number"
              min={1}
              max={31}
              value={form.dayOfMonth}
              onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })}
            />
            <p className="ex-hint">{t('fixedModal.dayHint')}</p>
          </div>
          <div className="form-group">
            <label htmlFor="fx-method">{t('fixedModal.method')}</label>
            <select id="fx-method" value={form.paymentMethod} onChange={(e) => pickMethod(e.target.value as FixedPaymentMethod)}>
              <option value="auto_debit">{t('method.auto_debit')}</option>
              <option value="card">{t('method.card')}</option>
              <option value="manual">{t('method.manual')}</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="fx-acc">
              {t('fixedModal.account')}
              <RequiredMark />
            </label>
            <select id="fx-acc" required value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
              {selectableAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <p className="ex-hint">{t('fixedModal.accountHint')}</p>
          </div>
          <div className="form-group">
            <label htmlFor="fx-cat">{t('fixedModal.category')}</label>
            <select id="fx-cat" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">{t('categories.none')}</option>
              {meta.categories
                .filter((c) => c.isActive || c.id === existing?.categoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {categoryLabel(t, c)}
                  </option>
                ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="fx-dept">{t('fixedModal.department')}</label>
            <select id="fx-dept" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
              <option value="">{t('fixedModal.noneOption')}</option>
              {meta.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {existing && (
          <div className="form-group">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              {t('fixedModal.active')}
            </label>
            <p className="ex-hint">{t('fixedModal.activeHint')}</p>
          </div>
        )}
      </form>
    </Modal>
  );
}
