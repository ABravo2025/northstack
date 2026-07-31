import { Fragment, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { PayFrequency, PayrollEntry, PayrollRun, PayrollRunDetail } from '../api';
import { useToast } from '../components/common/ToastProvider';
import SlideOver from '../components/common/SlideOver';
import Popover from '../components/common/Popover';
import SearchableSelect from '../components/common/SearchableSelect';
import StatusChip from '../components/common/StatusChip';
import { ChevronLeftIcon, PencilIcon, PlusIcon, TrashIcon } from '../components/common/Icons';
import { formatMoney } from '../lib/currencies';

const ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  bonus: 'Bonus',
  commission: 'Commission',
  reimbursement: 'Reimbursement',
  deduction: 'Deduction',
};

interface PayrollPageProps {
  token: string;
}

const CADENCE_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
};

interface PayFrequencyForm {
  name: string;
  cadence: 'weekly' | 'biweekly' | 'monthly';
  payAnchor: string;
  isActive: boolean;
}

const EMPTY_FREQUENCY_FORM: PayFrequencyForm = { name: '', cadence: 'monthly', payAnchor: '', isActive: true };

type CatalogTab = 'timeline' | 'frequencies';

export default function PayrollPage({ token }: PayrollPageProps) {
  const toast = useToast();
  const [catalogTab, setCatalogTab] = useState<CatalogTab>('timeline');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // --- Pay frequencies (Unidad 3) ---
  const [frequencies, setFrequencies] = useState<PayFrequency[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PayFrequencyForm>(EMPTY_FREQUENCY_FORM);
  const [saving, setSaving] = useState(false);

  // --- Runs (Unidad 6/7) ---
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [offPayments, setOffPayments] = useState<PayrollEntry[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [newRunOpen, setNewRunOpen] = useState(false);
  const [newRunForm, setNewRunForm] = useState({ payFrequencyId: '', periodLabel: '' });
  const [creatingRun, setCreatingRun] = useState(false);

  // --- Off-cycle payments (Unidad 12) ---
  const [tenantCurrency, setTenantCurrency] = useState('USD');
  const [employees, setEmployees] = useState<any[]>([]);
  const [offPaymentOpen, setOffPaymentOpen] = useState(false);
  const [offPaymentType, setOffPaymentType] = useState<'bonus' | 'commission' | 'reimbursement' | 'deduction'>('bonus');
  const [offPaymentDate, setOffPaymentDate] = useState('');
  const [offPaymentSelections, setOffPaymentSelections] = useState<Record<string, string>>({}); // employeeId -> amount string
  const [savingOffPayment, setSavingOffPayment] = useState(false);

  useEffect(() => {
    loadFrequencies();
    loadRuns();
    api.listEmployees(token).then(setEmployees).catch(() => {});
    api
      .getCurrentTenant(token)
      .then((tenant) => setTenantCurrency(tenant.currency))
      .catch(() => {
        // Non-critical — falls back to USD formatting/currency if it fails.
      });
  }, []);

  const loadFrequencies = async () => {
    setLoading(true);
    try {
      const data = await api.listPayFrequencies(token);
      setFrequencies(data);
    } catch (error) {
      toast.error('Failed to load pay frequencies: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadRuns = async () => {
    setRunsLoading(true);
    try {
      const [runsData, offPaymentsData] = await Promise.all([api.listPayrollRuns(token), api.listOffCyclePayments(token)]);
      setRuns(runsData);
      setOffPayments(offPaymentsData);
    } catch (error) {
      toast.error('Failed to load the payroll timeline: ' + (error as Error).message);
    } finally {
      setRunsLoading(false);
    }
  };

  const visibleFrequencies = frequencies.filter((f) => f.isActive === !showInactive);
  const activeFrequencies = frequencies.filter((f) => f.isActive);

  // Unidad 13 — unified timeline: PayrollRun (by confirmedAt, falling back to
  // createdAt while still draft — the spec only names confirmedAt, which
  // doesn't exist yet for a draft run) and standalone off-cycle PayrollEntry
  // (by paymentDate), interleaved by date, most recent first.
  type TimelineItem =
    | { kind: 'run'; date: string; run: PayrollRun }
    | { kind: 'off-payment'; date: string; entry: PayrollEntry };
  const timelineItems: TimelineItem[] = [
    ...runs.map((run): TimelineItem => ({ kind: 'run', date: run.confirmedAt ?? run.createdAt, run })),
    ...offPayments.map((entry): TimelineItem => ({ kind: 'off-payment', date: entry.paymentDate, entry })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const closeSlideOver = () => {
    setSlideOverOpen(false);
    setEditingId(null);
    setForm(EMPTY_FREQUENCY_FORM);
  };

  const handleOpenAdd = () => {
    setForm(EMPTY_FREQUENCY_FORM);
    setEditingId(null);
    setSlideOverOpen(true);
  };

  const handleOpenEdit = (freq: PayFrequency) => {
    setForm({ name: freq.name, cadence: freq.cadence, payAnchor: freq.payAnchor, isActive: freq.isActive });
    setEditingId(freq.id);
    setSlideOverOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.updatePayFrequency(token, editingId, form);
        toast.success('Pay frequency updated.');
      } else {
        await api.createPayFrequency(token, form);
        toast.success('Pay frequency added.');
      }
      closeSlideOver();
      loadFrequencies();
    } catch (error) {
      toast.error('Failed to save pay frequency: ' + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenNewRun = () => {
    setNewRunForm({ payFrequencyId: activeFrequencies[0]?.id ?? '', periodLabel: '' });
    setNewRunOpen(true);
  };

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingRun(true);
    try {
      const run = await api.createPayrollRun(token, newRunForm);
      toast.success('Run created.');
      setNewRunOpen(false);
      loadRuns();
      setSelectedRunId(run.id);
    } catch (error) {
      toast.error('Failed to create run: ' + (error as Error).message);
    } finally {
      setCreatingRun(false);
    }
  };

  const handleOpenOffPayment = () => {
    setOffPaymentType('bonus');
    setOffPaymentDate('');
    setOffPaymentSelections({});
    setOffPaymentOpen(true);
  };

  const toggleOffPaymentEmployee = (employeeId: string, checked: boolean) => {
    setOffPaymentSelections((prev) => {
      const next = { ...prev };
      if (checked) next[employeeId] = next[employeeId] ?? '';
      else delete next[employeeId];
      return next;
    });
  };

  const handleCreateOffPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const payments = Object.entries(offPaymentSelections)
      .filter(([, amount]) => amount.trim() !== '')
      .map(([employeeId, amount]) => ({
        employeeId,
        amountCents: Math.round(Number.parseFloat(amount) * 100),
      }));
    if (payments.length === 0) {
      toast.error('Select at least one person and enter an amount.');
      return;
    }
    setSavingOffPayment(true);
    try {
      await api.createOffCyclePayments(token, {
        type: offPaymentType,
        currency: tenantCurrency,
        paymentDate: offPaymentDate,
        payments,
      });
      toast.success(`Payment${payments.length === 1 ? '' : 's'} recorded.`);
      setOffPaymentOpen(false);
    } catch (error) {
      toast.error('Failed to record payment: ' + (error as Error).message);
    } finally {
      setSavingOffPayment(false);
    }
  };

  if (selectedRunId) {
    return (
      <RunDetailView
        token={token}
        runId={selectedRunId}
        onBack={() => {
          setSelectedRunId(null);
          loadRuns();
        }}
      />
    );
  }

  return (
    <div className="container">
      <SlideOver
        open={slideOverOpen}
        title={editingId ? 'Edit Pay Frequency' : 'New Pay Frequency'}
        onClose={closeSlideOver}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeSlideOver} disabled={saving}>
              Cancel
            </button>
            <button type="submit" form="pay-frequency-form" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save' : 'Create'}
            </button>
          </>
        }
      >
        <form id="pay-frequency-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="pf-name">Name</label>
            <input
              id="pf-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Mensual, Quincenal"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="pf-cadence">Cadence</label>
            <select
              id="pf-cadence"
              value={form.cadence}
              onChange={(e) => setForm({ ...form, cadence: e.target.value as PayFrequencyForm['cadence'] })}
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="pf-anchor">Pay day(s)</label>
            <input
              id="pf-anchor"
              type="text"
              value={form.payAnchor}
              onChange={(e) => setForm({ ...form, payAnchor: e.target.value })}
              placeholder="e.g. Último día hábil, Días 15 y 30"
              required
            />
          </div>
          {editingId && (
            <div className="form-group">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="w-auto"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Active
              </label>
            </div>
          )}
        </form>
      </SlideOver>

      <SlideOver
        open={newRunOpen}
        title="New Run"
        onClose={() => setNewRunOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setNewRunOpen(false)} disabled={creatingRun}>
              Cancel
            </button>
            <button type="submit" form="new-run-form" className="btn-primary" disabled={creatingRun}>
              {creatingRun ? 'Creating…' : 'Create run'}
            </button>
          </>
        }
      >
        <form id="new-run-form" onSubmit={handleCreateRun}>
          <div className="form-group">
            <label htmlFor="run-frequency">Pay frequency</label>
            <select
              id="run-frequency"
              value={newRunForm.payFrequencyId}
              onChange={(e) => setNewRunForm({ ...newRunForm, payFrequencyId: e.target.value })}
              required
            >
              <option value="">-- select --</option>
              {activeFrequencies.map((freq) => (
                <option key={freq.id} value={freq.id}>
                  {freq.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="run-period">Period</label>
            <input
              id="run-period"
              type="text"
              value={newRunForm.periodLabel}
              onChange={(e) => setNewRunForm({ ...newRunForm, periodLabel: e.target.value })}
              placeholder="e.g. 2da quincena · agosto 2026"
              required
            />
          </div>
        </form>
      </SlideOver>

      <SlideOver
        open={offPaymentOpen}
        title="One-off Payment"
        onClose={() => setOffPaymentOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOffPaymentOpen(false)} disabled={savingOffPayment}>
              Cancel
            </button>
            <button type="submit" form="off-payment-form" className="btn-primary" disabled={savingOffPayment}>
              {savingOffPayment ? 'Saving…' : 'Record payment'}
            </button>
          </>
        }
      >
        <form id="off-payment-form" onSubmit={handleCreateOffPayment}>
          <div className="form-group">
            <label htmlFor="off-payment-type">Type</label>
            <select
              id="off-payment-type"
              value={offPaymentType}
              onChange={(e) => setOffPaymentType(e.target.value as typeof offPaymentType)}
            >
              <option value="bonus">Bonus</option>
              <option value="commission">Commission</option>
              <option value="reimbursement">Reimbursement</option>
              <option value="deduction">Deduction</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="off-payment-date">Payment date</label>
            <input
              id="off-payment-date"
              type="date"
              value={offPaymentDate}
              onChange={(e) => setOffPaymentDate(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>People ({tenantCurrency})</label>
            <div className="policy-manage-list">
              {employees.map((emp) => {
                const checked = emp.id in offPaymentSelections;
                return (
                  <div key={emp.id} className="policy-manage-row justify-between">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="w-auto"
                        checked={checked}
                        onChange={(e) => toggleOffPaymentEmployee(emp.id, e.target.checked)}
                      />
                      <span className="status-manage-name">
                        {emp.firstName} {emp.lastName}
                      </span>
                    </label>
                    {checked && (
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        className="w-20"
                        value={offPaymentSelections[emp.id]}
                        onChange={(e) => setOffPaymentSelections({ ...offPaymentSelections, [emp.id]: e.target.value })}
                        aria-label={`Amount for ${emp.firstName} ${emp.lastName}`}
                        required
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </form>
      </SlideOver>

      <div className="page-toolbar no-border">
        <h2>Payroll</h2>
      </div>

      <div className="views-bar">
        <button
          type="button"
          className={`view-tab ${catalogTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setCatalogTab('timeline')}
        >
          Timeline
        </button>
        <button
          type="button"
          className={`view-tab ${catalogTab === 'frequencies' ? 'active' : ''}`}
          onClick={() => setCatalogTab('frequencies')}
        >
          Pay Frequencies
        </button>
        {catalogTab === 'timeline' ? (
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="btn-outline gap-1.5" onClick={handleOpenOffPayment}>
              <PlusIcon className="h-3.5 w-3.5" />
              One-off Payment
            </button>
            <button type="button" className="btn-outline gap-1.5" onClick={handleOpenNewRun}>
              <PlusIcon className="h-3.5 w-3.5" />
              New Run
            </button>
          </div>
        ) : (
          <button type="button" className="btn-outline gap-1.5 ml-auto" onClick={handleOpenAdd}>
            <PlusIcon className="h-3.5 w-3.5" />
            New Pay Frequency
          </button>
        )}
      </div>

      {catalogTab === 'timeline' && (
        <div className="mt-4">
          {runsLoading && <p>Loading...</p>}
          {!runsLoading && timelineItems.length === 0 && (
            <p className="text-sm text-gray-500">
              Nothing yet — create a run from a pay frequency, or record a one-off payment.
            </p>
          )}
          {!runsLoading && timelineItems.length > 0 && (
            <div className="full-table-wrap">
              <table className="table full-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {timelineItems.map((item) =>
                    item.kind === 'run' ? (
                      <tr key={`run-${item.run.id}`} className="cursor-pointer" onClick={() => setSelectedRunId(item.run.id)}>
                        <td>
                          <button type="button" className="table-link">
                            {item.run.periodLabel}
                          </button>
                        </td>
                        <td>
                          <span className="time-off-policy-chip">Run</span>
                        </td>
                        <td>
                          <StatusChip
                            color={item.run.status === 'confirmed' ? '#047857' : '#9ca3af'}
                            label={item.run.status === 'confirmed' ? 'Confirmed' : 'Draft'}
                          />
                        </td>
                        <td>{item.date.slice(0, 10)}</td>
                      </tr>
                    ) : (
                      <tr key={`entry-${item.entry.id}`}>
                        <td>
                          {ADJUSTMENT_TYPE_LABELS[item.entry.type] || item.entry.type}
                          {item.entry.employee ? ` — ${item.entry.employee.firstName} ${item.entry.employee.lastName}` : ''}
                          {' · '}
                          {formatMoney(item.entry.amountCents, item.entry.currency)}
                        </td>
                        <td>
                          <span className="time-off-policy-chip">One-off</span>
                        </td>
                        <td>—</td>
                        <td>{item.date.slice(0, 10)}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {catalogTab === 'frequencies' && (
        <div className="mt-4">
          <p className="text-sm text-gray-500 mb-3">
            Assigning a pay frequency + rate to a person happens from their employee record, not here.
          </p>

          {loading && <p>Loading...</p>}

          {!loading && (
            <>
              <div className="mini-toggle-row mb-3">
                <button
                  type="button"
                  className={`mini-toggle-opt ${!showInactive ? 'active' : ''}`}
                  onClick={() => setShowInactive(false)}
                >
                  Active ({frequencies.filter((f) => f.isActive).length})
                </button>
                <button
                  type="button"
                  className={`mini-toggle-opt ${showInactive ? 'active' : ''}`}
                  onClick={() => setShowInactive(true)}
                >
                  Deactivated ({frequencies.filter((f) => !f.isActive).length})
                </button>
              </div>

              {visibleFrequencies.length === 0 ? (
                <p className="text-sm text-gray-500">{showInactive ? 'No deactivated pay frequencies.' : 'No active pay frequencies.'}</p>
              ) : (
                <div className="full-table-wrap">
                  <table className="table full-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Cadence</th>
                        <th>Pay day(s)</th>
                        <th>Assigned people</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleFrequencies.map((freq) => (
                        <tr key={freq.id} className={!freq.isActive ? 'table-row-inactive' : ''}>
                          <td>{freq.name}</td>
                          <td>{CADENCE_LABELS[freq.cadence] || freq.cadence}</td>
                          <td>{freq.payAnchor}</td>
                          <td>{freq.assignedCount}</td>
                          <td>
                            <div className="icon-actions">
                              <button className="icon-btn" onClick={() => handleOpenEdit(freq)}>
                                <span className="tip">Edit</span>
                                <PencilIcon />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface RunDetailViewProps {
  token: string;
  runId: string;
  onBack: () => void;
}

// Unidades 7-11: creation lives on PayrollPage, this is the standalone detail
// screen (not a modal — a full table, per the mockup) for a single run.
function RunDetailView({ token, runId, onBack }: RunDetailViewProps) {
  const toast = useToast();
  const [run, setRun] = useState<PayrollRunDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const [adjustmentsMenuFor, setAdjustmentsMenuFor] = useState<string | null>(null);
  const adjustmentsMenuAnchorRef = useRef<HTMLElement | null>(null);
  const [newAdjustment, setNewAdjustment] = useState({
    type: 'bonus' as 'bonus' | 'commission' | 'reimbursement' | 'deduction',
    amount: '',
    label: '',
  });
  const [savingAdjustment, setSavingAdjustment] = useState(false);

  const [confirming, setConfirming] = useState(false);

  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const addPersonAnchorRef = useRef<HTMLElement | null>(null);
  const [addPersonEmployees, setAddPersonEmployees] = useState<any[]>([]);
  const [addPersonSelectedId, setAddPersonSelectedId] = useState('');
  const [addingPerson, setAddingPerson] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getPayrollRun(token, runId);
      setRun(data);
    } catch (error) {
      toast.error('Failed to load run: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openAdjustments = (e: React.MouseEvent, employeeId: string) => {
    adjustmentsMenuAnchorRef.current = e.currentTarget as HTMLElement;
    setNewAdjustment({ type: 'bonus', amount: '', label: '' });
    setAdjustmentsMenuFor(employeeId);
  };

  const activeGroup = run?.employeeGroups.find((g) => g.employee.id === adjustmentsMenuFor) ?? null;

  const handleAddAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeGroup || !run) return;
    const amountCents = Math.round(Number.parseFloat(newAdjustment.amount || '0') * 100);
    setSavingAdjustment(true);
    try {
      await api.createPayrollAdjustment(token, {
        runId: run.id,
        employeeId: activeGroup.employee.id,
        type: newAdjustment.type,
        amountCents,
        currency: activeGroup.base?.currency ?? activeGroup.adjustments[0]?.currency ?? 'USD',
        label: newAdjustment.label || undefined,
      });
      setNewAdjustment({ type: 'bonus', amount: '', label: '' });
      toast.success('Adjustment added.');
      load();
    } catch (error) {
      toast.error('Failed to add adjustment: ' + (error as Error).message);
    } finally {
      setSavingAdjustment(false);
    }
  };

  const handleDeleteAdjustment = async (entryId: string) => {
    try {
      await api.deletePayrollAdjustment(token, entryId);
      toast.success('Adjustment removed.');
      load();
    } catch (error) {
      toast.error('Failed to remove adjustment: ' + (error as Error).message);
    }
  };

  // Patches the row in place (server response has the recalculated
  // amountCents) instead of a full reload, same instant-patch pattern used
  // by the Employee/Company/Contact/Opportunity detail panels.
  const handleHoursSaved = (updatedEntry: NonNullable<PayrollRunDetail['employeeGroups'][number]['base']>) => {
    setRun((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        employeeGroups: prev.employeeGroups.map((g) =>
          g.employee.id === updatedEntry.employeeId
            ? {
                ...g,
                base: updatedEntry,
                total: updatedEntry.amountCents + g.adjustments.reduce((sum, a) => sum + a.amountCents, 0),
              }
            : g,
        ),
      };
    });
  };

  const missingHours = run?.employeeGroups.some((g) => g.compensationType === 'hourly' && g.base?.hoursQty == null) ?? false;

  const handleConfirmRun = async () => {
    if (!run) return;
    setConfirming(true);
    try {
      await api.confirmPayrollRun(token, run.id);
      toast.success('Run confirmed.');
      load();
    } catch (error) {
      toast.error('Failed to confirm run: ' + (error as Error).message);
    } finally {
      setConfirming(false);
    }
  };

  const openAddPerson = async (e: React.MouseEvent) => {
    addPersonAnchorRef.current = e.currentTarget as HTMLElement;
    setAddPersonSelectedId('');
    setAddPersonOpen(true);
    try {
      const employees = await api.listEmployees(token);
      setAddPersonEmployees(employees);
    } catch (error) {
      toast.error('Failed to load employees: ' + (error as Error).message);
    }
  };

  const alreadyOnRunIds = new Set(run?.employeeGroups.map((g) => g.employee.id) ?? []);
  const addPersonOptions = addPersonEmployees
    .filter((e) => !alreadyOnRunIds.has(e.id))
    .map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` }));

  const handleAddPerson = async () => {
    if (!run || !addPersonSelectedId) return;
    setAddingPerson(true);
    try {
      await api.addPersonToPayrollRun(token, run.id, addPersonSelectedId);
      toast.success('Person added to the run.');
      setAddPersonOpen(false);
      load();
    } catch (error) {
      toast.error('Failed to add person: ' + (error as Error).message);
    } finally {
      setAddingPerson(false);
    }
  };

  return (
    <div className="container">
      <div className="page-toolbar no-border">
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to runs">
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <h2>{run?.periodLabel ?? 'Run'}</h2>
        {run && (
          <StatusChip
            color={run.status === 'confirmed' ? '#047857' : '#9ca3af'}
            label={run.status === 'confirmed' ? 'Confirmed' : 'Draft'}
          />
        )}
        {run?.status === 'draft' && (
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="btn-outline gap-1.5" onClick={openAddPerson}>
              <PlusIcon className="h-3.5 w-3.5" />
              Add Person
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleConfirmRun}
              disabled={confirming || missingHours}
              title={missingHours ? 'Every hourly person needs hours loaded before this run can be confirmed' : undefined}
            >
              {confirming ? 'Confirming…' : 'Confirm Run'}
            </button>
          </div>
        )}
      </div>

      <Popover open={addPersonOpen} onClose={() => setAddPersonOpen(false)} anchorRef={addPersonAnchorRef} width={280}>
        <div className="form-group">
          <label htmlFor="add-person-select">Add person to this run</label>
          <SearchableSelect
            id="add-person-select"
            options={addPersonOptions}
            value={addPersonSelectedId}
            onChange={setAddPersonSelectedId}
            placeholder="Search employees…"
          />
        </div>
        <button type="button" className="btn-primary w-full" onClick={handleAddPerson} disabled={!addPersonSelectedId || addingPerson}>
          {addingPerson ? 'Adding…' : 'Add'}
        </button>
      </Popover>

      {loading && <p>Loading...</p>}

      {!loading && run && (
        <div className="mt-4 full-table-wrap">
          <table className="table full-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Compensation</th>
                <th>Base</th>
                <th>Adjustments</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {run.employeeGroups.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-sm text-gray-500">
                    Nobody has a compensation record under this pay frequency yet.
                  </td>
                </tr>
              )}
              {run.employeeGroups.map((group) => {
                const adjustmentsTotal = group.adjustments.reduce((sum, a) => sum + a.amountCents, 0);
                const isInactive = group.statusSince !== null;
                return (
                <Fragment key={group.employee.id}>
                  <tr>
                    <td>
                      <div className="flex items-center gap-2">
                        {group.employee.firstName} {group.employee.lastName}
                        <StatusChip
                          color={isInactive ? '#dc2626' : group.employee.statusDefn.color || '#9ca3af'}
                          label={group.employee.statusDefn.name}
                        />
                      </div>
                    </td>
                    <td>{group.compensationType === 'hourly' ? 'Hourly' : group.compensationType === 'fixed' ? 'Fixed' : '—'}</td>
                    <td>
                      {group.compensationType === 'hourly' && group.base && run.status === 'draft' ? (
                        <HourlyBaseCell token={token} group={group} onSaved={handleHoursSaved} />
                      ) : group.base ? (
                        <>
                          {formatMoney(group.base.amountCents, group.base.currency)}
                          {group.base.hoursQty != null ? ` (${group.base.hoursQty}h)` : ''}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <button type="button" className="table-link" onClick={(e) => openAdjustments(e, group.employee.id)}>
                        {group.adjustments.length === 0
                          ? '+ Add'
                          : `${adjustmentsTotal >= 0 ? '+' : ''}${formatMoney(adjustmentsTotal, group.adjustments[0].currency)} (${group.adjustments.length})`}
                      </button>
                    </td>
                    <td>{group.base ? formatMoney(group.total, group.base.currency) : '—'}</td>
                  </tr>
                  {isInactive && (
                    <tr>
                      <td colSpan={5} className="bg-amber-100 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-400">
                        Figura {group.employee.statusDefn.name.toLowerCase()} desde {group.statusSince!.slice(0, 10)} — revisar
                        antes de confirmar.
                      </td>
                    </tr>
                  )}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Popover
        open={adjustmentsMenuFor !== null}
        onClose={() => setAdjustmentsMenuFor(null)}
        anchorRef={adjustmentsMenuAnchorRef}
        width={280}
      >
        {activeGroup && (
          <div className="policy-manage-list">
            {activeGroup.adjustments.length === 0 && <p className="text-xs text-gray-500 px-2 py-1">No adjustments yet.</p>}
            {activeGroup.adjustments.map((adj) => (
              <div key={adj.id} className="policy-manage-row justify-between">
                <span className="status-manage-name">
                  {ADJUSTMENT_TYPE_LABELS[adj.type] || adj.type}
                  {adj.label ? ` — ${adj.label}` : ''}
                </span>
                <span className="flex items-center gap-1.5">
                  {formatMoney(adj.amountCents, adj.currency)}
                  {run?.status === 'draft' && (
                    <button type="button" className="icon-btn danger" onClick={() => handleDeleteAdjustment(adj.id)}>
                      <span className="tip">Remove</span>
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </div>
            ))}
            {run?.status === 'draft' && (
              <form className="mt-2 border-t border-line pt-2" onSubmit={handleAddAdjustment}>
                <div className="form-group">
                  <label htmlFor="adj-type">Type</label>
                  <select
                    id="adj-type"
                    value={newAdjustment.type}
                    onChange={(e) =>
                      setNewAdjustment({
                        ...newAdjustment,
                        type: e.target.value as 'bonus' | 'commission' | 'reimbursement' | 'deduction',
                      })
                    }
                  >
                    <option value="bonus">Bonus</option>
                    <option value="commission">Commission</option>
                    <option value="reimbursement">Reimbursement</option>
                    <option value="deduction">Deduction</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="adj-amount">Amount</label>
                  <input
                    id="adj-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={newAdjustment.amount}
                    onChange={(e) => setNewAdjustment({ ...newAdjustment, amount: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="adj-label">Note (optional)</label>
                  <input
                    id="adj-label"
                    type="text"
                    value={newAdjustment.label}
                    onChange={(e) => setNewAdjustment({ ...newAdjustment, label: e.target.value })}
                  />
                </div>
                <button type="submit" className="btn-primary w-full" disabled={savingAdjustment}>
                  {savingAdjustment ? 'Adding…' : 'Add adjustment'}
                </button>
              </form>
            )}
          </div>
        )}
      </Popover>
    </div>
  );
}

interface HourlyBaseCellProps {
  token: string;
  group: PayrollRunDetail['employeeGroups'][number];
  onSaved: (entry: NonNullable<PayrollRunDetail['employeeGroups'][number]['base']>) => void;
}

// Unidad 9 — editable hours input for hourly base entries, with a live
// "hours × rate" preview as the user types (not just after saving).
function HourlyBaseCell({ token, group, onSaved }: HourlyBaseCellProps) {
  const toast = useToast();
  const [hours, setHours] = useState(group.base?.hoursQty != null ? String(group.base.hoursQty) : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setHours(group.base?.hoursQty != null ? String(group.base.hoursQty) : '');
  }, [group.base?.hoursQty]);

  const parsedHours = Number.parseFloat(hours);
  const preview =
    group.hourlyRateCents != null && Number.isFinite(parsedHours)
      ? formatMoney(Math.round(parsedHours * group.hourlyRateCents), group.base?.currency ?? 'USD')
      : null;

  const commit = async () => {
    if (!group.base) return;
    const hoursQty = Number.parseFloat(hours || '0');
    if (Number.isNaN(hoursQty) || hoursQty === (group.base.hoursQty ?? -1)) return;
    setSaving(true);
    try {
      const updated = await api.updatePayrollEntryHours(token, group.base.id, hoursQty);
      onSaved(updated);
    } catch (error) {
      toast.error('Failed to update hours: ' + (error as Error).message);
      setHours(group.base?.hoursQty != null ? String(group.base.hoursQty) : '');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min="0"
        step="0.25"
        className="w-16"
        value={hours}
        disabled={saving}
        onChange={(e) => setHours(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        aria-label={`Hours for ${group.employee.firstName} ${group.employee.lastName}`}
      />
      <span className="text-xs text-ink-faint">h{preview ? ` = ${preview}` : ''}</span>
    </div>
  );
}
