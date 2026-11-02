import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, type ExpenseAccount, type ExpenseAccountType, type ExpensesMeta } from '../../api';
import Modal from '../../components/common/Modal';
import RequiredMark from '../../components/common/RequiredMark';
import { ListAddRow } from '../../components/common/TableBody';
import { useToast } from '../../components/common/ToastProvider';
import { ExpensesPage, categoryLabel, shortDate } from './expensesShared';

// Gastos → Cuentas y categorías (A5). An account's import format (sign convention, columns) is
// saved by the CSV import wizard (A6) the first time; until then the card says so.
// Each card opens the account editor; "Importar CSV" opens the wizard on that account.
export default function ExpensesAccountsPage({ token }: { token: string }) {
  return (
    <ExpensesPage token={token} section="accounts">
      {(meta, reloadMeta) => <AccountsBody token={token} meta={meta} reloadMeta={reloadMeta} />}
    </ExpensesPage>
  );
}

const ACCOUNT_TYPES: ExpenseAccountType[] = ['credit_card', 'bank', 'cash', 'other'];

function AccountsBody({ token, meta, reloadMeta }: { token: string; meta: ExpensesMeta; reloadMeta: () => void }) {
  const { t, i18n } = useTranslation('expenses');
  const toast = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<ExpenseAccount | 'new' | null>(null);
  const [newCategory, setNewCategory] = useState<string | null>(null);

  const addCategory = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCategory?.trim()) return;
    try {
      await api.createExpenseCategory(token, newCategory.trim());
      toast.success(t('accounts.categoryCreated'));
      setNewCategory(null);
      reloadMeta();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <>
      <div className="ex-accounts">
        {meta.accounts.map((a) => (
          <div
            key={a.id}
            role="button"
            tabIndex={0}
            className={`card ex-account ${a.isActive ? '' : 'opacity-60'}`}
            onClick={() => setEditing(a)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setEditing(a);
              }
            }}
          >
            <span className="ex-account-type">
              {t(`accountType.${a.type}`)}
              {!a.isActive && ` · ${t('accounts.inactive')}`}
            </span>
            <strong className="text-base">{a.name}</strong>
            <span className="text-sm">
              {t('accounts.importFormat')}: <strong>{a.importProfile?.convention ? t(`convention.${a.importProfile.convention}`) : a.type === 'cash' ? t('accounts.manualOnly') : t('accounts.noProfile')}</strong>
            </span>
            <span className="ex-muted text-xs">
              {a.lastImportAt ? t('accounts.lastImport', { date: shortDate(a.lastImportAt.slice(0, 10), i18n.language) }) : t('accounts.neverImported')}
            </span>
            {a.isActive && a.type !== 'cash' && (
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/expenses/import?account=${a.id}`);
                }}
              >
                {t('movements.importCsv')}
              </button>
            )}
          </div>
        ))}
        <button type="button" className="ex-account-add" onClick={() => setEditing('new')}>
          <span className="ghost-plus-box">+</span>
          {meta.accounts.length === 0 ? t('state.addAccount') : t('accounts.add')}
        </button>
      </div>

      <section className="card ex-card">
        <div>
          <h3 className="card-title m-0">{t('accounts.categoriesTitle')}</h3>
          <p className="ex-muted m-0 mt-1 text-sm">{t('accounts.categoriesBody')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {meta.categories.map((c) => (
            <span key={c.id} className={`role-chip chip-neutral ${c.isActive ? '' : 'opacity-50'}`}>
              {categoryLabel(t, c)}
            </span>
          ))}
        </div>
        {newCategory === null ? (
          <ListAddRow label={t('accounts.addCategory')} onAdd={() => setNewCategory('')} />
        ) : (
          <form className="flex flex-wrap items-center gap-2" onSubmit={addCategory}>
            <input
              autoFocus
              maxLength={60}
              className="max-w-xs"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder={t('accounts.categoryPlaceholder')}
              aria-label={t('accounts.addCategory')}
            />
            <button type="submit" className="btn-primary btn-sm">
              {t('accountModal.save')}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setNewCategory(null)}>
              {t('accountModal.cancel')}
            </button>
          </form>
        )}
      </section>

      <BudgetsCard token={token} meta={meta} reloadMeta={reloadMeta} />

      {editing && (
        <AccountModal
          token={token}
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reloadMeta();
          }}
        />
      )}
    </>
  );
}

function AccountModal({
  token,
  existing,
  onClose,
  onSaved,
}: {
  token: string;
  existing: ExpenseAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation('expenses');
  const toast = useToast();
  const [form, setForm] = useState({
    name: existing?.name ?? '',
    type: (existing?.type ?? 'credit_card') as ExpenseAccountType,
    isActive: existing?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (existing) {
        await api.updateExpenseAccount(token, existing.id, form);
        toast.success(t('accountModal.updated'));
      } else {
        await api.createExpenseAccount(token, { name: form.name, type: form.type });
        toast.success(t('accountModal.created'));
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
      title={existing ? t('accountModal.editTitle') : t('accountModal.newTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('accountModal.cancel')}
          </button>
          <button type="submit" form="expense-account-form" className="btn-primary" disabled={saving}>
            {saving ? t('accountModal.saving') : t('accountModal.save')}
          </button>
        </>
      }
    >
      <form id="expense-account-form" onSubmit={submit}>
        <div className="form-group">
          <label htmlFor="exa-name">
            {t('accountModal.name')}
            <RequiredMark />
          </label>
          <input
            id="exa-name"
            required
            autoFocus
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t('accountModal.namePlaceholder')}
          />
          <p className="ex-hint">{t('accountModal.nameHint')}</p>
        </div>
        <div className="form-group">
          <label htmlFor="exa-type">{t('accountModal.type')}</label>
          <select id="exa-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ExpenseAccountType })}>
            {ACCOUNT_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`accountType.${type}`)}
              </option>
            ))}
          </select>
        </div>
        {existing && (
          <div className="form-group">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              {t('accountModal.active')}
            </label>
            <p className="ex-hint">{t('accountModal.activeHint')}</p>
          </div>
        )}
      </form>
    </Modal>
  );
}

// Cruces D4: a monthly budget per category — the Resumen warns at 80% and flags 100%.
function BudgetsCard({ token, meta, reloadMeta }: { token: string; meta: ExpensesMeta; reloadMeta: () => void }) {
  const { t } = useTranslation('expenses');
  const toast = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const active = meta.categories.filter((c) => c.isActive);

  const save = async (categoryId: string, value: string, current: string) => {
    if (value === current) return;
    try {
      await api.setExpenseCategoryBudget(token, categoryId, value.trim() || null);
      toast.success(t('insights.budgetSaved'));
      reloadMeta();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <section className="card ex-card">
      <div>
        <h3 className="card-title m-0">{t('insights.budgetsTitle')}</h3>
        <p className="ex-muted m-0 mt-1 text-sm">{t('insights.budgetsBody')}</p>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))' }}>
        {active.map((c) => {
          const current = c.budgetCents ? String(c.budgetCents / 100) : '';
          const value = drafts[c.id] ?? current;
          return (
            <label key={c.id} className="ex-field">
              {categoryLabel(t, c)}
              <input
                inputMode="decimal"
                value={value}
                placeholder={t('insights.noBudget')}
                onChange={(e) => setDrafts({ ...drafts, [c.id]: e.target.value })}
                onBlur={(e) => save(c.id, e.target.value, current)}
              />
            </label>
          );
        })}
      </div>
    </section>
  );
}
