import { Fragment, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { AnchorConfig, CompensationStatusRow, PayFrequency, PayrollEntry, PayrollRun, PayrollRunDetail } from '../api';
import { useToast } from '../components/common/ToastProvider';
import SlideOver from '../components/common/SlideOver';
import Modal from '../components/common/Modal';
import Popover from '../components/common/Popover';
import SearchableSelect from '../components/common/SearchableSelect';
import StatusChip from '../components/common/StatusChip';
import EmptyState from '../components/common/EmptyState';
import TableSkeleton from '../components/common/TableSkeleton';
import {
  ChevronLeftIcon,
  DocumentIcon,
  DollarIcon,
  ListIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from '../components/common/Icons';
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
  semimonthly: 'Semimonthly',
  monthly: 'Monthly',
};

const DAY_OF_WEEK_OPTIONS: { value: string; label: string }[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];
const DAY_OF_WEEK_LABELS: Record<string, string> = Object.fromEntries(DAY_OF_WEEK_OPTIONS.map((d) => [d.value, d.label]));
const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);
const DUE_DATE_LABELS: Record<string, string> = { same_day: 'Same day', plus_2: '+2 days', plus_5: '+5 days', custom: 'Custom' };

// Human-readable render of the JSON-encoded anchorConfig column, for the
// catalog table — mirrors isValidAnchorConfig's shape on the backend
// (src/modules/hr/payFrequencyService.ts).
function formatAnchorConfig(cadence: string, anchorConfigJson: string): string {
  let config: any;
  try {
    config = JSON.parse(anchorConfigJson);
  } catch {
    return '—';
  }
  if (cadence === 'weekly') return DAY_OF_WEEK_LABELS[config?.dayOfWeek] ?? '—';
  if (cadence === 'semimonthly') {
    if (config?.preset === 'first_15') return 'Days 1 and 15';
    if (config?.preset === 'fifteen_last') return 'Day 15 and last day of month';
    if (config?.preset === 'custom' && Array.isArray(config.days)) return `Days ${config.days[0]} and ${config.days[1]}`;
    return '—';
  }
  if (cadence === 'monthly') {
    if (config?.preset === 'first_business_day') return 'First business day';
    if (config?.preset === 'last_business_day') return 'Last business day';
    if (config?.preset === 'custom' && config.day) return `Day ${config.day}`;
    return '—';
  }
  return '—';
}

function formatDueDate(freq: PayFrequency): string {
  if (freq.dueDateOffset === 'custom') return `+${freq.dueDateCustomDays ?? '?'} days`;
  return DUE_DATE_LABELS[freq.dueDateOffset] ?? freq.dueDateOffset;
}

interface PayFrequencyForm {
  name: string;
  cadence: 'weekly' | 'semimonthly' | 'monthly';
  dayOfWeek: string;
  semimonthlyPreset: 'first_15' | 'fifteen_last' | 'custom';
  semimonthlyDays: [string, string];
  monthlyPreset: 'first_business_day' | 'last_business_day' | 'custom';
  monthlyDay: string;
  dueDateOffset: 'same_day' | 'plus_2' | 'plus_5' | 'custom';
  dueDateCustomDays: string;
  isActive: boolean;
}

const EMPTY_FREQUENCY_FORM: PayFrequencyForm = {
  name: '',
  cadence: 'monthly',
  dayOfWeek: 'monday',
  semimonthlyPreset: 'first_15',
  semimonthlyDays: ['1', '15'],
  monthlyPreset: 'last_business_day',
  monthlyDay: '1',
  dueDateOffset: 'same_day',
  dueDateCustomDays: '',
  isActive: true,
};

// Builds the AnchorConfig payload from whichever cadence-specific fields
// are active in the form — the other cadences' fields stay in state
// (so switching back and forth doesn't lose what the user typed) but are
// ignored here.
function buildAnchorConfig(form: PayFrequencyForm): AnchorConfig {
  if (form.cadence === 'weekly') {
    return { dayOfWeek: form.dayOfWeek as AnchorConfig extends { dayOfWeek: infer D } ? D : never };
  }
  if (form.cadence === 'semimonthly') {
    if (form.semimonthlyPreset === 'custom') {
      return { preset: 'custom', days: [Number(form.semimonthlyDays[0]), Number(form.semimonthlyDays[1])] };
    }
    return { preset: form.semimonthlyPreset };
  }
  if (form.monthlyPreset === 'custom') {
    return { preset: 'custom', day: Number(form.monthlyDay) };
  }
  return { preset: form.monthlyPreset };
}

// Inverse of buildAnchorConfig — used when opening "Edit" on an existing
// frequency, to seed the cadence-specific fields from its stored anchorConfig.
function parseAnchorConfigIntoForm(cadence: string, anchorConfigJson: string): Partial<PayFrequencyForm> {
  let config: any;
  try {
    config = JSON.parse(anchorConfigJson);
  } catch {
    config = {};
  }
  if (cadence === 'weekly') {
    return { dayOfWeek: config.dayOfWeek ?? 'monday' };
  }
  if (cadence === 'semimonthly') {
    if (config.preset === 'custom') {
      return { semimonthlyPreset: 'custom', semimonthlyDays: [String(config.days?.[0] ?? 1), String(config.days?.[1] ?? 15)] };
    }
    return { semimonthlyPreset: config.preset ?? 'first_15' };
  }
  if (cadence === 'monthly') {
    if (config.preset === 'custom') {
      return { monthlyPreset: 'custom', monthlyDay: String(config.day ?? 1) };
    }
    return { monthlyPreset: config.preset ?? 'last_business_day' };
  }
  return {};
}

type CatalogTab = 'timeline' | 'frequencies' | 'assignments';

export default function PayrollPage({ token }: PayrollPageProps) {
  const toast = useToast();
  const [catalogTab, setCatalogTab] = useState<CatalogTab>('timeline');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // --- Pay frequencies (Unidad 3) ---
  const [frequencies, setFrequencies] = useState<PayFrequency[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [frequencyModalOpen, setFrequencyModalOpen] = useState(false);
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

  // --- Assignments (Unidad 5.2) — exception tool for bulk assign/reassign ---
  const [compensationStatus, setCompensationStatus] = useState<CompensationStatusRow[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [selectedForBulk, setSelectedForBulk] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    payFrequencyId: '',
    effectiveFrom: '',
    compensationType: 'fixed' as 'hourly' | 'fixed',
    applyToAll: '',
  });
  const [bulkAmounts, setBulkAmounts] = useState<Record<string, string>>({});
  const [savingBulk, setSavingBulk] = useState(false);

  useEffect(() => {
    loadFrequencies();
    loadRuns();
    loadCompensationStatus();
    api.listEmployees(token).then(setEmployees).catch(() => {});
    api
      .getCurrentTenant(token)
      .then((tenant) => setTenantCurrency(tenant.currency))
      .catch(() => {
        // Non-critical — falls back to USD formatting/currency if it fails.
      });
  }, []);

  const loadCompensationStatus = async () => {
    setAssignmentsLoading(true);
    try {
      const data = await api.getCompensationStatus(token);
      setCompensationStatus(data);
    } catch (error) {
      toast.error('Failed to load compensation assignments: ' + (error as Error).message);
    } finally {
      setAssignmentsLoading(false);
    }
  };

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

  const closeFrequencyModal = () => {
    setFrequencyModalOpen(false);
    setEditingId(null);
    setForm(EMPTY_FREQUENCY_FORM);
  };

  const handleOpenAdd = () => {
    setForm(EMPTY_FREQUENCY_FORM);
    setEditingId(null);
    setFrequencyModalOpen(true);
  };

  const handleOpenEdit = (freq: PayFrequency) => {
    setForm({
      ...EMPTY_FREQUENCY_FORM,
      name: freq.name,
      cadence: freq.cadence,
      dueDateOffset: freq.dueDateOffset,
      dueDateCustomDays: freq.dueDateCustomDays != null ? String(freq.dueDateCustomDays) : '',
      isActive: freq.isActive,
      ...parseAnchorConfigIntoForm(freq.cadence, freq.anchorConfig),
    });
    setEditingId(freq.id);
    setFrequencyModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        cadence: form.cadence,
        anchorConfig: buildAnchorConfig(form),
        dueDateOffset: form.dueDateOffset,
        dueDateCustomDays: form.dueDateOffset === 'custom' ? Number(form.dueDateCustomDays) : undefined,
      };
      if (editingId) {
        await api.updatePayFrequency(token, editingId, { ...payload, isActive: form.isActive });
        toast.success('Pay frequency updated.');
      } else {
        await api.createPayFrequency(token, payload);
        toast.success('Pay frequency added.');
      }
      closeFrequencyModal();
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
      if (run.excludedForUnconfirmedContract) {
        toast.error(
          `${run.excludedForUnconfirmedContract} ${run.excludedForUnconfirmedContract === 1 ? 'person' : 'people'} excluded — unconfirmed contract.`,
        );
      }
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

  const toggleBulkSelection = (employeeId: string, checked: boolean) => {
    setSelectedForBulk((prev) => {
      const next = new Set(prev);
      if (checked) next.add(employeeId);
      else next.delete(employeeId);
      return next;
    });
  };

  const handleOpenBulkAssign = () => {
    // Pre-fill each row with its previous rate as-is (no conversion) if it
    // had one — empty if not, per the spec.
    const seeded: Record<string, string> = {};
    for (const employeeId of selectedForBulk) {
      const row = compensationStatus.find((r) => r.employeeId === employeeId);
      seeded[employeeId] = row?.activeCompensation ? (row.activeCompensation.rateCents / 100).toFixed(2) : '';
    }
    setBulkAmounts(seeded);
    setBulkForm({ payFrequencyId: activeFrequencies[0]?.id ?? '', effectiveFrom: '', compensationType: 'fixed', applyToAll: '' });
    setBulkModalOpen(true);
  };

  const applyAmountToAll = (value: string) => {
    setBulkForm({ ...bulkForm, applyToAll: value });
    setBulkAmounts((prev) => {
      const next = { ...prev };
      for (const employeeId of selectedForBulk) next[employeeId] = value;
      return next;
    });
  };

  const handleSubmitBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    const entries = Array.from(selectedForBulk)
      .filter((employeeId) => (bulkAmounts[employeeId] ?? '').trim() !== '')
      .map((employeeId) => ({
        employeeId,
        compensationType: bulkForm.compensationType,
        rateCents: Math.round(Number.parseFloat(bulkAmounts[employeeId]) * 100),
        currency: tenantCurrency,
      }));
    if (entries.length === 0) {
      toast.error('Enter an amount for at least one selected person.');
      return;
    }
    setSavingBulk(true);
    try {
      const result = await api.bulkCreateCompensation(token, {
        payFrequencyId: bulkForm.payFrequencyId,
        effectiveFrom: bulkForm.effectiveFrom,
        entries,
      });
      if (result.errors.length > 0) {
        toast.error(`${result.created} assigned, ${result.errors.length} failed.`);
      } else {
        toast.success(`${result.created} ${result.created === 1 ? 'person' : 'people'} assigned.`);
      }
      setBulkModalOpen(false);
      setSelectedForBulk(new Set());
      loadCompensationStatus();
    } catch (error) {
      toast.error('Failed to assign: ' + (error as Error).message);
    } finally {
      setSavingBulk(false);
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
    <div className="page-full">
      <Modal
        open={frequencyModalOpen}
        title={editingId ? 'Edit Pay Frequency' : 'New Pay Frequency'}
        onClose={closeFrequencyModal}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeFrequencyModal} disabled={saving}>
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
            <label htmlFor="pf-name">
              Name<span className="text-red-600"> *</span>
            </label>
            <input
              id="pf-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Monthly, Semimonthly"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="pf-cadence">
              Cadence<span className="text-red-600"> *</span>
            </label>
            <select
              id="pf-cadence"
              value={form.cadence}
              onChange={(e) => setForm({ ...form, cadence: e.target.value as PayFrequencyForm['cadence'] })}
            >
              <option value="weekly">Weekly</option>
              <option value="semimonthly">Semimonthly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {form.cadence === 'weekly' && (
            <div className="form-group">
              <label htmlFor="pf-day-of-week">
                Day of week<span className="text-red-600"> *</span>
              </label>
              <select id="pf-day-of-week" value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>
                {DAY_OF_WEEK_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.cadence === 'semimonthly' && (
            <div className="form-group">
              <label>
                Pay day(s)<span className="text-red-600"> *</span>
              </label>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    className="w-auto"
                    name="semimonthly-preset"
                    checked={form.semimonthlyPreset === 'first_15'}
                    onChange={() => setForm({ ...form, semimonthlyPreset: 'first_15' })}
                  />
                  1st and 15th
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    className="w-auto"
                    name="semimonthly-preset"
                    checked={form.semimonthlyPreset === 'fifteen_last'}
                    onChange={() => setForm({ ...form, semimonthlyPreset: 'fifteen_last' })}
                  />
                  15th and last day of month
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    className="w-auto"
                    name="semimonthly-preset"
                    checked={form.semimonthlyPreset === 'custom'}
                    onChange={() => setForm({ ...form, semimonthlyPreset: 'custom' })}
                  />
                  Custom
                </label>
              </div>
              {form.semimonthlyPreset === 'custom' && (
                <div className="mt-1.5 flex items-center gap-2">
                  <select
                    aria-label="First day of month"
                    value={form.semimonthlyDays[0]}
                    onChange={(e) => setForm({ ...form, semimonthlyDays: [e.target.value, form.semimonthlyDays[1]] })}
                  >
                    {DAY_OF_MONTH_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-ink-muted">and</span>
                  <select
                    aria-label="Second day of month"
                    value={form.semimonthlyDays[1]}
                    onChange={(e) => setForm({ ...form, semimonthlyDays: [form.semimonthlyDays[0], e.target.value] })}
                  >
                    {DAY_OF_MONTH_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {form.cadence === 'monthly' && (
            <div className="form-group">
              <label>
                Pay day<span className="text-red-600"> *</span>
              </label>
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    className="w-auto"
                    name="monthly-preset"
                    checked={form.monthlyPreset === 'first_business_day'}
                    onChange={() => setForm({ ...form, monthlyPreset: 'first_business_day' })}
                  />
                  First business day
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    className="w-auto"
                    name="monthly-preset"
                    checked={form.monthlyPreset === 'last_business_day'}
                    onChange={() => setForm({ ...form, monthlyPreset: 'last_business_day' })}
                  />
                  Last business day
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    className="w-auto"
                    name="monthly-preset"
                    checked={form.monthlyPreset === 'custom'}
                    onChange={() => setForm({ ...form, monthlyPreset: 'custom' })}
                  />
                  Custom
                </label>
              </div>
              {form.monthlyPreset === 'custom' && (
                <select
                  aria-label="Day of month"
                  className="mt-1.5"
                  value={form.monthlyDay}
                  onChange={(e) => setForm({ ...form, monthlyDay: e.target.value })}
                >
                  {DAY_OF_MONTH_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="pf-due-date">
              Due date<span className="text-red-600"> *</span>
            </label>
            <select
              id="pf-due-date"
              value={form.dueDateOffset}
              onChange={(e) => setForm({ ...form, dueDateOffset: e.target.value as PayFrequencyForm['dueDateOffset'] })}
            >
              <option value="same_day">Same day</option>
              <option value="plus_2">+2 days</option>
              <option value="plus_5">+5 days</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          {form.dueDateOffset === 'custom' && (
            <div className="form-group">
              <label htmlFor="pf-due-date-custom">
                Days after pay date<span className="text-red-600"> *</span>
              </label>
              <input
                id="pf-due-date-custom"
                type="number"
                min="0"
                step="1"
                value={form.dueDateCustomDays}
                onChange={(e) => setForm({ ...form, dueDateCustomDays: e.target.value })}
                required
              />
            </div>
          )}

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
      </Modal>

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
        <button
          type="button"
          className={`view-tab ${catalogTab === 'assignments' ? 'active' : ''}`}
          onClick={() => setCatalogTab('assignments')}
        >
          Assignments
        </button>
        {catalogTab === 'timeline' && (
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
        )}
        {catalogTab === 'frequencies' && (
          <button type="button" className="btn-outline gap-1.5 ml-auto" onClick={handleOpenAdd}>
            <PlusIcon className="h-3.5 w-3.5" />
            New Pay Frequency
          </button>
        )}
        {catalogTab === 'assignments' && (
          <button
            type="button"
            className="btn-outline gap-1.5 ml-auto"
            onClick={handleOpenBulkAssign}
            disabled={selectedForBulk.size === 0}
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Assign/Reassign Policy{selectedForBulk.size > 0 ? ` (${selectedForBulk.size})` : ''}
          </button>
        )}
      </div>

      {catalogTab === 'timeline' && (
        <div className="mt-4">
          {runsLoading && <TableSkeleton columns={4} />}
          {!runsLoading && timelineItems.length === 0 && (
            <EmptyState
              icon={<DollarIcon />}
              title="Nothing here yet"
              body="Create a run from a pay frequency, or record a one-off payment."
              primaryLabel="New Run"
              onPrimary={handleOpenNewRun}
              secondaryLabel="One-off Payment"
              onSecondary={handleOpenOffPayment}
            />
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
          <p className="text-sm text-ink-muted mb-3">
            Assigning a pay frequency + rate to a person happens from their employee record, not here.
          </p>

          {loading && <TableSkeleton columns={6} />}

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
                showInactive ? (
                  <p className="text-sm text-ink-muted">No deactivated pay frequencies.</p>
                ) : (
                  <EmptyState
                    icon={<ListIcon />}
                    title="No active pay frequencies"
                    body="A pay frequency defines how often and on what day a group of people gets paid."
                    primaryLabel="New Pay Frequency"
                    onPrimary={handleOpenAdd}
                  />
                )
              ) : (
                <div className="full-table-wrap">
                  <table className="table full-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Cadence</th>
                        <th>Pay day(s)</th>
                        <th>Due date</th>
                        <th>Assigned people</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleFrequencies.map((freq) => (
                        <tr key={freq.id} className={!freq.isActive ? 'table-row-inactive' : ''}>
                          <td>{freq.name}</td>
                          <td>{CADENCE_LABELS[freq.cadence] || freq.cadence}</td>
                          <td>{formatAnchorConfig(freq.cadence, freq.anchorConfig)}</td>
                          <td>{formatDueDate(freq)}</td>
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

      {catalogTab === 'assignments' && (
        <div className="mt-4">
          <p className="text-sm text-ink-muted mb-3">
            Exception tool for retrofitting people with no compensation yet, or migrating a group to a new pay frequency —
            the main path is setting compensation up when someone is hired.
          </p>

          {assignmentsLoading && <TableSkeleton columns={3} />}

          {!assignmentsLoading && (
            <div className="full-table-wrap">
              <table className="table full-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Name</th>
                    <th>Current Policy</th>
                  </tr>
                </thead>
                <tbody>
                  {compensationStatus.map((row) => (
                    <tr key={row.employeeId}>
                      <td>
                        <input
                          type="checkbox"
                          className="w-auto"
                          checked={selectedForBulk.has(row.employeeId)}
                          onChange={(e) => toggleBulkSelection(row.employeeId, e.target.checked)}
                          aria-label={`Select ${row.firstName} ${row.lastName}`}
                        />
                      </td>
                      <td>
                        {row.firstName} {row.lastName}
                      </td>
                      <td>
                        {row.activeCompensation ? (
                          <span className="time-off-policy-chip">{row.activeCompensation.payFrequency.name}</span>
                        ) : (
                          <span className="text-xs text-ink-faint">No policy assigned</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal
        open={bulkModalOpen}
        title={`Assign/Reassign Policy (${selectedForBulk.size})`}
        onClose={() => setBulkModalOpen(false)}
        wide
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setBulkModalOpen(false)} disabled={savingBulk}>
              Cancel
            </button>
            <button type="submit" form="bulk-assign-form" className="btn-primary" disabled={savingBulk}>
              {savingBulk ? 'Saving…' : 'Assign'}
            </button>
          </>
        }
      >
        <form id="bulk-assign-form" onSubmit={handleSubmitBulk}>
          <div className="form-group">
            <label htmlFor="bulk-frequency">
              Pay frequency<span className="text-red-600"> *</span>
            </label>
            <select
              id="bulk-frequency"
              value={bulkForm.payFrequencyId}
              onChange={(e) => setBulkForm({ ...bulkForm, payFrequencyId: e.target.value })}
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
            <label htmlFor="bulk-effective">
              Effective from<span className="text-red-600"> *</span>
            </label>
            <input
              id="bulk-effective"
              type="date"
              value={bulkForm.effectiveFrom}
              onChange={(e) => setBulkForm({ ...bulkForm, effectiveFrom: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="bulk-type">
              Type<span className="text-red-600"> *</span>
            </label>
            <select
              id="bulk-type"
              value={bulkForm.compensationType}
              onChange={(e) => setBulkForm({ ...bulkForm, compensationType: e.target.value as 'hourly' | 'fixed' })}
            >
              <option value="fixed">Fixed</option>
              <option value="hourly">Hourly</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="bulk-apply-all">Apply this amount to all selected rows ({tenantCurrency})</label>
            <input
              id="bulk-apply-all"
              type="number"
              min="0.01"
              step="0.01"
              value={bulkForm.applyToAll}
              onChange={(e) => applyAmountToAll(e.target.value)}
              placeholder="Optional — or set each row below"
            />
          </div>

          <div className="policy-manage-list">
            {Array.from(selectedForBulk).map((employeeId) => {
              const row = compensationStatus.find((r) => r.employeeId === employeeId);
              return (
                <div key={employeeId} className="policy-manage-row justify-between">
                  <span className="status-manage-name">
                    {row ? `${row.firstName} ${row.lastName}` : employeeId}
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="w-24"
                    value={bulkAmounts[employeeId] ?? ''}
                    onChange={(e) => setBulkAmounts({ ...bulkAmounts, [employeeId]: e.target.value })}
                    aria-label={`Amount for ${row ? `${row.firstName} ${row.lastName}` : employeeId} (${tenantCurrency})`}
                  />
                </div>
              );
            })}
          </div>
        </form>
      </Modal>
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

  const [payslipFor, setPayslipFor] = useState<{ employeeId: string; name: string } | null>(null);
  const [payslipUrl, setPayslipUrl] = useState<string | null>(null);
  const [payslipLoading, setPayslipLoading] = useState(false);

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

  const openPayslip = async (employeeId: string, name: string) => {
    if (!run) return;
    setPayslipFor({ employeeId, name });
    setPayslipUrl(null);
    setPayslipLoading(true);
    try {
      const blob = await api.getPayslipPreview(token, run.id, employeeId);
      setPayslipUrl(URL.createObjectURL(blob));
    } catch (error) {
      toast.error('Failed to load payslip preview: ' + (error as Error).message);
      setPayslipFor(null);
    } finally {
      setPayslipLoading(false);
    }
  };

  const closePayslip = () => {
    if (payslipUrl) URL.revokeObjectURL(payslipUrl);
    setPayslipUrl(null);
    setPayslipFor(null);
  };

  return (
    <div className="page-full">
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

      {loading && <TableSkeleton columns={6} />}

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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {run.employeeGroups.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-sm text-ink-muted">
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
                          color={isInactive ? '#dc2626' : group.employee.statusDefn.color || '#6b7280'}
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
                    <td>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => openPayslip(group.employee.id, `${group.employee.firstName} ${group.employee.lastName}`)}
                      >
                        <span className="tip">Payslip preview</span>
                        <DocumentIcon />
                      </button>
                    </td>
                  </tr>
                  {isInactive && (
                    <tr>
                      <td colSpan={6} className="bg-amber-100 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-400">
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
            {activeGroup.adjustments.length === 0 && <p className="text-xs text-ink-muted px-2 py-1">No adjustments yet.</p>}
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

      <SlideOver open={payslipFor !== null} title={payslipFor ? `Payslip — ${payslipFor.name}` : 'Payslip'} onClose={closePayslip}>
        <p className="mb-3 rounded-md bg-amber-100 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-400">
          Preview only — not sent. Not a legal document.
        </p>
        {payslipLoading && <p>Loading…</p>}
        {!payslipLoading && payslipUrl && (
          <>
            <iframe src={payslipUrl} title="Payslip preview" className="h-[60vh] w-full rounded-md border border-line" />
            <a href={payslipUrl} download="payslip-preview.pdf" className="btn-primary mt-3 inline-flex">
              Download
            </a>
          </>
        )}
      </SlideOver>
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
