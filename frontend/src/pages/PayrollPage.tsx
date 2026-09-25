import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../lib/i18n';
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
  TerminatedCompensationEntry,
} from '../api';
import { useToast } from '../components/common/ToastProvider';
import Modal from '../components/common/Modal';
import RequiredMark from '../components/common/RequiredMark';
import EmptyState from '../components/common/EmptyState';
import Field from '../components/common/Field';
import { usePermissions } from '../contexts/PermissionsContext';
import { usePrimaryAction } from '../contexts/PrimaryActionContext';
import TableSkeleton from '../components/common/TableSkeleton';
import StatusChip from '../components/common/StatusChip';
import { getInitials } from '../components/common/Avatar';
import HorizontalScrollbar from '../components/entity-views/HorizontalScrollbar';
import { CURRENCY_CODES, currencyLabel, formatMoney } from '../lib/currencies';
import { CalendarIcon, EyeIcon, PencilIcon, PlusIcon, TeamIcon } from '../components/common/Icons';
import PayslipPreviewModal from '../components/payroll/PayslipPreviewModal';

interface PayrollPageProps {
  token: string;
}

// The tab bar exists even while only "policies" has real content (Unidad 3)
// because docs/spec-payroll.md's later units (Asignaciones, Timeline) add
// siblings here, not a rebuild of this page's shell.
type Tab = 'timeline' | 'assignments' | 'policies';

// Plain module-level helpers (not components) resolve via the global i18n instance directly
// instead of a hook — same pattern as lib/settingsSections.tsx and NotificationBell.tsx's
// formatRelativeTime (docs/general/spec-i18n.md).
function adjustmentTypeLabel(type: string): string {
  return i18n.t(`payroll.page.entryTypeLabels.${type}`, { ns: 'hr', defaultValue: type });
}

function cadenceLabel(cadence: PayFrequencyCadence): string {
  return i18n.t(`payroll.page.cadenceLabels.${cadence}`, { ns: 'hr' });
}

function dueDateOffsetLabel(offset: DueDateOffset): string {
  return i18n.t(`payroll.page.dueDateLabels.${offset === 'same_day' ? 'same_day' : offset}`, { ns: 'hr' });
}

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
function dayOfWeekLabel(day: string): string {
  return i18n.t(`payroll.page.dayOfWeekLabels.${day}`, { ns: 'hr', defaultValue: day });
}

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
  const t = (key: string, opts?: Record<string, unknown>) => i18n.t(`payroll.page.anchorConfig.${key}`, { ns: 'hr', ...opts });
  if (freq.cadence === 'weekly') {
    return config.dayOfWeek ? dayOfWeekLabel(config.dayOfWeek) : t('none');
  }
  if (freq.cadence === 'semimonthly') {
    if (config.preset === 'first_15') return t('firstAnd15th');
    if (config.preset === 'fifteen_last') return t('fifteenAndLast');
    if (config.preset === 'custom' && Array.isArray(config.days)) return t('customDays', { day1: config.days[0], day2: config.days[1] });
    return t('none');
  }
  if (config.preset === 'first_business_day') return t('firstBusinessDay');
  if (config.preset === 'last_business_day') return t('lastBusinessDay');
  if (config.preset === 'custom' && config.day) return t('customDay', { day: config.day });
  return t('none');
}

function describeDueDate(freq: PayFrequency): string {
  if (freq.dueDateOffset === 'custom') {
    return freq.dueDateCustomDays != null
      ? i18n.t('payroll.page.dueDateLabels.customDays', { ns: 'hr', count: freq.dueDateCustomDays })
      : i18n.t('payroll.page.dueDateLabels.custom', { ns: 'hr' });
  }
  return dueDateOffsetLabel(freq.dueDateOffset);
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

export default function PayrollPage({ token }: PayrollPageProps) {
  const { t } = useTranslation('hr');
  const toast = useToast();
  const navigate = useNavigate();
  const viewsBarRef = useRef<HTMLDivElement>(null);
  const timelineTableRef = useRef<HTMLDivElement>(null);
  const assignmentsTableRef = useRef<HTMLDivElement>(null);
  const frequenciesTableRef = useRef<HTMLDivElement>(null);
  const bulkAssignTableRef = useRef<HTMLDivElement>(null);
  const offPaymentPeopleTableRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>('timeline');
  const [frequencies, setFrequencies] = useState<PayFrequency[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [compensationStatus, setCompensationStatus] = useState<CompensationStatusEntry[]>([]);
  const [terminatedCompensations, setTerminatedCompensations] = useState<TerminatedCompensationEntry[]>([]);
  const [assignmentSubTab, setAssignmentSubTab] = useState<'draft' | 'confirmed' | 'terminated'>('draft');
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [offCyclePayments, setOffCyclePayments] = useState<OffCyclePayrollEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [frequencyFilter, setFrequencyFilter] = useState<'active' | 'inactive'>('active');

  // Custom Roles Fase J — migrated off `user.role === 'owner'` to the real backend gate,
  // canManagePayroll (Payroll is owner-only by default, but a real toggleable permission).
  const permissions = usePermissions();
  const canManagePayroll = permissions.has('manage_payroll');

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
  const [payslipEntryId, setPayslipEntryId] = useState<string | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async () => {
    if (!canManagePayroll) {
      // Payroll is owner-only at the nav level too (Unidad 21) — a
      // non-owner who guesses the URL shouldn't spend a round trip hitting
      // endpoints that will 403 anyway.
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [freqData, methodData, statusData, terminatedData, runsData, offPaymentsData] = await Promise.all([
        api.listPayFrequencies(token),
        api.listPaymentMethods(token),
        api.getCompensationStatus(token),
        api.listTerminatedCompensations(token),
        api.listPayrollRuns(token),
        api.listOffCyclePayments(token),
      ]);
      setFrequencies(freqData);
      setPaymentMethods(methodData);
      setCompensationStatus(statusData);
      setTerminatedCompensations(terminatedData);
      setPayrollRuns(runsData);
      setOffCyclePayments(offPaymentsData);
    } catch (error) {
      toast.error(t('payroll.page.toasts.loadFailed', { error: (error as Error).message }));
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
        toast.success(t('payroll.page.toasts.frequencyUpdated'));
      } else {
        await api.createPayFrequency(token, payload);
        toast.success(t('payroll.page.toasts.frequencyCreated'));
      }
      setFrequencyModalOpen(false);
      load();
    } catch (error) {
      toast.error(t('payroll.page.toasts.frequencySaveFailed', { error: (error as Error).message }));
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
      toast.success(t('payroll.page.toasts.methodAdded'));
      setMethodModalOpen(false);
      load();
    } catch (error) {
      toast.error(t('payroll.page.toasts.methodAddFailed', { error: (error as Error).message }));
    } finally {
      setSavingMethod(false);
    }
  };

  const handleToggleMethodActive = async (method: PaymentMethod) => {
    try {
      await api.updatePaymentMethod(token, method.id, { isActive: !method.isActive });
      toast.success(method.isActive ? t('payroll.page.toasts.methodDeactivated') : t('payroll.page.toasts.methodActivated'));
      load();
    } catch (error) {
      toast.error(t('payroll.page.toasts.methodUpdateFailed', { error: (error as Error).message }));
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
    if (selectedEmployeeIds.size === visibleAssignments.length) {
      setSelectedEmployeeIds(new Set());
    } else {
      setSelectedEmployeeIds(new Set(visibleAssignments.map((e) => e.employeeId)));
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
        toast.error(t('payroll.page.toasts.assignmentFailedCount', { failed: failures.length, total: results.length }));
      } else {
        toast.success(t('payroll.page.toasts.assignedSuccess', { count: results.length }));
      }
      setAssignModalOpen(false);
      setSelectedEmployeeIds(new Set());
      load();
    } catch (error) {
      toast.error(t('payroll.page.toasts.assignFailed', { error: (error as Error).message }));
    } finally {
      setSavingAssignment(false);
    }
  };

  const activeFrequencies = frequencies.filter((f) => f.isActive);
  const inactiveFrequencies = frequencies.filter((f) => !f.isActive);
  const filteredFrequencies = frequencyFilter === 'active' ? activeFrequencies : inactiveFrequencies;

  // Draft = never confirmed a first-ever contract; Confirmed = has (stays
  // Confirmed through any later reassignment — a raise's new compensation
  // row never gets its own confirmedAt, the person doesn't re-sign every
  // time). Terminated = a separate, closed-row dataset (getCompensationStatus
  // only ever looks at the open row, so a closed one never shows up here).
  // 2026-08-08 user feedback.
  const draftAssignments = compensationStatus.filter((e) => !e.isConfirmed);
  const confirmedAssignments = compensationStatus.filter((e) => e.isConfirmed);
  const visibleAssignments = assignmentSubTab === 'draft' ? draftAssignments : confirmedAssignments;

  const openNewRunModal = () => {
    setNewRunPayFrequencyId('');
    setNewRunPeriodLabel('');
    setNewRunModalOpen(true);
  };

  usePrimaryAction(
    !canManagePayroll
      ? null
      : tab === 'timeline'
        ? { label: t('payroll.page.timeline.newRun'), onClick: openNewRunModal }
        : tab === 'policies'
          ? { label: t('payroll.page.policies.newPolicy'), onClick: openAddFrequency }
          : null,
  );

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
      toast.success(t('payroll.page.toasts.runCreated'));
      navigate(`/hr/payroll/runs/${run.id}`);
    } catch (error) {
      toast.error(t('payroll.page.toasts.runCreateFailed', { error: (error as Error).message }));
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
      toast.success(t('payroll.page.toasts.offPaymentCreated', { count: offPaymentSelectedIds.size }));
      setOffPaymentModalOpen(false);
      load();
    } catch (error) {
      toast.error(t('payroll.page.toasts.offPaymentFailed', { error: (error as Error).message }));
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

  if (!canManagePayroll) {
    return (
      <div className="container">
        <div className="page-toolbar">
          <h2 className="page-title">{t('payroll.page.title')}</h2>
        </div>
        <p className="text-sm text-ink-muted">{t('payroll.page.ownerOnly')}</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-toolbar">
        <h2 className="page-title">{t('payroll.page.title')}</h2>
      </div>

      <div className="views-bar" ref={viewsBarRef}>
        <button type="button" className={`view-tab ${tab === 'timeline' ? 'active' : ''}`} onClick={() => setTab('timeline')}>
          {t('payroll.page.tabs.timeline')}
        </button>
        <button
          type="button"
          className={`view-tab ${tab === 'assignments' ? 'active' : ''}`}
          onClick={() => setTab('assignments')}
        >
          {t('payroll.page.tabs.assignments')}
        </button>
        <button type="button" className={`view-tab ${tab === 'policies' ? 'active' : ''}`} onClick={() => setTab('policies')}>
          {t('payroll.page.tabs.policies')}
        </button>
      </div>
      <HorizontalScrollbar targetRef={viewsBarRef} />

      <div className="mt-4">
        {loading ? (
          <TableSkeleton rows={5} columns={5} />
        ) : (
          <>
          {tab === 'timeline' && (
            <>
              <div className="flex items-start justify-between gap-4 mb-3">
                <p className="text-sm text-ink-muted">
                  {t('payroll.page.timeline.description')}
                </p>
                {canManagePayroll && (
                  <div className="flex items-center gap-2">
                    <button type="button" className="btn-secondary gap-1.5" onClick={openOffPaymentModal}>
                      <PlusIcon className="h-3.5 w-3.5" />
                      {t('payroll.page.timeline.oneOffPayment')}
                    </button>
                    {/* Hidden below md: the mobile FAB (usePrimaryAction below) already exposes
                        this same "New Run" action there. Hidden entirely once the list is empty:
                        the EmptyState below has its own "New Run" button then. Either way it'd be
                        two ways to do one thing. "One-off Payment" above has no equivalent in
                        either place, so it always stays. `hidden` goes on this wrapper, not the
                        button — .btn-primary is unlayered custom CSS (App.css) that also sets
                        `display`, which beats the `hidden` utility on the same element (Tailwind's
                        utilities layer loses to unlayered CSS either way). */}
                    {timelineItems.length > 0 && (
                      <span className="hidden md:inline-block">
                        <button type="button" className="btn-primary gap-1.5" onClick={openNewRunModal}>
                          <PlusIcon className="h-3.5 w-3.5" />
                          {t('payroll.page.timeline.newRun')}
                        </button>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {timelineItems.length === 0 ? (
                <EmptyState
                  icon={<CalendarIcon />}
                  title={t('payroll.page.timeline.emptyTitle')}
                  body={t('payroll.page.timeline.emptyBody')}
                  primaryLabel={t('payroll.page.timeline.newRun')}
                  onPrimary={openNewRunModal}
                />
              ) : (
                <>
                <div className="entity-card-list">
                  {timelineItems.map((item) =>
                    item.kind === 'run' ? (
                      <div key={`run-${item.run.id}`} className="entity-card" style={{ alignItems: 'flex-start' }}>
                        <span className="entity-card-body">
                          <span className="flex items-center justify-between gap-2">
                            <span className="entity-card-name">{item.run.periodLabel}</span>
                            <StatusChip
                              color={item.run.status === 'confirmed' ? '#059669' : '#9ca3af'}
                              label={item.run.status === 'confirmed' ? t('payroll.page.statusLabels.confirmed') : t('payroll.page.statusLabels.draft')}
                            />
                          </span>
                          <span className="entity-card-meta">{t('payroll.page.timeline.runMeta', { date: item.date.slice(0, 10) })}</span>
                          <button
                            type="button"
                            className="btn-secondary btn-sm mt-2"
                            onClick={() => navigate(`/hr/payroll/runs/${item.run.id}`)}
                          >
                            {t('payroll.page.timeline.open')}
                          </button>
                        </span>
                      </div>
                    ) : (
                      <div key={`entry-${item.entry.id}`} className="entity-card" style={{ alignItems: 'flex-start' }}>
                        <span className="entity-card-body">
                          <span className="entity-card-name">
                            {item.entry.employeeFirstName} {item.entry.employeeLastName}
                          </span>
                          <span className="entity-card-meta">
                            {item.date.slice(0, 10)} · {t('payroll.page.timeline.oneOffChip')} · {adjustmentTypeLabel(item.entry.type)} ·{' '}
                            {formatMoney(item.entry.amountCents, item.entry.currency)}
                            {item.entry.label ? ` · ${item.entry.label}` : ''}
                          </span>
                          <button
                            type="button"
                            className="btn-secondary btn-sm mt-2"
                            onClick={() => setPayslipEntryId(item.entry.id)}
                          >
                            {t('payroll.page.timeline.payslipPreview')}
                          </button>
                        </span>
                      </div>
                    ),
                  )}
                </div>
                <div className="full-table-wrap has-mobile-cards" ref={timelineTableRef}>
                  <table className="table full-table">
                    <thead>
                      <tr>
                        <th>{t('payroll.page.timeline.columns.date')}</th>
                        <th>{t('payroll.page.timeline.columns.type')}</th>
                        <th>{t('payroll.page.timeline.columns.detail')}</th>
                        <th>{t('payroll.page.timeline.columns.status')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {timelineItems.map((item) =>
                        item.kind === 'run' ? (
                          <tr key={`run-${item.run.id}`}>
                            <td>{item.date.slice(0, 10)}</td>
                            <td>
                              <span className="category-chip">{t('payroll.page.timeline.runChip')}</span>
                            </td>
                            <td>{item.run.periodLabel}</td>
                            <td>
                              <StatusChip
                                color={item.run.status === 'confirmed' ? '#059669' : '#9ca3af'}
                                label={item.run.status === 'confirmed' ? t('payroll.page.statusLabels.confirmed') : t('payroll.page.statusLabels.draft')}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn-secondary btn-sm"
                                onClick={() => navigate(`/hr/payroll/runs/${item.run.id}`)}
                              >
                                {t('payroll.page.timeline.open')}
                              </button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={`entry-${item.entry.id}`}>
                            <td>{item.date.slice(0, 10)}</td>
                            <td>
                              <span className="category-chip">{t('payroll.page.timeline.oneOffChip')}</span>
                            </td>
                            <td>
                              {item.entry.employeeFirstName} {item.entry.employeeLastName} ·{' '}
                              {adjustmentTypeLabel(item.entry.type)} ·{' '}
                              {formatMoney(item.entry.amountCents, item.entry.currency)}
                              {item.entry.label ? ` · ${item.entry.label}` : ''}
                            </td>
                            <td>—</td>
                            <td>
                              <button
                                type="button"
                                className="icon-btn"
                                onClick={() => setPayslipEntryId(item.entry.id)}
                                aria-label={t('payroll.page.timeline.payslipPreviewAriaLabel', { name: `${item.entry.employeeFirstName} ${item.entry.employeeLastName}` })}
                              >
                                <span className="tip">{t('payroll.page.timeline.payslipPreview')}</span>
                                <EyeIcon className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
                </>
              )}
              <HorizontalScrollbar targetRef={timelineTableRef} />
            </>
          )}
          {tab === 'assignments' && (
            <>
              <div className="flex items-start justify-between gap-4 mb-3">
                <p className="text-sm text-ink-muted">
                  {t('payroll.page.assignments.description')}
                </p>
                {canManagePayroll && assignmentSubTab !== 'terminated' && (
                  <button
                    type="button"
                    className="btn-outline gap-1.5"
                    onClick={openAssignModal}
                    disabled={selectedEmployeeIds.size === 0}
                  >
                    {t('payroll.page.assignments.assignReassign', { count: selectedEmployeeIds.size })}
                  </button>
                )}
              </div>

              {compensationStatus.length === 0 && terminatedCompensations.length === 0 ? (
                <EmptyState
                  icon={<TeamIcon />}
                  title={t('payroll.page.assignments.emptyTitle')}
                  body={t('payroll.page.assignments.emptyBody')}
                  primaryLabel={t('payroll.page.assignments.goToPeople')}
                  onPrimary={() => {
                    window.location.href = '/hr/people';
                  }}
                />
              ) : (
                <>
                  <div className="mini-toggle-row mb-3 mt-3">
                    <button
                      type="button"
                      className={`mini-toggle-opt ${assignmentSubTab === 'draft' ? 'active' : ''}`}
                      onClick={() => {
                        setAssignmentSubTab('draft');
                        setSelectedEmployeeIds(new Set());
                      }}
                    >
                      {t('payroll.page.assignments.draftTab', { count: draftAssignments.length })}
                    </button>
                    <button
                      type="button"
                      className={`mini-toggle-opt ${assignmentSubTab === 'confirmed' ? 'active' : ''}`}
                      onClick={() => {
                        setAssignmentSubTab('confirmed');
                        setSelectedEmployeeIds(new Set());
                      }}
                    >
                      {t('payroll.page.assignments.confirmedTab', { count: confirmedAssignments.length })}
                    </button>
                    <button
                      type="button"
                      className={`mini-toggle-opt ${assignmentSubTab === 'terminated' ? 'active' : ''}`}
                      onClick={() => {
                        setAssignmentSubTab('terminated');
                        setSelectedEmployeeIds(new Set());
                      }}
                    >
                      {t('payroll.page.assignments.terminatedTab', { count: terminatedCompensations.length })}
                    </button>
                  </div>

                  {assignmentSubTab === 'terminated' ? (
                    terminatedCompensations.length === 0 ? (
                      <p className="text-sm text-ink-muted">{t('payroll.page.assignments.noTerminated')}</p>
                    ) : (
                      <>
                      <div className="entity-card-list">
                        {terminatedCompensations.map((entry) => (
                          <div key={entry.compensationId} className="entity-card">
                            <span className="entity-card-avatar">
                              {getInitials(entry.employeeFirstName, entry.employeeLastName)}
                            </span>
                            <span className="entity-card-body">
                              <span className="entity-card-name">
                                {entry.employeeFirstName} {entry.employeeLastName}
                              </span>
                              <span className="entity-card-meta">
                                {entry.employeeEmail} · {formatMoney(entry.rateCents, entry.currency)} ·{' '}
                                {entry.payFrequencyName}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="full-table-wrap has-mobile-cards" ref={assignmentsTableRef}>
                        <table className="table full-table">
                          <thead>
                            <tr>
                              <th>{t('payroll.page.assignments.columns.name')}</th>
                              <th>{t('payroll.page.assignments.columns.email')}</th>
                              <th>{t('payroll.page.assignments.columns.policy')}</th>
                              <th>{t('payroll.page.assignments.columns.status')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {terminatedCompensations.map((entry) => (
                              <tr key={entry.compensationId}>
                                <td>
                                  {entry.employeeFirstName} {entry.employeeLastName}
                                </td>
                                <td>{entry.employeeEmail}</td>
                                <td>
                                  <span className="category-chip">
                                    {formatMoney(entry.rateCents, entry.currency)} · {entry.payFrequencyName}
                                  </span>
                                </td>
                                <td>
                                  <StatusChip color="#6b7280" label={t('payroll.page.assignments.terminatedStatus', { date: entry.effectiveTo.slice(0, 10) })} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      </>
                    )
                  ) : visibleAssignments.length === 0 ? (
                    <p className="text-sm text-ink-muted">
                      {assignmentSubTab === 'draft' ? t('payroll.page.assignments.noDraft') : t('payroll.page.assignments.noConfirmed')}
                    </p>
                  ) : (
                    <>
                    <div className="entity-card-list">
                      {canManagePayroll && (
                        <label className="flex items-center gap-2 px-1 pb-1 text-xs font-medium text-ink-muted">
                          <input
                            type="checkbox"
                            checked={selectedEmployeeIds.size > 0 && selectedEmployeeIds.size === visibleAssignments.length}
                            onChange={toggleSelectAll}
                          />
                          {t('payroll.page.assignments.selectAll')}
                        </label>
                      )}
                      {visibleAssignments.map((entry) => (
                        <div key={entry.employeeId} className="entity-card">
                          {canManagePayroll && (
                            <input
                              type="checkbox"
                              className="shrink-0"
                              checked={selectedEmployeeIds.has(entry.employeeId)}
                              onChange={() => toggleEmployeeSelected(entry.employeeId)}
                            />
                          )}
                          <span className="entity-card-body">
                            <span className="entity-card-name">
                              {entry.employeeFirstName} {entry.employeeLastName}
                            </span>
                            <span className="entity-card-meta">
                              {entry.employeeEmail}
                              {entry.currentCompensation
                                ? ` · ${formatMoney(entry.currentCompensation.rateCents, entry.currentCompensation.currency)} · ${entry.currentCompensation.payFrequencyName}`
                                : ` · ${t('payroll.page.assignments.noPolicyAssigned')}`}
                            </span>
                          </span>
                          {entry.isConfirmed ? (
                            <StatusChip color="#059669" label={t('payroll.page.statusLabels.confirmed')} />
                          ) : (
                            <StatusChip color="#9ca3af" label={t('payroll.page.statusLabels.draft')} />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="full-table-wrap has-mobile-cards" ref={assignmentsTableRef}>
                      <table className="table full-table">
                        <thead>
                          <tr>
                            {canManagePayroll && (
                              <th style={{ width: 32 }}>
                                <input
                                  type="checkbox"
                                  checked={selectedEmployeeIds.size > 0 && selectedEmployeeIds.size === visibleAssignments.length}
                                  onChange={toggleSelectAll}
                                />
                              </th>
                            )}
                            <th>{t('payroll.page.assignments.columns.name')}</th>
                            <th>{t('payroll.page.assignments.columns.email')}</th>
                            <th>{t('payroll.page.assignments.columns.currentPolicy')}</th>
                            <th>{t('payroll.page.assignments.columns.status')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleAssignments.map((entry) => (
                            <tr key={entry.employeeId}>
                              {canManagePayroll && (
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
                              <td>{entry.employeeEmail}</td>
                              <td>
                                {entry.currentCompensation ? (
                                  <span className="category-chip">
                                    {formatMoney(entry.currentCompensation.rateCents, entry.currentCompensation.currency)} ·{' '}
                                    {entry.currentCompensation.payFrequencyName}
                                  </span>
                                ) : (
                                  <span className="text-ink-muted">{t('payroll.page.assignments.noPolicyAssigned')}</span>
                                )}
                              </td>
                              <td>
                                {entry.isConfirmed ? (
                                  <StatusChip color="#059669" label={t('payroll.page.statusLabels.confirmed')} />
                                ) : (
                                  <StatusChip color="#9ca3af" label={t('payroll.page.statusLabels.draft')} />
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
                </>
              )}
              <HorizontalScrollbar targetRef={assignmentsTableRef} />
            </>
          )}
          {tab === 'policies' && (
            <>
              <div className="flex items-start justify-between gap-4 mb-1">
                <div>
                  <h3 className="card-title mb-1">{t('payroll.page.policies.payFrequenciesTitle')}</h3>
                  <p className="text-sm text-ink-muted">
                    {t('payroll.page.policies.payFrequenciesDesc')}
                  </p>
                </div>
              </div>

              {frequencies.length === 0 ? (
                <EmptyState
                  icon={<CalendarIcon />}
                  title={t('payroll.page.policies.emptyTitle')}
                  body={t('payroll.page.policies.emptyBody')}
                  primaryLabel={t('payroll.page.policies.newPolicy')}
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
                      {t('payroll.page.policies.activeTab', { count: activeFrequencies.length })}
                    </button>
                    <button
                      type="button"
                      className={`mini-toggle-opt ${frequencyFilter === 'inactive' ? 'active' : ''}`}
                      onClick={() => setFrequencyFilter('inactive')}
                    >
                      {t('payroll.page.policies.deactivatedTab', { count: inactiveFrequencies.length })}
                    </button>
                  </div>

                  {filteredFrequencies.length === 0 ? (
                    <p className="text-sm text-ink-muted">
                      {frequencyFilter === 'active' ? t('payroll.page.policies.noActive') : t('payroll.page.policies.noDeactivated')}
                    </p>
                  ) : (
                    <>
                    <div className="entity-card-list">
                      {filteredFrequencies.map((freq) => (
                        <div key={freq.id} className={`entity-card ${!freq.isActive ? 'opacity-60' : ''}`}>
                          <span className="entity-card-body">
                            <span className={`entity-card-name ${!freq.isActive ? 'line-through' : ''}`}>{freq.name}</span>
                            <span className="entity-card-meta">
                              {cadenceLabel(freq.cadence)} · {describeAnchorConfig(freq)} · {t('payroll.page.policies.assignedCount', { count: freq.assignedCount ?? 0 })}
                            </span>
                          </span>
                          {canManagePayroll && (
                            <button
                              type="button"
                              className="icon-btn shrink-0"
                              onClick={() => openEditFrequency(freq)}
                              aria-label={t('payroll.page.policies.editAriaLabel', { name: freq.name })}
                            >
                              <PencilIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="full-table-wrap has-mobile-cards" ref={frequenciesTableRef}>
                      <table className="table full-table">
                        <thead>
                          <tr>
                            <th>{t('payroll.page.policies.columns.name')}</th>
                            <th>{t('payroll.page.policies.columns.cadence')}</th>
                            <th>{t('payroll.page.policies.columns.payDays')}</th>
                            <th>{t('payroll.page.policies.columns.dueDate')}</th>
                            <th>{t('payroll.page.policies.columns.assigned')}</th>
                            {canManagePayroll && <th>{t('payroll.page.policies.columns.actions')}</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredFrequencies.map((freq) => (
                            <tr key={freq.id} className={!freq.isActive ? 'table-row-inactive' : ''}>
                              <td>
                                <span className={!freq.isActive ? 'line-through' : ''}>{freq.name}</span>
                              </td>
                              <td>{cadenceLabel(freq.cadence)}</td>
                              <td>{describeAnchorConfig(freq)}</td>
                              <td>{describeDueDate(freq)}</td>
                              <td>{freq.assignedCount ?? 0}</td>
                              {canManagePayroll && (
                                <td>
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    onClick={() => openEditFrequency(freq)}
                                    aria-label={t('payroll.page.policies.editAriaLabel', { name: freq.name })}
                                  >
                                    <span className="tip">{t('payroll.page.policies.edit')}</span>
                                    <PencilIcon className="h-4 w-4" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                          {canManagePayroll && (
                            <tr className="ghost-row">
                              <td colSpan={6} className="ghost-row-cell" onClick={openAddFrequency}>
                                <span className="ghost-row-inner">
                                  <span className="ghost-plus-box">
                                    <PlusIcon className="h-3 w-3" />
                                  </span>
                                  {t('payroll.page.add')}
                                </span>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
                  <HorizontalScrollbar targetRef={frequenciesTableRef} />
                </>
              )}

              <div className="flex items-start justify-between gap-4 mt-6 mb-3">
                <h3 className="card-title">{t('payroll.page.policies.paymentMethodsTitle')}</h3>
                {canManagePayroll && (
                  <button type="button" className="btn-outline gap-1.5" onClick={openAddMethod}>
                    <PlusIcon className="h-3.5 w-3.5" />
                    {t('payroll.page.policies.addMethod')}
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
                    {canManagePayroll && (
                      <button type="button" className="btn-secondary btn-sm" onClick={() => handleToggleMethodActive(method)}>
                        {method.isActive ? t('payroll.page.policies.deactivate') : t('payroll.page.policies.activate')}
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
        title={editingFrequencyId ? t('payroll.page.frequencyModal.editTitle') : t('payroll.page.frequencyModal.newTitle')}
        onClose={() => setFrequencyModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setFrequencyModalOpen(false)}>
              {t('payroll.page.cancel')}
            </button>
            <button type="submit" form="frequency-form" className="btn-primary" disabled={savingFrequency}>
              {savingFrequency ? t('payroll.page.frequencyModal.saving') : t('payroll.page.frequencyModal.save')}
            </button>
          </>
        }
      >
        <form id="frequency-form" onSubmit={handleSaveFrequency}>
          <div className="form-group">
            <label htmlFor="freq-name">
              {t('payroll.page.frequencyModal.fields.name')}
              <RequiredMark />
            </label>
            <input
              id="freq-name"
              type="text"
              required
              autoFocus
              value={frequencyForm.name}
              onChange={(e) => setFrequencyForm({ ...frequencyForm, name: e.target.value })}
              placeholder={t('payroll.page.frequencyModal.fields.namePlaceholder')}
            />
          </div>

          <div className="form-group">
            <label htmlFor="freq-cadence">
              {t('payroll.page.frequencyModal.fields.cadence')}
              <RequiredMark />
            </label>
            <select
              id="freq-cadence"
              value={frequencyForm.cadence}
              onChange={(e) => setFrequencyForm({ ...frequencyForm, cadence: e.target.value as PayFrequencyCadence })}
            >
              <option value="weekly">{t('payroll.page.frequencyModal.cadenceOptions.weekly')}</option>
              <option value="semimonthly">{t('payroll.page.frequencyModal.cadenceOptions.semimonthly')}</option>
              <option value="monthly">{t('payroll.page.frequencyModal.cadenceOptions.monthly')}</option>
            </select>
          </div>

          {frequencyForm.cadence === 'weekly' && (
            <div className="form-group">
              <label htmlFor="freq-dow">
                {t('payroll.page.frequencyModal.fields.dayOfWeek')}
                <RequiredMark />
              </label>
              <select
                id="freq-dow"
                value={frequencyForm.dayOfWeek}
                onChange={(e) => setFrequencyForm({ ...frequencyForm, dayOfWeek: e.target.value })}
              >
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {dayOfWeekLabel(day)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {frequencyForm.cadence === 'semimonthly' && (
            <div className="form-group">
              <span>
                {t('payroll.page.frequencyModal.fields.payDays')}
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
                  {t('payroll.page.frequencyModal.semimonthlyOptions.first15')}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="semimonthly-preset"
                    checked={frequencyForm.semimonthlyPreset === 'fifteen_last'}
                    onChange={() => setFrequencyForm({ ...frequencyForm, semimonthlyPreset: 'fifteen_last' })}
                  />
                  {t('payroll.page.frequencyModal.semimonthlyOptions.fifteenLast')}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="semimonthly-preset"
                    checked={frequencyForm.semimonthlyPreset === 'custom'}
                    onChange={() => setFrequencyForm({ ...frequencyForm, semimonthlyPreset: 'custom' })}
                  />
                  {t('payroll.page.frequencyModal.semimonthlyOptions.custom')}
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
                    <span>{t('payroll.page.frequencyModal.semimonthlyOptions.and')}</span>
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
                {t('payroll.page.frequencyModal.fields.payDay')}
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
                  {t('payroll.page.frequencyModal.monthlyOptions.firstBusinessDay')}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="monthly-preset"
                    checked={frequencyForm.monthlyPreset === 'last_business_day'}
                    onChange={() => setFrequencyForm({ ...frequencyForm, monthlyPreset: 'last_business_day' })}
                  />
                  {t('payroll.page.frequencyModal.monthlyOptions.lastBusinessDay')}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="monthly-preset"
                    checked={frequencyForm.monthlyPreset === 'custom'}
                    onChange={() => setFrequencyForm({ ...frequencyForm, monthlyPreset: 'custom' })}
                  />
                  {t('payroll.page.frequencyModal.monthlyOptions.custom')}
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
            <label htmlFor="freq-due">{t('payroll.page.frequencyModal.fields.dueDate')}</label>
            <select
              id="freq-due"
              value={frequencyForm.dueDateOffset}
              onChange={(e) => setFrequencyForm({ ...frequencyForm, dueDateOffset: e.target.value as DueDateOffset })}
            >
              <option value="same_day">{t('payroll.page.frequencyModal.dueDateOptions.sameDay')}</option>
              <option value="plus_2">{t('payroll.page.frequencyModal.dueDateOptions.plus2')}</option>
              <option value="plus_5">{t('payroll.page.frequencyModal.dueDateOptions.plus5')}</option>
              <option value="custom">{t('payroll.page.frequencyModal.dueDateOptions.custom')}</option>
            </select>
          </div>
          {frequencyForm.dueDateOffset === 'custom' && (
            <div className="form-group">
              <label htmlFor="freq-due-custom">{t('payroll.page.frequencyModal.fields.days')}</label>
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
                {t('payroll.page.frequencyModal.fields.active')}
              </label>
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={methodModalOpen}
        title={t('payroll.page.methodModal.title')}
        onClose={() => setMethodModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setMethodModalOpen(false)}>
              {t('payroll.page.cancel')}
            </button>
            <button type="submit" form="method-form" className="btn-primary" disabled={savingMethod}>
              {savingMethod ? t('payroll.page.frequencyModal.saving') : t('payroll.page.frequencyModal.save')}
            </button>
          </>
        }
      >
        <form id="method-form" onSubmit={handleSaveMethod}>
          <div className="form-group">
            <label htmlFor="method-name">
              {t('payroll.page.methodModal.fields.name')}
              <RequiredMark />
            </label>
            <input id="method-name" type="text" required autoFocus value={methodName} onChange={(e) => setMethodName(e.target.value)} />
          </div>
        </form>
      </Modal>

      <Modal
        open={assignModalOpen}
        title={t('payroll.page.assignModal.title')}
        onClose={() => setAssignModalOpen(false)}
        wide
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setAssignModalOpen(false)}>
              {t('payroll.page.cancel')}
            </button>
            <button type="submit" form="assign-form" className="btn-primary" disabled={savingAssignment || !isAssignFormReady}>
              {savingAssignment ? t('payroll.page.frequencyModal.saving') : t('payroll.page.assignModal.assignTo', { count: selectedEmployeeIds.size })}
            </button>
          </>
        }
      >
        <form id="assign-form" onSubmit={handleSubmitAssignment}>
          <div className="field-group">
            <h4 className="field-group-title">{t('payroll.page.assignModal.newPolicySectionTitle')}</h4>
            <div className="field-group-body">
              <Field label={t('payroll.page.assignModal.fields.payFrequency')} required>
                <select
                  id="assign-payFrequencyId"
                  className="overview-field-input"
                  value={assignForm.payFrequencyId}
                  onChange={(e) => setAssignForm({ ...assignForm, payFrequencyId: e.target.value })}
                  required
                >
                  <option value="">{t('payroll.page.selectPlaceholder')}</option>
                  {activeFrequencies.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('payroll.page.assignModal.fields.effectiveFrom')} required>
                <input
                  id="assign-effectiveFrom"
                  className="overview-field-input"
                  type="date"
                  value={assignForm.effectiveFrom}
                  onChange={(e) => setAssignForm({ ...assignForm, effectiveFrom: e.target.value })}
                  required
                />
              </Field>
              <Field label={t('payroll.page.assignModal.fields.compensationType')} required>
                <select
                  id="assign-compensationType"
                  className="overview-field-input"
                  value={assignForm.compensationType}
                  onChange={(e) => setAssignForm({ ...assignForm, compensationType: e.target.value as PayrollCompensationType })}
                  required
                >
                  <option value="">{t('payroll.page.selectPlaceholder')}</option>
                  <option value="hourly">{t('payroll.page.assignModal.compensationTypeOptions.hourly')}</option>
                  <option value="fixed">{t('payroll.page.assignModal.compensationTypeOptions.fixed')}</option>
                </select>
              </Field>
              <Field label={t('payroll.page.assignModal.fields.currency')} required>
                <select
                  id="assign-currency"
                  className="overview-field-input"
                  value={assignForm.currency}
                  onChange={(e) => setAssignForm({ ...assignForm, currency: e.target.value })}
                  required
                >
                  <option value="">{t('payroll.page.selectPlaceholder')}</option>
                  {CURRENCY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {currencyLabel(code)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('payroll.page.assignModal.fields.jobTitle')} required>
                <input
                  id="assign-jobTitle"
                  className="overview-field-input"
                  type="text"
                  value={assignForm.jobTitle}
                  onChange={(e) => setAssignForm({ ...assignForm, jobTitle: e.target.value })}
                  required
                />
              </Field>
              <Field label={t('payroll.page.assignModal.fields.roleDescription')} required full>
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
            <h4 className="field-group-title">{t('payroll.page.assignModal.reviewSectionTitle', { currency: assignForm.currency || 'USD' })}</h4>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={t('payroll.page.assignModal.applyToAllPlaceholder')}
                value={bulkApplyAmount}
                onChange={(e) => setBulkApplyAmount(e.target.value)}
                style={{ maxWidth: 220 }}
              />
              <button type="button" className="btn-secondary btn-sm" onClick={applyAmountToAllSelected}>
                {t('payroll.page.assignModal.applyToAllSelected')}
              </button>
            </div>
            <div className="full-table-wrap" ref={bulkAssignTableRef}>
              <table className="table full-table">
                <thead>
                  <tr>
                    <th>{t('payroll.page.assignModal.columns.name')}</th>
                    <th>{t('payroll.page.assignModal.columns.previous')}</th>
                    <th>{t('payroll.page.assignModal.columns.newAmount')}</th>
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
            <HorizontalScrollbar targetRef={bulkAssignTableRef} />
          </div>
        </form>
      </Modal>

      <Modal
        open={newRunModalOpen}
        title={t('payroll.page.newRunModal.title')}
        onClose={() => setNewRunModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setNewRunModalOpen(false)}>
              {t('payroll.page.cancel')}
            </button>
            <button
              type="submit"
              form="new-run-form"
              className="btn-primary"
              disabled={savingRun || !newRunPayFrequencyId || !newRunPeriodLabel.trim()}
            >
              {savingRun ? t('payroll.page.newRunModal.creating') : t('payroll.page.newRunModal.create')}
            </button>
          </>
        }
      >
        <form id="new-run-form" onSubmit={handleCreateRun}>
          <div className="form-group">
            <label htmlFor="new-run-frequency">
              {t('payroll.page.newRunModal.fields.payFrequency')}
              <RequiredMark />
            </label>
            <select
              id="new-run-frequency"
              value={newRunPayFrequencyId}
              onChange={(e) => setNewRunPayFrequencyId(e.target.value)}
              required
            >
              <option value="">{t('payroll.page.selectPlaceholder')}</option>
              {activeFrequencies.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="new-run-period">
              {t('payroll.page.newRunModal.fields.period')}
              <RequiredMark />
            </label>
            <input
              id="new-run-period"
              type="text"
              value={newRunPeriodLabel}
              onChange={(e) => setNewRunPeriodLabel(e.target.value)}
              placeholder={t('payroll.page.newRunModal.fields.periodPlaceholder')}
              required
            />
          </div>
        </form>
      </Modal>

      <Modal
        open={offPaymentModalOpen}
        title={t('payroll.page.offPaymentModal.title')}
        onClose={() => setOffPaymentModalOpen(false)}
        wide
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOffPaymentModalOpen(false)}>
              {t('payroll.page.cancel')}
            </button>
            <button
              type="submit"
              form="off-payment-form"
              className="btn-primary"
              disabled={savingOffPayment || offPaymentSelectedIds.size === 0 || !offPaymentAmount.trim()}
            >
              {savingOffPayment ? t('payroll.page.frequencyModal.saving') : t('payroll.page.offPaymentModal.createFor', { count: offPaymentSelectedIds.size })}
            </button>
          </>
        }
      >
        <form id="off-payment-form" onSubmit={handleCreateOffPayment}>
          <div className="field-group">
            <div className="field-group-body">
              <Field label={t('payroll.page.offPaymentModal.fields.type')} required>
                <select
                  id="off-payment-type"
                  className="overview-field-input"
                  value={offPaymentType}
                  onChange={(e) => setOffPaymentType(e.target.value as PayrollEntryType)}
                  required
                >
                  <option value="bonus">{t('payroll.page.offPaymentModal.typeOptions.bonus')}</option>
                  <option value="commission">{t('payroll.page.offPaymentModal.typeOptions.commission')}</option>
                  <option value="reimbursement">{t('payroll.page.offPaymentModal.typeOptions.reimbursement')}</option>
                  <option value="deduction">{t('payroll.page.offPaymentModal.typeOptions.deduction')}</option>
                </select>
              </Field>
              <Field label={t('payroll.page.offPaymentModal.fields.amount', { currency: offPaymentCurrency || 'USD' })} required>
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
              <Field label={t('payroll.page.offPaymentModal.fields.currency')} required>
                <select
                  id="off-payment-currency"
                  className="overview-field-input"
                  value={offPaymentCurrency}
                  onChange={(e) => setOffPaymentCurrency(e.target.value)}
                  required
                >
                  <option value="">{t('payroll.page.selectPlaceholder')}</option>
                  {CURRENCY_CODES.map((code) => (
                    <option key={code} value={code}>
                      {currencyLabel(code)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('payroll.page.offPaymentModal.fields.paymentDate')} required>
                <input
                  id="off-payment-date"
                  className="overview-field-input"
                  type="date"
                  value={offPaymentDate}
                  onChange={(e) => setOffPaymentDate(e.target.value)}
                  required
                />
              </Field>
              <Field label={t('payroll.page.offPaymentModal.fields.note')} full>
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
              {t('payroll.page.offPaymentModal.fields.peopleTitle')}
              <RequiredMark />
            </h4>
            <div className="full-table-wrap" ref={offPaymentPeopleTableRef}>
              <table className="table full-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th>{t('payroll.page.offPaymentModal.columns.name')}</th>
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
            <HorizontalScrollbar targetRef={offPaymentPeopleTableRef} />
          </div>
        </form>
      </Modal>
      {payslipEntryId && (
        <PayslipPreviewModal
          open={payslipEntryId !== null}
          onClose={() => setPayslipEntryId(null)}
          fetchPdf={() => api.getEntryPayslip(token, payslipEntryId)}
        />
      )}
    </div>
  );
}
