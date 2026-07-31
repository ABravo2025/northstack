import { useEffect, useState } from 'react';
import { api } from '../api';
import type { PayrollEntry } from '../api';
import { useToast } from '../components/common/ToastProvider';
import ConfirmDialog from '../components/common/ConfirmDialog';
import SlideOver from '../components/common/SlideOver';
import EmptyState from '../components/common/EmptyState';
import SearchableSelect from '../components/common/SearchableSelect';
import { DollarIcon, PencilIcon, PlusIcon, TrashIcon } from '../components/common/Icons';
import { formatMoney } from '../lib/currencies';

interface PayrollPageProps {
  token: string;
}

interface PayrollForm {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  amount: string;
  paymentDate: string;
}

const EMPTY_FORM: PayrollForm = { employeeId: '', periodStart: '', periodEnd: '', amount: '', paymentDate: '' };

export default function PayrollPage({ token }: PayrollPageProps) {
  const toast = useToast();
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [tenantCurrency, setTenantCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);

  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PayrollForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState<PayrollEntry | null>(null);

  useEffect(() => {
    loadEntries();
    api.listEmployees(token).then(setEmployees).catch(() => {});
    api
      .getCurrentTenant(token)
      .then((tenant) => setTenantCurrency(tenant.currency))
      .catch(() => {
        // Non-critical — falls back to USD formatting if it fails.
      });
  }, []);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const data = await api.listPayrollEntries(token);
      setEntries(data);
    } catch (error) {
      toast.error('Failed to load payroll entries: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const employeeOptions = employees.map((emp) => ({ value: emp.id, label: `${emp.firstName} ${emp.lastName}` }));

  const closeSlideOver = () => {
    setSlideOverOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleOpenAdd = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setSlideOverOpen(true);
  };

  const handleOpenEdit = (entry: PayrollEntry) => {
    setForm({
      employeeId: entry.employeeId,
      periodStart: entry.periodStart.slice(0, 10),
      periodEnd: entry.periodEnd.slice(0, 10),
      amount: (entry.amountCents / 100).toString(),
      paymentDate: entry.paymentDate.slice(0, 10),
    });
    setEditingId(entry.id);
    setSlideOverOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = Math.round(Number.parseFloat(form.amount || '0') * 100);
    const payload = {
      employeeId: form.employeeId,
      periodStart: form.periodStart,
      periodEnd: form.periodEnd,
      amountCents,
      paymentDate: form.paymentDate,
    };
    setSaving(true);
    try {
      if (editingId) {
        await api.updatePayrollEntry(token, editingId, payload);
        toast.success('Payroll entry updated.');
      } else {
        await api.createPayrollEntry(token, payload);
        toast.success('Payroll entry added.');
      }
      closeSlideOver();
      loadEntries();
    } catch (error) {
      toast.error('Failed to save payroll entry: ' + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingEntry) return;
    try {
      await api.deletePayrollEntry(token, deletingEntry.id);
      toast.success('Payroll entry deleted.');
      setDeletingEntry(null);
      loadEntries();
    } catch (error) {
      toast.error('Failed to delete payroll entry: ' + (error as Error).message);
    }
  };

  return (
    <div className="container">
      {deletingEntry && (
        <ConfirmDialog
          title="Delete payroll entry"
          message={`Delete the ${formatMoney(deletingEntry.amountCents, tenantCurrency)} entry for ${deletingEntry.employee.firstName} ${deletingEntry.employee.lastName}? This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeletingEntry(null)}
        />
      )}

      <SlideOver
        open={slideOverOpen}
        title={editingId ? 'Edit Payroll Entry' : 'Add Payroll Entry'}
        onClose={closeSlideOver}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeSlideOver} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="payroll-entry-form" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save' : 'Add entry'}
            </button>
          </>
        }
      >
        <form id="payroll-entry-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="payroll-employee">Employee</label>
            <SearchableSelect
              id="payroll-employee"
              options={employeeOptions}
              value={form.employeeId}
              onChange={(employeeId) => setForm({ ...form, employeeId })}
              placeholder="Search employees…"
            />
          </div>
          <div className="form-group">
            <label htmlFor="payroll-period-start">Period start</label>
            <input
              id="payroll-period-start"
              type="date"
              value={form.periodStart}
              onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="payroll-period-end">Period end</label>
            <input
              id="payroll-period-end"
              type="date"
              value={form.periodEnd}
              onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="payroll-amount">Amount ({tenantCurrency})</label>
            <input
              id="payroll-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="payroll-payment-date">Payment date</label>
            <input
              id="payroll-payment-date"
              type="date"
              value={form.paymentDate}
              onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
              required
            />
          </div>
        </form>
      </SlideOver>

      <div className="page-toolbar no-border">
        <h2>Payroll</h2>
        <button className="btn-primary ml-auto" onClick={handleOpenAdd}>
          <span className="inline-flex items-center gap-1.5">
            <PlusIcon className="h-4 w-4" />
            Add entry
          </span>
        </button>
      </div>

      <div className="mt-4">
        {loading && <p>Loading...</p>}
        {!loading && entries.length === 0 && (
          <EmptyState
            icon={<DollarIcon />}
            title="No payroll entries yet"
            body="Log what each employee was paid, for which period, to start tracking payroll manually."
            primaryLabel="Add entry"
            onPrimary={handleOpenAdd}
          />
        )}
        {!loading && entries.length > 0 && (
          <div className="full-table-wrap">
            <table className="table full-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Period</th>
                  <th>Amount</th>
                  <th>Payment date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {entry.employee.firstName} {entry.employee.lastName}
                    </td>
                    <td>
                      {entry.periodStart.slice(0, 10)} → {entry.periodEnd.slice(0, 10)}
                    </td>
                    <td>{formatMoney(entry.amountCents, tenantCurrency)}</td>
                    <td>{entry.paymentDate.slice(0, 10)}</td>
                    <td>
                      <div className="icon-actions">
                        <button className="icon-btn" onClick={() => handleOpenEdit(entry)}>
                          <span className="tip">Edit</span>
                          <PencilIcon />
                        </button>
                        <button className="icon-btn danger" onClick={() => setDeletingEntry(entry)}>
                          <span className="tip">Delete</span>
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
