import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type {
  CompensationStatusEntry,
  DueDateOffset,
  OffCyclePayrollEntry,
  PayFrequency,
  PayFrequencyCadence,
  PaymentMethod,
  PayrollCompensationType,
  PayrollEntryType,
  PayrollRun,
} from '../api';
import { useToast } from '../components/common/ToastProvider';
import Modal from '../components/common/Modal';
import RequiredMark from '../components/common/RequiredMark';
import EmptyState from '../components/common/EmptyState';
import Field from '../components/common/Field';
import TableSkeleton from '../components/common/TableSkeleton';
import StatusChip from '../components/common/StatusChip';
import { formatMoney } from '../lib/currencies';
import { CalendarIcon, PencilIcon, PlusIcon, TeamIcon } from '../components/common/Icons';

interface PayrollPageProps {
  user: any;
  token: string;
}

// The tab bar exists even while only "policies" has real content (Unidad 3)
// because docs/spec-payroll.md's later units (Asignaciones, Timeline) add
// siblings here, not a rebuild of this page's shell.
type Tab = 'timeline' | 'assignments' | 'policies';

const ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  base: 'Payment',
  bonus: 'Bonus',
  commission: 'Commission',
  reimbursement: 'Reimbursement',
  deduction: 'Deduction',
};

const CADENCE_LABELS: Record<PayFrequencyCadence, string> = {
  weekly: 'Weekly',
  semimonthly: 'Semi-monthly',
  monthly: 'Monthly',
};

const DUE_DATE_LABELS: Record<DueDateOffset, string> = {
  same_day: 'Same day',
  plus_2: '+2 days',
  plus_5: '+5 days',
  custom: 'Custom',
};

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_OF_WEEK_LABELS: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function parseAnchorConfig(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Renders anchorConfig's cadence-dependent shape (docs/spec-payroll.md
// Unidad 1) as the single readable "pay day(s)" column value.
function describeAnchorConfig(freq: PayFrequency): string {
  const config = parseAnchorConfig(freq.anchorConfig);
  if (freq.cadence === 'weekly') {
    return DAY_OF_WEEK_LABELS[config.dayOfWeek] || '—';
  }
  if (freq.cadence === 'semimonthly') {
    if (config.preset === 'first_15') return '1st and 15th';
    if (config.preset === 'fifteen_last') return '15th and last day';
    if (config.preset === 'custom' && Array.isArray(config.days)) return `${config.days[0]} and ${config.days[1]}`;
    return '—';
  }
  if (config.preset === 'first_business_day') return 'First business day';
  if (config.preset === 'last_business_day') return 'Last business day';
  if (config.preset === 'custom' && config.day) return `Day ${config.day}`;
  return '—';
}

function describeDueDate(freq: PayFrequency): string {
  if (freq.dueDateOffset === 'custom') {
    return freq.dueDateCustomDays != null ? `+${freq.dueDateCustomDays} days` : 'Custom';
  }
  return DUE_DATE_LABELS[freq.dueDateOffset];
}

interface FrequencyFormState {
  name: string;
  cadence: PayFrequencyCadence;
  dayOfWeek: string;
  semimonthlyPreset: 'first_15' | 'fifteen_last' | 'custom';
  semimonthlyCustomDay1: string;
  semimonthlyCustomDay2: string;
  monthlyPreset: 'first_business_day' | 'last_business_day' | 'custom';
  monthlyCustomDay: string;
  dueDateOffset: DueDateOffset;
  dueDateCustomDays: string;
  isActive: boolean;
}

const EMPTY_FREQUENCY_FORM: FrequencyFormState = {
  name: '',
  cadence: 'weekly',
  dayOfWeek: 'friday',
  semimonthlyPreset: 'first_15',
  semimonthlyCustomDay1: '1',
  semimonthlyCustomDay2: '15',
  monthlyPreset: 'first_business_day',
  monthlyCustomDay: '1',
  dueDateOffset: 'same_day',
  dueDateCustomDays: '2',
  isActive: true,
};

interface AssignFormState {
  payFrequencyId: string;
  effectiveFrom: string;
  compensationType: PayrollCompensationType | '';
  currency: string;
  jobTitle: string;
  description: string;
}

function getEmptyAssignForm(): AssignFormState {
  return {
    payFrequencyId: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    compensationType: '',
    currency: 'USD',
    jobTitle: '',
    description: '',
  };
}

function formStateFromFrequency(freq: PayFrequency): FrequencyFormState {
  const config = parseAnchorConfig(freq.anchorConfig);
  const base: FrequencyFormState = {
    ...EMPTY_FREQUENCY_FORM,
    name: freq.name,
    cadence: freq.cadence,
    dueDateOffset: freq.dueDateOffset,
    dueDateCustomDays: String(freq.dueDateCustomDays ?? 2),
    isActive: freq.isActive,
  };
  if (freq.cadence === 'weekly') {
    return { ...base, dayOfWeek: config.dayOfWeek || 'friday' };
  }
  if (freq.cadence === 'semimonthly') {
    if (config.preset === 'custom' && Array.isArray(config.days)) {
      return {
        ...base,
        semimonthlyPreset: 'custom',
        semimonthlyCustomDay1: String(config.days[0] ?? 1),
        semimonthlyCustomDay2: String(config.days[1] ?? 15),
      };
    }
    return { ...base, semimonthlyPreset: config.preset || 'first_15' };
  }
  if (config.preset === 'custom' && config.day) {
    return { ...base, monthlyPreset: 'custom', monthlyCustomDay: String(config.day) };
  }
  return { ...base, monthlyPreset: config.preset || 'first_business_day' };
}

function buildAnchorConfig(form: FrequencyFormState): Record<string, unknown> {
  if (form.cadence === 'weekly') {
    return { dayOfWeek: form.dayOfWeek };
  }
  if (form.cadence === 'semimonthly') {
    if (form.semimonthlyPreset === 'custom') {
      return { preset: 'custom', days: [Number(form.semimonthlyCustomDay1), Number(form.semimonthlyCustomDay2)] };
    }
    return { preset: form.semimonthlyPreset };
  }
  if (form.monthlyPreset === 'custom') {
    return { preset: 'custom', day: Number(form.monthlyCustomDay) };
  }
  return { preset: form.monthlyPreset };
}

export default function PayrollPage({ user, token }: PayrollPageProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('timeline');
  const [frequencies, setFrequencies] = useState<PayFrequency[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [compensationStatus, setCompensationStatus] = useState<CompensationStatusEntry[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [offCyclePayments, setOffCyclePayments] = useState<OffCyclePayrollEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [frequencyFilter, setFrequencyFilter] = useState<'active' | 'inactive'>('active');

  const isOwner = user.role === 'owner';

  const [frequencyModalOpen, setFrequencyModalOpen] = useState(false);
  const [editingFrequencyId, setEditingFrequencyId] = useState<string | null>(null);
  const [frequencyForm, setFrequencyForm] = useState<FrequencyFormState>(EMPTY_FREQUENCY_FORM);
  const [savingFrequency, setSavingFrequency] = useState(false);

  const [methodModalOpen, setMethodModalOpen] = useState(false);
  const [methodName, setMethodName] = useState('');
  const [savingMethod, setSavingMethod] = useState(false);

  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignForm, setAssignForm] = useState(getEmptyAssignForm());
  const [assignRates, setAssignRates] = useState<Record<string, string>>({});
  const [bulkApplyAmount, setBulkApplyAmount] = useState('');
  const [savingAssignment, setSavingAssignment] = useState(false);

  const [newRunModalOpen, setNewRunModalOpen] = useState(false);
  const [newRunPayFrequencyId, setNewRunPayFrequencyId] = useState('');
  const [newRunPeriodLabel, setNewRunPeriodLabel] = useState('');
  const [savingRun, setSavingRun] = useState(false);

  const [offPaymentModalOpen, setOffPaymentModalOpen] = useState(false);
  const [offPaymentSelectedIds, setOffPaymentSelectedIds] = useState<Set<string>>(new Set());
  const [offPaymentType, setOffPaymentType] = useState<PayrollEntryType>('bonus');
  const [offPaymentAmount, setOffPaymentAmount] = useState('');
  const [offPaymentCurrency, setOffPaymentCurrency] = useState('USD');
  const [offPaymentLabel, setOffPaymentLabel] = useState('');
  const [offPaymentDate, setOffPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingOffPayment, setSavingOffPayment] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    if (!isOwner) {
      // Payroll is owner-only at the nav level too (Unidad 21) — a
      // non-owner who guesses the URL shouldn't spend a round trip hitting
      // endpoints that will 403 anyway.
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [freqData, methodData, statusData, runsData, offPaymentsData] = await Promise.all([
        api.listPayFrequencies(token),
        api.listPaymentMethods(token),
        api.getCompensationStatus(token),
        api.listPayrollRuns(token),
        api.listOffCyclePayments(token),
      ]);
      setFrequencies(freqData);
      setPaymentMethods(methodData);
      setCompensationStatus(statusData);
      setPayrollRuns(runsData);
      setOffCyclePayments(offPaymentsData);
    } catch (error) {
      toast.error('Failed to load payroll settings: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const openAddFrequency = () => {
    setEditingFrequencyId(null);
    setFrequencyForm(EMPTY_FREQUENCY_FORM);
    setFrequencyModalOpen(true);
  };

  const openEditFrequency = (freq: PayFrequency) => {
    setEditingFrequencyId(freq.id);
    setFrequencyForm(formStateFromFrequency(freq));
    setFrequencyModalOpen(true);
  };

  const handleSaveFrequency = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = frequencyForm.name.trim();
    if (!name) return;
    setSavingFrequency(true);
    try {
      const payload = {
        name,
        cadence: frequencyForm.cadence,
        anchorConfig: buildAnchorConfig(frequencyForm),
        dueDateOffset: frequencyForm.dueDateOffset,
        dueDateCustomDays: frequencyForm.dueDateOffset === 'custom' ? Number(frequencyForm.dueDateCustomDays) : null,
      };
      if (editingFrequencyId) {
        await api.updatePayFrequency(token, editingFrequencyId, { ...payload, isActive: frequencyForm.isActive });
        toast.success('Pay frequency updated.');
      } else {
        await api.createPayFrequency(token, payload);
        toast.success('Pay frequency created.');
      }
      setFrequencyModalOpen(false);
      load();
    } catch (error) {
      toast.error('Failed to save pay frequency: ' + (error as Error).message);
    } finally {
      setSavingFrequency(false);
    }
  };

  const openAddMethod = () => {
    setMethodName('');
    setMethodModalOpen(true);
  };

  const handleSaveMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = methodName.trim();
    if (!name) return;
    setSavingMethod(true);
    try {
      await api.createPaymentMethod(token, { name });
      toast.success('Payment method added.');
      setMethodModalOpen(false);
      load();
    } catch (error) {
      toast.error('Failed to add payment method: ' + (error as Error).message);
    } finally {
      setSavingMethod(false);
    }
  };

  const handleToggleMethodActive = async (method: PaymentMethod) => {
    try {
      await api.updatePaymentMethod(token, method.id, { isActive: !method.isActive });
      toast.success(method.isActive ? 'Payment method deactivated.' : 'Payment method activated.');
      load();
    } catch (error) {
      toast.error('Failed to update payment method: ' + (error as Error).message);
    }
  };

  const toggleEmployeeSelected = (employeeId: string) => {
    setSelectedEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedEmployeeIds.size === compensationStatus.length) {
      setSelectedEmployeeIds(new Set());
    } else {
      setSelectedEmployeeIds(new Set(compensationStatus.map((e) => e.employeeId)));
    }
  };

  const openAssignModal = () => {
    setAssignForm(getEmptyAssignForm());
    // Pre-fill each selected person's rate with their previous amount as-is
    // (no conversion) if they had one — docs/spec-payroll.md Unidad 10.
    const rates: Record<string, string> = {};
    for (const employeeId of selectedEmployeeIds) {
      const entry = compensationStatus.find((e) => e.employeeId === employeeId);
      rates[employeeId] = entry?.currentCompensation ? (entry.currentCompensation.rateCents / 100).toFixed(2) : '';
    }
    setAssignRates(rates);
    setBulkApplyAmount('');
    setAssignModalOpen(true);
  };

  const applyAmountToAllSelected = () => {
    if (!bulkApplyAmount.trim()) return;
    const next: Record<string, string> = {};
    for (const employeeId of selectedEmployeeIds) {
      next[employeeId] = bulkApplyAmount;
    }
    setAssignRates((prev) => ({ ...prev, ...next }));
  };

  const isAssignFormReady =
    Boolean(assignForm.payFrequencyId) &&
    Boolean(assignForm.effectiveFrom) &&
    Boolean(assignForm.compensationType) &&
    Boolean(assignForm.currency.trim()) &&
    Boolean(assignForm.jobTitle.trim()) &&
    Boolean(assignForm.description.trim()) &&
    [...selectedEmployeeIds].every((id) => (assignRates[id] || '').trim() && !Number.isNaN(Number.parseFloat(assignRates[id])));

  const handleSubmitAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAssignFormReady) return;
    setSavingAssignment(true);
    try {
      const results = await api.createCompensationBulk(token, {
        payFrequencyId: assignForm.payFrequencyId,
        effectiveFrom: assignForm.effectiveFrom,
        entries: [...selectedEmployeeIds].map((employeeId) => ({
          employeeId,
          compensationType: assignForm.compensationType as PayrollCompensationType,
          rateCents: Math.round(Number.parseFloat(assignRates[employeeId]) * 100),
          currency: assignForm.currency.trim().toUpperCase(),
          jobTitle: assignForm.jobTitle.trim(),
          description: assignForm.description.trim(),
        })),
      });
      const failures = results.filter((r) => !r.success);
      if (failures.length > 0) {
        toast.error(`${failures.length} of ${results.length} assignment(s) failed.`);
      } else {
        toast.success(`Assigned pay policy to ${results.length} ${results.length === 1 ? 'person' : 'people'}.`);
      }
      setAssignModalOpen(false);
      setSelectedEmployeeIds(new Set());
      load();
    } catch (error) {
      toast.error('Failed to assign pay policy: ' + (error as Error).message);
    } finally {
      setSavingAssignment(false);
    }
  };

  const activeFrequencies = frequencies.filter((f) => f.isActive);
  const inactiveFrequencies = frequencies.filter((f) => !f.isActive);
  const filteredFrequencies = frequencyFilter === 'active' ? activeFrequencies : inactiveFrequencies;

  const openNewRunModal = () => {
    setNewRunPayFrequencyId('');
    setNewRunPeriodLabel('');
    setNewRunModalOpen(true);
  };

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRunPayFrequencyId || !newRunPeriodLabel.trim()) return;
    setSavingRun(true);
    try {
      const run = await api.createPayrollRun(token, {
        payFrequencyId: newRunPayFrequencyId,
        periodLabel: newRunPeriodLabel.trim(),
      });
      setNewRunModalOpen(false);
      toast.success('Payroll run created.');
      navigate(`/hr/payroll/runs/${run.id}`);
    } catch (error) {
      toast.error('Failed to create run: ' + (error as Error).message);
    } finally {
      setSavingRun(false);
    }
  };

  const openOffPaymentModal = () => {
    setOffPaymentSelectedIds(new Set());
    setOffPaymentType('bonus');
    setOffPaymentAmount('');
    setOffPaymentCurrency('USD');
    setOffPaymentLabel('');
    setOffPaymentDate(new Date().toISOString().slice(0, 10));
    setOffPaymentModalOpen(true);
  };

  const toggleOffPaymentSelected = (employeeId: string) => {
    setOffPaymentSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const handleCreateOffPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (offPaymentSelectedIds.size === 0 || !offPaymentAmount.trim() || !offPaymentDate) return;
    setSavingOffPayment(true);
    try {
      await api.createOffCyclePayments(token, {
        type: offPaymentType,
        paymentDate: offPaymentDate,
        entries: [...offPaymentSelectedIds].map((employeeId) => ({
          employeeId,
          amountCents: Math.round(Number.parseFloat(offPaymentAmount) * 100),
          currency: offPaymentCurrency.trim().toUpperCase(),
          label: offPaymentLabel || undefined,
        })),
      });
      toast.success(`Created ${offPaymentSelectedIds.size} one-off payment(s).`);
      setOffPaymentModalOpen(false);
      load();
    } catch (error) {
      toast.error('Failed to create one-off payment: ' + (error as Error).message);
    } finally {
      setSavingOffPayment(false);
    }
  };

  type TimelineItem =
    | { kind: 'run'; date: string; run: PayrollRun }
    | { kind: 'off-cycle'; date: string; entry: OffCyclePayrollEntry };

  const timelineItems: TimelineItem[] = [
    ...payrollRuns.map((run): TimelineItem => ({ kind: 'run', date: run.confirmedAt || run.createdAt, run })),
    ...offCyclePayments.map((entry): TimelineItem => ({ kind: 'off-cycle', date: entry.paymentDate, entry })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (!isOwner) {
    return (
      <div className="container">
        <div className="page-toolbar">
          <h2 className="page-title">Payroll</h2>
        </div>
        <p className="text-sm text-ink-muted">Payroll is only visible to the tenant owner.</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-toolbar">
        <h2 className="page-title">Payroll</h2>
        {tab === 'timeline' && isOwner && (
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary gap-1.5" onClick={openOffPaymentModal}>
              <PlusIcon className="h-3.5 w-3.5" />
              One-off Payment
            </button>
            <button type="button" className="btn-primary gap-1.5" onClick={openNewRunModal}>
              <PlusIcon className="h-3.5 w-3.5" />
              New Run
            </button>
          </div>
        )}
      </div>

      <div className="views-bar">
        <button type="button" className={`view-tab ${tab === 'timeline' ? 'active' : ''}`} onClick={() => setTab('timeline')}>
          Timeline
        </button>
        <button
          type="button"
          className={`view-tab ${tab === 'assignments' ? 'active' : ''}`}
          onClick={() => setTab('assignments')}
        >
          Assignments
        </button>
        <button type="button" className={`view-tab ${tab === 'policies' ? 'active' : ''}`} onClick={() => setTab('policies')}>
          Payment Policies
        </button>
      </div>

      <div className="mt-4">
        {loading ? (
          <TableSkeleton rows={5} columns={5} />
        ) : (
          <>
          {tab === 'timeline' && (
            <>
              {timelineItems.length === 0 ? (
                <EmptyState
                  icon={<CalendarIcon />}
                  title="No payroll activity yet"
                  body="Create a run for a pay frequency, or record a one-off payment."
                  primaryLabel="New Run"
                  onPrimary={openNewRunModal}
                />
              ) : (
                <div className="full-table-wrap">
                  <table className="table full-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Detail</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {timelineItems.map((item) =>
                        item.kind === 'run' ? (
                          <tr key={`run-${item.run.id}`}>
                            <td>{item.date.slice(0, 10)}</td>
                            <td>
                              <span className="category-chip">Run</span>
                            </td>
                            <td>{item.run.periodLabel}</td>
                            <td>
                              <StatusChip
                                color={item.run.status === 'confirmed' ? '#059669' : '#9ca3af'}
                                label={item.run.status === 'confirmed' ? 'Confirmed' : 'Draft'}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                onClick={() => navigate(`/hr/payroll/runs/${item.run.id}`)}
                              >
                                Open
                              </button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={`entry-${item.entry.id}`}>
                            <td>{item.date.slice(0, 10)}</td>
                            <td>
                              <span className="category-chip">One-off</span>
                            </td>
                            <td>
                              {item.entry.employeeFirstName} {item.entry.employeeLastName} ·{' '}
                              {ADJUSTMENT_TYPE_LABELS[item.entry.type] || item.entry.type} ·{' '}
                              {formatMoney(item.entry.amountCents, item.entry.currency)}
                              {item.entry.label ? ` · ${item.entry.label}` : ''}
                            </td>
                            <td>—</td>
                            <td></td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {tab === 'assignments' && (
            <>
              <div className="flex items-start justify-between gap-4 mb-3">
                <p className="text-sm text-ink-muted">
                  Retrofit people with no pay policy yet, or migrate a group to a new one. New people get their
                  first contract from their own alta, not here.
                </p>
                {isOwner && (
                  <button
                    type="button"
                    className="btn-outline gap-1.5"
                    onClick={openAssignModal}
                    disabled={selectedEmployeeIds.size === 0}
                  >
                    Assign/Reassign Policy ({selectedEmployeeIds.size})
                  </button>
                )}
              </div>

              {compensationStatus.length === 0 ? (
                <EmptyState
                  icon={<TeamIcon />}
                  title="No contractors or employees yet"
                  body="Add People with Type Contractor or Employee to assign a pay policy."
                  primaryLabel="Go to People"
                  onPrimary={() => {
                    window.location.href = '/hr/people';
                  }}
                />
              ) : (
                <div className="full-table-wrap">
                  <table className="table full-table">
                    <thead>
                      <tr>
                        {isOwner && (
                          <th style={{ width: 32 }}>
                            <input
                              type="checkbox"
                              checked={selectedEmployeeIds.size > 0 && selectedEmployeeIds.size === compensationStatus.length}
                              onChange={toggleSelectAll}
                            />
                          </th>
                        )}
                        <th>Name</th>
                        <th>Current Policy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compensationStatus.map((entry) => (
                        <tr key={entry.employeeId}>
                          {isOwner && (
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedEmployeeIds.has(entry.employeeId)}
                                onChange={() => toggleEmployeeSelected(entry.employeeId)}
                              />
                            </td>
                          )}
                          <td>
                            {entry.employeeFirstName} {entry.employeeLastName}
                          </td>
                          <td>
                            {entry.currentCompensation ? (
                              <span className="category-chip">
                                {formatMoney(entry.currentCompensation.rateCents, entry.currentCompensation.currency)} ·{' '}
                                {entry.currentCompensation.payFrequencyName}
                              </span>
                            ) : (
                              <span className="text-ink-muted">No policy assigned</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {tab === 'policies' && (
            <>
              <div className="flex items-start justify-between gap-4 mb-1">
                <div>
                  <h3 className="card-title mb-1">Pay frequencies</h3>
                  <p className="text-sm text-ink-muted">
                    Assigning a policy and an amount to each person happens from their profile, not here.
                  </p>
                </div>
                {isOwner && (
                  <button type="button" className="btn-outline gap-1.5" onClick={openAddFrequency}>
                    <PlusIcon className="h-3.5 w-3.5" />
                    New policy
                  </button>
                )}
              </div>

              {frequencies.length === 0 ? (
                <EmptyState
                  icon={<CalendarIcon />}
                  title="No pay frequencies yet"
                  body="A pay frequency defines how often and on what schedule people get paid."
                  primaryLabel="New policy"
                  onPrimary={openAddFrequency}
                />
              ) : (
                <>
                  <div className="mini-toggle-row mb-3 mt-3">
                    <button
                      type="button"
                      className={`mini-toggle-opt ${frequencyFilter === 'active' ? 'active' : ''}`}
                      onClick={() => setFrequencyFilter('active')}
                    >
                      Active ({activeFrequencies.length})
                    </button>
                    <button
                      type="button"
                      className={`mini-toggle-opt ${frequencyFilter === 'inactive' ? 'active' : ''}`}
                      onClick={() => setFrequencyFilter('inactive')}
                    >
                      Deactivated ({inactiveFrequencies.length})
                    </button>
                  </div>

                  {filteredFrequencies.length === 0 ? (
                    <p className="text-sm text-ink-muted">
                      {frequencyFilter === 'active' ? 'No active pay frequencies.' : 'No deactivated pay frequencies.'}
                    </p>
                  ) : (
                    <div className="full-table-wrap">
                      <table className="table full-table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Cadence</th>
                            <th>Pay day(s)</th>
                            <th>Due date</th>
                            <th>Assigned</th>
                            {isOwner && <th>Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredFrequencies.map((freq) => (
                            <tr key={freq.id} className={!freq.isActive ? 'table-row-inactive' : ''}>
                              <td>
                                <span className={!freq.isActive ? 'line-through' : ''}>{freq.name}</span>
                              </td>
                              <td>{CADENCE_LABELS[freq.cadence]}</td>
                              <td>{describeAnchorConfig(freq)}</td>
                              <td>{describeDueDate(freq)}</td>
                              <td>{freq.assignedCount ?? 0}</td>
                              {isOwner && (
                                <td>
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    onClick={() => openEditFrequency(freq)}
                                    aria-label={`Edit ${freq.name}`}
                                  >
                                    <span className="tip">Edit</span>
                                    <PencilIcon className="h-4 w-4" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              <div className="flex items-start justify-between gap-4 mt-6 mb-3">
                <h3 className="card-title">Payment methods</h3>
                {isOwner && (
                  <button type="button" className="btn-outline gap-1.5" onClick={openAddMethod}>
                    <PlusIcon className="h-3.5 w-3.5" />
                    Add method
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {paymentMethods.map((method) => (
                  <div
                    key={method.id}
                    className="flex items-center justify-between gap-3 card"
                    style={{ padding: '0.5rem 0.75rem' }}
                  >
                    <span className={!method.isActive ? 'line-through text-ink-muted' : ''}>{method.name}</span>
                    {isOwner && (
                      <button type="button" className="btn-secondary btn-sm" onClick={() => handleToggleMethodActive(method)}>
                        {method.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          </>
        )}
      </div>

      <Modal
        open={frequencyModalOpen}
        title={editingFrequencyId ? 'Edit pay frequency' : 'New pay frequency'}
        onClose={() => setFrequencyModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setFrequencyModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="frequency-form" className="btn-primary" disabled={savingFrequency}>
              {savingFrequency ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <form id="frequency-form" onSubmit={handleSaveFrequency}>
          <div className="form-group">
            <label htmlFor="freq-name">
              Name
              <RequiredMark />
            </label>
            <input
              id="freq-name"
              type="text"
              required
              autoFocus
              value={frequencyForm.name}
              onChange={(e) => setFrequencyForm({ ...frequencyForm, name: e.target.value })}
              placeholder="e.g. Semanal"
            />
          </div>

          <div className="form-group">
            <label htmlFor="freq-cadence">
              Cadence
              <RequiredMark />
            </label>
            <select
              id="freq-cadence"
              value={frequencyForm.cadence}
              onChange={(e) => setFrequencyForm({ ...frequencyForm, cadence: e.target.value as PayFrequencyCadence })}
            >
              <option value="weekly">Weekly</option>
              <option value="semimonthly">Semi-monthly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {frequencyForm.cadence === 'weekly' && (
            <div className="form-group">
              <label htmlFor="freq-dow">
                Day of week
                <RequiredMark />
              </label>
              <select
                id="freq-dow"
                value={frequencyForm.dayOfWeek}
                onChange={(e) => setFrequencyForm({ ...frequencyForm, dayOfWeek: e.target.value })}
              >
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {DAY_OF_WEEK_LABELS[day]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {frequencyForm.cadence === 'semimonthly' && (
            <div className="form-group">
              <span>
                Pay days
                <RequiredMark />
              </span>
              <div className="flex flex-col gap-1.5 mt-1.5">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="semimonthly-preset"
                    checked={frequencyForm.semimonthlyPreset === 'first_15'}
                    onChange={() => setFrequencyForm({ ...frequencyForm, semimonthlyPreset: 'first_15' })}
                  />
                  1st and 15th
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="semimonthly-preset"
                    checked={frequencyForm.semimonthlyPreset === 'fifteen_last'}
                    onChange={() => setFrequencyForm({ ...frequencyForm, semimonthlyPreset: 'fifteen_last' })}
                  />
                  15th and last day
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="semimonthly-preset"
                    checked={frequencyForm.semimonthlyPreset === 'custom'}
                    onChange={() => setFrequencyForm({ ...frequencyForm, semimonthlyPreset: 'custom' })}
                  />
                  Custom
                </label>
                {frequencyForm.semimonthlyPreset === 'custom' && (
                  <div className="flex items-center gap-2 ml-6">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      style={{ width: 80 }}
                      value={frequencyForm.semimonthlyCustomDay1}
                      onChange={(e) => setFrequencyForm({ ...frequencyForm, semimonthlyCustomDay1: e.target.value })}
                    />
                    <span>and</span>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      style={{ width: 80 }}
                      value={frequencyForm.semimonthlyCustomDay2}
                      onChange={(e) => setFrequencyForm({ ...frequencyForm, semimonthlyCustomDay2: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {frequencyForm.cadence === 'monthly' && (
            <div className="form-group">
              <span>
                Pay day
                <RequiredMark />
              </span>
              <div className="flex flex-col gap-1.5 mt-1.5">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="monthly-preset"
                    checked={frequencyForm.monthlyPreset === 'first_business_day'}
                    onChange={() => setFrequencyForm({ ...frequencyForm, monthlyPreset: 'first_business_day' })}
                  />
                  First business day
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="monthly-preset"
                    checked={frequencyForm.monthlyPreset === 'last_business_day'}
                    onChange={() => setFrequencyForm({ ...frequencyForm, monthlyPreset: 'last_business_day' })}
                  />
                  Last business day
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="monthly-preset"
                    checked={frequencyForm.monthlyPreset === 'custom'}
                    onChange={() => setFrequencyForm({ ...frequencyForm, monthlyPreset: 'custom' })}
                  />
                  Custom
                </label>
                {frequencyForm.monthlyPreset === 'custom' && (
                  <div className="ml-6">
                    <input
                      type="number"
                      min={1}
                      max={31}
                      style={{ width: 80 }}
                      value={frequencyForm.monthlyCustomDay}
                      onChange={(e) => setFrequencyForm({ ...frequencyForm, monthlyCustomDay: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="freq-due">Due date</label>
            <select
              id="freq-due"
              value={frequencyForm.dueDateOffset}
              onChange={(e) => setFrequencyForm({ ...frequencyForm, dueDateOffset: e.target.value as DueDateOffset })}
            >
              <option value="same_day">Same day</option>
              <option value="plus_2">+2 days</option>
              <option value="plus_5">+5 days</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          {frequencyForm.dueDateOffset === 'custom' && (
            <div className="form-group">
              <label htmlFor="freq-due-custom">Days</label>
              <input
                id="freq-due-custom"
                type="number"
                min={0}
                value={frequencyForm.dueDateCustomDays}
                onChange={(e) => setFrequencyForm({ ...frequencyForm, dueDateCustomDays: e.target.value })}
              />
            </div>
          )}

          {editingFrequencyId && (
            <div className="form-group">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={frequencyForm.isActive}
                  onChange={(e) => setFrequencyForm({ ...frequencyForm, isActive: e.target.checked })}
                />
                Active
              </label>
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={methodModalOpen}
        title="Add payment method"
        onClose={() => setMethodModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setMethodModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="method-form" className="btn-primary" disabled={savingMethod}>
              {savingMethod ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <form id="method-form" onSubmit={handleSaveMethod}>
          <div className="form-group">
            <label htmlFor="method-name">
              Name
              <RequiredMark />
            </label>
            <input id="method-name" type="text" required autoFocus value={methodName} onChange={(e) => setMethodName(e.target.value)} />
          </div>
        </form>
      </Modal>

      <Modal
        open={assignModalOpen}
        title="Assign / Reassign Policy"
        onClose={() => setAssignModalOpen(false)}
        wide
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setAssignModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="assign-form" className="btn-primary" disabled={savingAssignment || !isAssignFormReady}>
              {savingAssignment ? 'Saving…' : `Assign to ${selectedEmployeeIds.size}`}
            </button>
          </>
        }
      >
        <form id="assign-form" onSubmit={handleSubmitAssignment}>
          <div className="field-group">
            <h4 className="field-group-title">New policy (applies to everyone selected)</h4>
            <div className="field-group-body">
              <Field label="Pay Frequency" required>
                <select
                  id="assign-payFrequencyId"
                  className="overview-field-input"
                  value={assignForm.payFrequencyId}
                  onChange={(e) => setAssignForm({ ...assignForm, payFrequencyId: e.target.value })}
                  required
                >
                  <option value="">-- select --</option>
                  {activeFrequencies.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Effective From" required>
                <input
                  id="assign-effectiveFrom"
                  className="overview-field-input"
                  type="date"
                  value={assignForm.effectiveFrom}
                  onChange={(e) => setAssignForm({ ...assignForm, effectiveFrom: e.target.value })}
                  required
                />
              </Field>
              <Field label="Compensation Type" required>
                <select
                  id="assign-compensationType"
                  className="overview-field-input"
                  value={assignForm.compensationType}
                  onChange={(e) => setAssignForm({ ...assignForm, compensationType: e.target.value as PayrollCompensationType })}
                  required
                >
                  <option value="">-- select --</option>
                  <option value="hourly">Hourly</option>
                  <option value="fixed">Fixed</option>
                </select>
              </Field>
              <Field label="Currency" required>
                <input
                  id="assign-currency"
                  className="overview-field-input"
                  type="text"
                  value={assignForm.currency}
                  onChange={(e) => setAssignForm({ ...assignForm, currency: e.target.value.toUpperCase() })}
                  required
                />
              </Field>
              <Field label="Job Title" required>
                <input
                  id="assign-jobTitle"
                  className="overview-field-input"
                  type="text"
                  value={assignForm.jobTitle}
                  onChange={(e) => setAssignForm({ ...assignForm, jobTitle: e.target.value })}
                  required
                />
              </Field>
              <Field label="Description" required full>
                <textarea
                  id="assign-description"
                  className="overview-field-input"
                  value={assignForm.description}
                  onChange={(e) => setAssignForm({ ...assignForm, description: e.target.value })}
                  required
                />
              </Field>
            </div>
          </div>

          <div className="field-group">
            <h4 className="field-group-title">Review — amount per person ({assignForm.currency || 'USD'})</h4>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Apply this amount to all"
                value={bulkApplyAmount}
                onChange={(e) => setBulkApplyAmount(e.target.value)}
                style={{ maxWidth: 220 }}
              />
              <button type="button" className="btn-secondary btn-sm" onClick={applyAmountToAllSelected}>
                Apply to all selected
              </button>
            </div>
            <div className="full-table-wrap">
              <table className="table full-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Previous</th>
                    <th>New amount</th>
                  </tr>
                </thead>
                <tbody>
                  {[...selectedEmployeeIds].map((employeeId) => {
                    const entry = compensationStatus.find((e) => e.employeeId === employeeId);
                    return (
                      <tr key={employeeId}>
                        <td>
                          {entry?.employeeFirstName} {entry?.employeeLastName}
                        </td>
                        <td>
                          {entry?.currentCompensation
                            ? formatMoney(entry.currentCompensation.rateCents, entry.currentCompensation.currency)
                            : '—'}
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={assignRates[employeeId] || ''}
                            onChange={(e) => setAssignRates({ ...assignRates, [employeeId]: e.target.value })}
                            required
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={newRunModalOpen}
        title="New Run"
        onClose={() => setNewRunModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setNewRunModalOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              form="new-run-form"
              className="btn-primary"
              disabled={savingRun || !newRunPayFrequencyId || !newRunPeriodLabel.trim()}
            >
              {savingRun ? 'Creating…' : 'Create'}
            </button>
          </>
        }
      >
        <form id="new-run-form" onSubmit={handleCreateRun}>
          <div className="form-group">
            <label htmlFor="new-run-frequency">
              Pay Frequency
              <RequiredMark />
            </label>
            <select
              id="new-run-frequency"
              value={newRunPayFrequencyId}
              onChange={(e) => setNewRunPayFrequencyId(e.target.value)}
              required
            >
              <option value="">-- select --</option>
              {activeFrequencies.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="new-run-period">
              Period
              <RequiredMark />
            </label>
            <input
              id="new-run-period"
              type="text"
              value={newRunPeriodLabel}
              onChange={(e) => setNewRunPeriodLabel(e.target.value)}
              placeholder="e.g. 2nd half · August 2026"
              required
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={offPaymentModalOpen}
        title="One-off Payment"
        onClose={() => setOffPaymentModalOpen(false)}
        wide
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOffPaymentModalOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              form="off-payment-form"
              className="btn-primary"
              disabled={savingOffPayment || offPaymentSelectedIds.size === 0 || !offPaymentAmount.trim()}
            >
              {savingOffPayment ? 'Saving…' : `Create for ${offPaymentSelectedIds.size}`}
            </button>
          </>
        }
      >
        <form id="off-payment-form" onSubmit={handleCreateOffPayment}>
          <div className="field-group">
            <div className="field-group-body">
              <Field label="Type" required>
                <select
                  id="off-payment-type"
                  className="overview-field-input"
                  value={offPaymentType}
                  onChange={(e) => setOffPaymentType(e.target.value as PayrollEntryType)}
                  required
                >
                  <option value="bonus">Bonus</option>
                  <option value="commission">Commission</option>
                  <option value="reimbursement">Reimbursement</option>
                  <option value="deduction">Deduction</option>
                </select>
              </Field>
              <Field label={`Amount (${offPaymentCurrency || 'USD'})`} required>
                <input
                  id="off-payment-amount"
                  className="overview-field-input"
                  type="number"
                  step="0.01"
                  value={offPaymentAmount}
                  onChange={(e) => setOffPaymentAmount(e.target.value)}
                  required
                />
              </Field>
              <Field label="Currency" required>
                <input
                  id="off-payment-currency"
                  className="overview-field-input"
                  type="text"
                  value={offPaymentCurrency}
                  onChange={(e) => setOffPaymentCurrency(e.target.value.toUpperCase())}
                  required
                />
              </Field>
              <Field label="Payment Date" required>
                <input
                  id="off-payment-date"
                  className="overview-field-input"
                  type="date"
                  value={offPaymentDate}
                  onChange={(e) => setOffPaymentDate(e.target.value)}
                  required
                />
              </Field>
              <Field label="Note" full>
                <input
                  id="off-payment-label"
                  className="overview-field-input"
                  type="text"
                  value={offPaymentLabel}
                  onChange={(e) => setOffPaymentLabel(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="field-group">
            <h4 className="field-group-title">
              People
              <RequiredMark />
            </h4>
            <div className="full-table-wrap">
              <table className="table full-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th>Name</th>
                  </tr>
                </thead>
                <tbody>
                  {compensationStatus.map((entry) => (
                    <tr key={entry.employeeId}>
                      <td>
                        <input
                          type="checkbox"
                          checked={offPaymentSelectedIds.has(entry.employeeId)}
                          onChange={() => toggleOffPaymentSelected(entry.employeeId)}
                        />
                      </td>
                      <td>
                        {entry.employeeFirstName} {entry.employeeLastName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
