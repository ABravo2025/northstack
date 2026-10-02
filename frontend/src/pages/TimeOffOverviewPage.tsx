import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type TimeOffBalance, type TimeOffDayCount, type TimeOffLedger, type TimeOffPolicy, type TimeOffRequest, type TimeOffRequestPreview } from '../api';
import { useToast } from '../components/common/ToastProvider';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Modal from '../components/common/Modal';
import Popover from '../components/common/Popover';
import ColorPicker from '../components/common/ColorPicker';
import TableSkeleton from '../components/common/TableSkeleton';
import RequiredMark from '../components/common/RequiredMark';
import Avatar from '../components/common/Avatar';
import MyTimeOffView from '../components/timeOff/MyTimeOffView';
import TeamTimeOffView, { type TeamPerson } from '../components/timeOff/TeamTimeOffView';
import TimeOffPoliciesView from '../components/timeOff/TimeOffPoliciesView';
import {
  ADJUST_FORM_ID,
  AdjustBalanceForm,
  NEW_REQUEST_FORM_ID,
  NewRequestForm,
  PolicyDetailBody,
  RequestDetailBody,
  TeamMemberDetailBody,
  requestBlocked,
  type AdjustFormValue,
  type NewRequestFormValue,
} from '../components/timeOff/TimeOffPanels';
import { isoDay, useDateRangeFormatter } from '../components/timeOff/timeOffShared';
import { usePermissions } from '../contexts/PermissionsContext';
import { usePrimaryAction } from '../contexts/PrimaryActionContext';
import { useTimeOffTab } from '../contexts/TimeOffTabContext';

interface TimeOffOverviewPageProps {
  user: any;
  token: string;
}

const ACCRUAL_KEY_MAP: Record<string, string> = {
  fixed_annual: 'fixed',
  monthly: 'monthly',
};

type Panel =
  | { type: 'request'; id: string }
  | { type: 'new' }
  | { type: 'person'; employeeId: string }
  | { type: 'policy'; id: string }
  | { type: 'adjust'; employeeId: string }
  | null;

const EMPTY_POLICY_FORM = {
  name: '',
  color: '#6b47dc',
  accrualMethod: 'fixed_annual',
  daysPerYear: '15',
  isPaid: true,
  requiresApproval: true,
  // 2026-10 company rules — defaults keep the old behavior (company's day counting, no asking
  // in advance, unused days expire).
  dayCount: 'inherit' as TimeOffPolicy['dayCount'],
  allowAdvance: false,
  unusedAction: 'expire' as TimeOffPolicy['unusedAction'],
  carryOverMax: '',
};

// Time Off, redesigned 2026-10 from 7 tabs into 3 views (TimeOffTabContext):
//  - "mine"     → MyTimeOffView      (was My Timeoff + My Requests) — everyone
//  - "team"     → TeamTimeOffView    (was Approvals + Balances + All Requests) — admins see the
//                 whole tenant; a manager sees their direct reports (?scope=team on the API)
//  - "policies" → TimeOffPoliciesView (was Policies + Assignments) — manage_custom_fields
// Every detail opens in one Modal (`panel`); the policy create/edit/bulk-assign Modal
// is unchanged from before.
export default function TimeOffOverviewPage({ user, token }: TimeOffOverviewPageProps) {
  const { t } = useTranslation('tasks');
  const toast = useToast();
  const dates = useDateRangeFormatter();
  const { tab, setTab, setPendingApprovalsCount, showTeam, setShowTeam } = useTimeOffTab();
  const [employees, setEmployees] = useState<any[]>([]);
  const [timeOffPolicies, setTimeOffPolicies] = useState<TimeOffPolicy[]>([]);
  const [myRequests, setMyRequests] = useState<TimeOffRequest[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<TimeOffRequest[]>([]);
  const [teamRequests, setTeamRequests] = useState<TimeOffRequest[]>([]);
  const [teamBalances, setTeamBalances] = useState<TimeOffBalance[]>([]);
  const [myBalances, setMyBalances] = useState<TimeOffBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [myFilterPolicyId, setMyFilterPolicyId] = useState<string | null>(null);
  const [newRequest, setNewRequest] = useState<NewRequestFormValue>({ timeOffPolicyId: '', startDate: '', endDate: '', note: '' });
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [preview, setPreview] = useState<TimeOffRequestPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [companyDayCount, setCompanyDayCount] = useState<TimeOffDayCount>('calendar');
  const [ledger, setLedger] = useState<TimeOffLedger | null>(null);
  const [adjustForm, setAdjustForm] = useState<AdjustFormValue>({ timeOffPolicyId: '', direction: 'add', days: '1', reason: '' });
  const [savingAdjust, setSavingAdjust] = useState(false);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);

  const [slideOverMode, setSlideOverMode] = useState<'add' | 'edit' | null>(null);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [policyForm, setPolicyForm] = useState(EMPTY_POLICY_FORM);
  const [assignStepPolicy, setAssignStepPolicy] = useState<TimeOffPolicy | null>(null);
  const [assignStepSelected, setAssignStepSelected] = useState<Set<string>>(new Set());
  const [assignStepSaving, setAssignStepSaving] = useState(false);
  const [policyRowMenuFor, setPolicyRowMenuFor] = useState<string | null>(null);
  const policyRowMenuAnchorRef = useRef<HTMLElement | null>(null);
  const [deletingPolicy, setDeletingPolicy] = useState<TimeOffPolicy | null>(null);
  const [deletingPolicySaving, setDeletingPolicySaving] = useState(false);
  const [policiesFilter, setPoliciesFilter] = useState<'active' | 'inactive'>('active');

  // Custom Roles Fase J — the policy + tenant-wide routes are gated by manage_custom_fields on the
  // server (a pre-existing mismatch Fases D/E deliberately left alone, see database-schema.md's
  // Fase E section); mirrors the real gate.
  const permissions = usePermissions();
  const isAdmin = permissions.has('manage_custom_fields');
  const myEmployee = employees.find((emp) => emp.userId === user.id);
  // The employee directory a plain member gets doesn't carry managerId, so "who approves my
  // requests" comes from the approver stamped on my own most recent request instead.
  const myApprover = useMemo(() => {
    const fromRequests = [...myRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((r) => r.approver)?.approver;
    if (fromRequests) return fromRequests;
    const manager = myEmployee?.managerId ? employees.find((emp) => emp.id === myEmployee.managerId) : null;
    return manager ?? null;
  }, [myRequests, myEmployee, employees]);
  const myManagerName = myApprover ? `${myApprover.firstName} ${myApprover.lastName}` : null;

  // Admins can decide any pending request (by role); a manager only the ones assigned to them.
  const awaitingDecision = useMemo(
    () => (isAdmin ? teamRequests.filter((r) => r.status === 'pending') : pendingApprovals),
    [isAdmin, teamRequests, pendingApprovals],
  );

  // A manager's team is whoever the server's ?scope=team data covers (their direct reports) —
  // the member-facing employee directory doesn't expose managerId to compute it client-side.
  const directReports = useMemo(() => {
    const ids = new Set([...teamBalances.map((b) => b.employeeId), ...teamRequests.map((r) => r.employeeId)]);
    return Array.from(ids).map((id) => {
      const emp = employees.find((e) => e.id === id);
      if (emp) return emp;
      const bal = teamBalances.find((b) => b.employeeId === id);
      const req = teamRequests.find((r) => r.employeeId === id);
      return { id, firstName: bal?.employeeFirstName ?? req?.employee?.firstName ?? '', lastName: bal?.employeeLastName ?? req?.employee?.lastName ?? '' };
    });
  }, [employees, teamBalances, teamRequests]);

  const people: TeamPerson[] = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const base: any[] = isAdmin ? employees : directReports;
    return base
      .map((emp) => {
        const upcoming = teamRequests
          .filter((r) => r.employeeId === emp.id && r.status === 'approved' && isoDay(r.endDate) >= today)
          .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
        return {
          employeeId: emp.id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          jobTitle: emp.jobTitleDefn?.name || '',
          department: emp.departmentDefn?.name || '—',
          balances: teamBalances.filter((b) => b.employeeId === emp.id),
          pendingCount: teamRequests.filter((r) => r.employeeId === emp.id && r.status === 'pending').length,
          nextTimeOff: upcoming ? upcoming.startDate : null,
        };
      })
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  }, [isAdmin, employees, directReports, teamRequests, teamBalances]);

  // The "Available" column shows one policy for everyone — the tenant's biggest allowance
  // (vacation, in practice). Every policy is in the person's panel.
  const mainPolicyId = useMemo(() => {
    const pool = teamBalances.length ? teamBalances : myBalances;
    return pool.reduce<TimeOffBalance | null>((best, b) => (!best || b.daysPerYear > best.daysPerYear ? b : best), null)?.timeOffPolicyId ?? null;
  }, [teamBalances, myBalances]);

  useEffect(() => {
    loadData();
    // TimeOffTabContext is mounted once at AppLayout, not per-visit — reset to the default view
    // on arrival so Time Off always opens on "My time off" (same reason as 2026-09-09).
    setTab('mine');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPendingApprovalsCount(awaitingDecision.length);
  }, [awaitingDecision, setPendingApprovalsCount]);

  useEffect(() => {
    if (loading) return;
    const teamApplies = isAdmin || directReports.length > 0 || pendingApprovals.length > 0;
    setShowTeam(teamApplies);
    if ((tab === 'team' && !teamApplies) || (tab === 'policies' && !isAdmin)) setTab('mine');
  }, [loading, isAdmin, directReports, pendingApprovals, tab, setShowTeam, setTab]);

  // `silent` refreshes after an action without flashing the skeleton over the current view.
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [employeeData, policyData, myRequestData, approvalData, teamRequestData, teamBalanceData] = await Promise.all([
        api.listEmployees(token),
        api.listTimeOffPolicies(token),
        api.listTimeOffRequests(token, 'mine'),
        api.listTimeOffRequests(token, 'pending-approval'),
        api.listTimeOffRequests(token, isAdmin ? 'all' : 'team'),
        api.listTimeOffBalances(token, isAdmin ? undefined : 'team'),
      ]);
      api.getTimeOffSettings(token).then((s) => setCompanyDayCount(s.defaultDayCount)).catch(() => {});
      setEmployees(employeeData);
      setTimeOffPolicies(policyData);
      setMyRequests(myRequestData);
      setPendingApprovals(approvalData);
      setTeamRequests(teamRequestData);
      setTeamBalances(teamBalanceData);

      const myEmployeeRecord = employeeData.find((emp: any) => emp.userId === user.id);
      setMyBalances(myEmployeeRecord ? await api.getEmployeeTimeOffBalance(token, myEmployeeRecord.id) : []);
    } catch (error) {
      toast.error(t('timeOff.toasts.loadFailed', { message: (error as Error).message }));
    } finally {
      if (!silent) setLoading(false);
    }
  };
  const refresh = () => loadData(true);

  // The request form's numbers come from the server (company rules: day counting, holidays, days
  // off, the person's religious holidays, advance/negative-balance rule) — debounced so typing a
  // date doesn't fire a request per keystroke.
  useEffect(() => {
    if (panel?.type !== 'new') return;
    const { timeOffPolicyId, startDate, endDate } = newRequest;
    setPreview(null);
    setPreviewError(null);
    if (!timeOffPolicyId || !startDate || !endDate) return;
    if (endDate < startDate) {
      setPreviewError(t('timeOff.requestForm.endBeforeStart'));
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      api
        .previewTimeOffRequest(token, { timeOffPolicyId, startDate, endDate })
        .then((p) => !cancelled && setPreview(p))
        .catch((error) => !cancelled && setPreviewError((error as Error).message))
        .finally(() => !cancelled && setPreviewLoading(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel?.type, newRequest.timeOffPolicyId, newRequest.startDate, newRequest.endDate, token]);

  // A person's adjustments and year-end closes, loaded when their panel opens.
  const personId = panel?.type === 'person' || panel?.type === 'adjust' ? panel.employeeId : null;
  useEffect(() => {
    setLedger(null);
    if (!personId) return;
    api.getTimeOffLedger(token, personId).then(setLedger).catch(() => setLedger({ adjustments: [], yearCloses: [] }));
  }, [personId, token]);

  const openAdjust = (employeeId: string) => {
    const first = teamBalances.find((b) => b.employeeId === employeeId);
    setAdjustForm({ timeOffPolicyId: first?.timeOffPolicyId ?? '', direction: 'add', days: '1', reason: '' });
    setPanel({ type: 'adjust', employeeId });
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (panel?.type !== 'adjust') return;
    const days = Number(adjustForm.days);
    if (!adjustForm.timeOffPolicyId || !Number.isFinite(days) || days <= 0 || !adjustForm.reason.trim()) return;
    setSavingAdjust(true);
    try {
      await api.createTimeOffAdjustment(token, panel.employeeId, {
        timeOffPolicyId: adjustForm.timeOffPolicyId,
        days: adjustForm.direction === 'add' ? days : -days,
        reason: adjustForm.reason.trim(),
      });
      toast.success(t('timeOff.rules.adjust.saved'));
      setPanel({ type: 'person', employeeId: panel.employeeId });
      refresh();
    } catch (error) {
      toast.error(t('timeOff.rules.adjust.failed', { message: (error as Error).message }));
    } finally {
      setSavingAdjust(false);
    }
  };

  // ---- My time off ----
  const openNewRequest = () => {
    const firstAvailable = myBalances.find((b) => b.timeOffPolicyId === myFilterPolicyId) ?? myBalances[0];
    setNewRequest({ timeOffPolicyId: firstAvailable?.timeOffPolicyId ?? '', startDate: '', endDate: '', note: '' });
    setPanel({ type: 'new' });
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requestBlocked(preview) || previewLoading) return;
    setSubmittingRequest(true);
    try {
      await api.createTimeOffRequest(token, {
        timeOffPolicyId: newRequest.timeOffPolicyId,
        startDate: newRequest.startDate,
        endDate: newRequest.endDate,
        note: newRequest.note.trim() || undefined,
      });
      setPanel(null);
      setMyFilterPolicyId(null);
      toast.success(t('timeOff.toasts.requestSubmitted'));
      refresh();
    } catch (error) {
      toast.error(t('timeOff.toasts.submitFailed', { message: (error as Error).message }));
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!cancellingRequestId) return;
    try {
      await api.cancelTimeOffRequest(token, cancellingRequestId);
      setCancellingRequestId(null);
      setPanel(null);
      toast.success(t('timeOff.toasts.requestCancelled'));
      refresh();
    } catch (error) {
      toast.error(t('timeOff.toasts.cancelFailed', { message: (error as Error).message }));
      setCancellingRequestId(null);
    }
  };

  // ---- Team ----
  const handleDecideRequest = async (requestId: string, status: 'approved' | 'rejected', note?: string) => {
    try {
      await api.decideTimeOffRequest(token, requestId, status, note);
      // Take the card away as soon as the server confirms; the full reload (balances, history)
      // follows in the background instead of holding the buttons disabled for a few seconds.
      setPendingApprovals((prev) => prev.filter((r) => r.id !== requestId));
      setTeamRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status, decisionNote: note ?? null } : r)));
      toast.success(status === 'approved' ? t('timeOff.toasts.requestApproved') : t('timeOff.toasts.requestRejected'));
      refresh();
    } catch (error) {
      toast.error(t('timeOff.toasts.decideFailed', { message: (error as Error).message }));
    }
  };

  // ---- Policies ----
  const closeSlideOver = () => {
    setSlideOverMode(null);
    setEditingPolicyId(null);
    setAssignStepPolicy(null);
    setAssignStepSelected(new Set());
  };

  const handleOpenAddPolicy = () => {
    setPolicyForm(EMPTY_POLICY_FORM);
    setSlideOverMode('add');
  };

  const handleStartEditPolicy = (policy: TimeOffPolicy) => {
    setPolicyForm({
      name: policy.name,
      color: policy.color || EMPTY_POLICY_FORM.color,
      accrualMethod: policy.accrualMethod,
      daysPerYear: String(policy.daysPerYear),
      isPaid: policy.isPaid,
      requiresApproval: policy.requiresApproval,
      dayCount: policy.dayCount,
      allowAdvance: policy.allowAdvance,
      unusedAction: policy.unusedAction,
      carryOverMax: policy.carryOverMax == null ? '' : String(policy.carryOverMax),
    });
    setEditingPolicyId(policy.id);
    setPanel(null);
    setSlideOverMode('edit');
    setPolicyRowMenuFor(null);
  };

  const handleSubmitPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: policyForm.name,
      color: policyForm.color,
      accrualMethod: policyForm.accrualMethod as 'fixed_annual' | 'monthly',
      daysPerYear: Number(policyForm.daysPerYear),
      isPaid: policyForm.isPaid,
      requiresApproval: policyForm.requiresApproval,
      dayCount: policyForm.dayCount,
      allowAdvance: policyForm.accrualMethod === 'monthly' && policyForm.allowAdvance,
      unusedAction: policyForm.unusedAction,
      carryOverMax: policyForm.unusedAction === 'carry' && policyForm.carryOverMax !== '' ? Number(policyForm.carryOverMax) : null,
    };
    try {
      if (slideOverMode === 'edit' && editingPolicyId) {
        await api.updateTimeOffPolicy(token, editingPolicyId, data);
        toast.success(t('timeOff.toasts.policyUpdated'));
        closeSlideOver();
      } else {
        const created = await api.createTimeOffPolicy(token, data);
        toast.success(t('timeOff.toasts.policyAdded'));
        setAssignStepPolicy(created);
      }
      refresh();
    } catch (error) {
      toast.error(t('timeOff.toasts.saveFailed', { message: (error as Error).message }));
    }
  };

  const toggleAssignStepSelection = (employeeId: string) => {
    setAssignStepSelected((prev) => {
      const next = new Set(prev);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  };

  const handleBulkAssign = async () => {
    if (!assignStepPolicy || assignStepSelected.size === 0) {
      closeSlideOver();
      return;
    }
    setAssignStepSaving(true);
    try {
      const results = await Promise.allSettled(
        Array.from(assignStepSelected).map((employeeId) => api.assignTimeOffPolicyToEmployee(token, employeeId, assignStepPolicy.id)),
      );
      const failures = results.filter((r) => r.status === 'rejected').length;
      if (failures > 0) {
        toast.error(t('timeOff.toasts.assignedPartial', { success: results.length - failures, total: results.length, failed: failures }));
      } else {
        toast.success(t('timeOff.toasts.assignedToCount', { count: results.length }));
      }
      refresh();
      closeSlideOver();
    } finally {
      setAssignStepSaving(false);
    }
  };

  const handleUnassign = async (employeeId: string, policyId: string) => {
    try {
      await api.unassignTimeOffPolicyFromEmployee(token, employeeId, policyId);
      toast.success(t('timeOff.toasts.policyRemoved'));
      refresh();
    } catch (error) {
      toast.error(t('timeOff.toasts.removeFailed', { message: (error as Error).message }));
    }
  };

  const handleTogglePolicyActive = async (policy: TimeOffPolicy) => {
    try {
      await api.updateTimeOffPolicy(token, policy.id, { isActive: !policy.isActive });
      setPolicyRowMenuFor(null);
      refresh();
    } catch (error) {
      toast.error(t('timeOff.toasts.updateFailed', { message: (error as Error).message }));
    }
  };

  const handleOpenBulkAssign = (policy: TimeOffPolicy) => {
    setPanel(null);
    setAssignStepPolicy(policy);
    setAssignStepSelected(new Set());
    setPolicyRowMenuFor(null);
  };

  const policyAssignees = (policyId: string) =>
    employees.filter((emp) => (emp.timeOffPolicies || []).some((a: any) => a.timeOffPolicyId === policyId));

  const handleConfirmDeletePolicy = async () => {
    if (!deletingPolicy) return;
    setDeletingPolicySaving(true);
    try {
      const assignedEmployeeIds = policyAssignees(deletingPolicy.id).map((emp) => emp.id);
      await Promise.allSettled(assignedEmployeeIds.map((employeeId) => api.unassignTimeOffPolicyFromEmployee(token, employeeId, deletingPolicy.id)));
      await api.updateTimeOffPolicy(token, deletingPolicy.id, { isActive: false });
      toast.success(t('timeOff.toasts.deletedAndRemoved', { name: deletingPolicy.name, count: assignedEmployeeIds.length }));
      setDeletingPolicy(null);
      refresh();
    } catch (error) {
      toast.error(t('timeOff.toasts.deleteFailed', { message: (error as Error).message }));
    } finally {
      setDeletingPolicySaving(false);
    }
  };

  // Mobile FAB mirrors each view's "+" row: request time off on "mine", new policy on "policies".
  usePrimaryAction(
    tab === 'policies' && isAdmin
      ? { label: t('timeOff.policyDetail.newPolicy'), onClick: handleOpenAddPolicy }
      : tab === 'mine' && myBalances.length > 0
        ? { label: t('timeOff.mine.requestDays'), onClick: openNewRequest }
        : null,
  );

  const assignStepAvailableEmployees = assignStepPolicy
    ? employees.filter((emp) => !(emp.timeOffPolicies || []).some((a: any) => a.timeOffPolicyId === assignStepPolicy.id))
    : [];
  const deletingPolicyAssignedCount = deletingPolicy ? policyAssignees(deletingPolicy.id).length : 0;

  // ---- Detail modal (one Modal for every "click to see more") ----
  let panelTitle = '';
  let panelBody: React.ReactNode = null;
  let panelFooter: React.ReactNode = undefined;
  if (panel?.type === 'request') {
    const r = myRequests.find((x) => x.id === panel.id);
    if (r) {
      panelTitle = `${r.timeOffPolicy.name} · ${dates.range(r.startDate, r.endDate)}`;
      panelBody = <RequestDetailBody request={r} approverName={myManagerName} />;
      if (r.status === 'pending') {
        panelFooter = (
          <button type="button" className="btn-danger" onClick={() => setCancellingRequestId(r.id)}>
            {t('timeOff.requestDetail.cancel')}
          </button>
        );
      }
    }
  } else if (panel?.type === 'new') {
    const blocked = requestBlocked(preview) || previewLoading;
    panelTitle = t('timeOff.requestForm.title');
    panelBody = (
      <>
        <p className="to-modal-lead">
          {myManagerName ? t('timeOff.requestForm.subtitleApprover', { name: myManagerName }) : t('timeOff.requestForm.subtitleNoApprover')}
        </p>
        <NewRequestForm
          value={newRequest}
          onChange={setNewRequest}
          onSubmit={handleCreateRequest}
          balances={myBalances}
          preview={preview}
          previewLoading={previewLoading}
          previewError={previewError}
        />
      </>
    );
    panelFooter = (
      <>
        <button type="button" className="btn-secondary" onClick={() => setPanel(null)}>
          {t('timeOff.slideOver.cancel')}
        </button>
        <button type="submit" form={NEW_REQUEST_FORM_ID} className="btn-primary" disabled={blocked || submittingRequest}>
          {t('timeOff.requestForm.submit')}
        </button>
      </>
    );
  } else if (panel?.type === 'person') {
    const emp: any = employees.find((e) => e.id === panel.employeeId) ?? directReports.find((e: any) => e.id === panel.employeeId);
    if (emp) {
      panelTitle = `${emp.firstName} ${emp.lastName}`;
      const subtitle = [emp.jobTitleDefn?.name, emp.departmentDefn?.name].filter(Boolean).join(' · ');
      panelBody = (
        <>
          {subtitle && (
            <div className="to-person mb-5">
              <Avatar firstName={emp.firstName} lastName={emp.lastName} />
              <span className="to-muted">{subtitle}</span>
            </div>
          )}
          <TeamMemberDetailBody
            balances={teamBalances.filter((b) => b.employeeId === emp.id)}
            requests={teamRequests.filter((r) => r.employeeId === emp.id)}
            pendingApprovals={awaitingDecision.filter((r) => r.employeeId === emp.id)}
            ledger={ledger}
            onDecide={handleDecideRequest}
            onAdjust={isAdmin && teamBalances.some((b) => b.employeeId === emp.id) ? () => openAdjust(emp.id) : undefined}
          />
        </>
      );
    }
  } else if (panel?.type === 'adjust') {
    const emp: any = employees.find((e) => e.id === panel.employeeId);
    panelTitle = t('timeOff.rules.adjust.title', { name: emp ? `${emp.firstName} ${emp.lastName}` : '' });
    panelBody = (
      <AdjustBalanceForm
        value={adjustForm}
        onChange={setAdjustForm}
        onSubmit={handleAdjust}
        balances={teamBalances.filter((b) => b.employeeId === panel.employeeId)}
      />
    );
    panelFooter = (
      <>
        <button type="button" className="btn-secondary" onClick={() => setPanel({ type: 'person', employeeId: panel.employeeId })}>
          {t('timeOff.slideOver.cancel')}
        </button>
        <button
          type="submit"
          form={ADJUST_FORM_ID}
          className="btn-primary"
          disabled={savingAdjust || !adjustForm.reason.trim() || !(Number(adjustForm.days) > 0)}
        >
          {t('timeOff.rules.adjust.save')}
        </button>
      </>
    );
  } else if (panel?.type === 'policy') {
    const p = timeOffPolicies.find((x) => x.id === panel.id);
    if (p) {
      panelTitle = p.name;
      panelBody = (
        <PolicyDetailBody
          policy={p}
          accrualLabel={t(`timeOff.accrual.${ACCRUAL_KEY_MAP[p.accrualMethod] || 'fixed'}`)}
          companyDayCountLabel={t(companyDayCount === 'business' ? 'timeOff.rules.request.modeBusiness' : 'timeOff.rules.request.modeCalendar')}
          assignees={policyAssignees(p.id)}
          onRemove={(employeeId) => handleUnassign(employeeId, p.id)}
          onAssign={() => handleOpenBulkAssign(p)}
        />
      );
      panelFooter = (
        <button type="button" className="btn-secondary" onClick={() => handleStartEditPolicy(p)}>
          {t('timeOff.policyDetail.edit')}
        </button>
      );
    }
  }

  return (
    <div className="container">
      {cancellingRequestId && (
        <ConfirmDialog
          title={t('timeOff.cancelRequestDialog.title')}
          message={t('timeOff.cancelRequestDialog.message')}
          confirmLabel={t('timeOff.cancelRequestDialog.confirmLabel')}
          onConfirm={handleCancelRequest}
          onCancel={() => setCancellingRequestId(null)}
        />
      )}
      {deletingPolicy && (
        <ConfirmDialog
          title={t('timeOff.confirmDeletePolicy.title', { name: deletingPolicy.name })}
          message={t('timeOff.confirmDeletePolicy.message', { name: deletingPolicy.name, count: deletingPolicyAssignedCount })}
          confirmLabel={deletingPolicySaving ? t('timeOff.confirmDeletePolicy.deleting') : 'DELETE'}
          confirmText="DELETE"
          confirmDisabled={deletingPolicySaving}
          onConfirm={handleConfirmDeletePolicy}
          onCancel={() => setDeletingPolicy(null)}
        />
      )}

      <Modal open={panel !== null && panelBody !== null} title={panelTitle} onClose={() => setPanel(null)} footer={panelFooter} wide>
        {panelBody}
      </Modal>

      <Modal
        open={slideOverMode !== null || assignStepPolicy !== null}
        title={
          assignStepPolicy
            ? t('timeOff.slideOver.assignTitle', { name: assignStepPolicy.name })
            : slideOverMode === 'edit'
              ? t('timeOff.slideOver.editTitle')
              : t('timeOff.slideOver.addTitle')
        }
        onClose={closeSlideOver}
        wide
        footer={
          assignStepPolicy ? (
            <>
              <button type="button" className="btn-secondary" onClick={closeSlideOver} disabled={assignStepSaving}>
                {t('timeOff.slideOver.skip')}
              </button>
              <button type="button" className="btn-primary" onClick={handleBulkAssign} disabled={assignStepSaving}>
                {assignStepSaving
                  ? t('timeOff.slideOver.assigning')
                  : assignStepSelected.size === 0
                    ? t('timeOff.slideOver.done')
                    : t('timeOff.slideOver.assignToCount', { count: assignStepSelected.size })}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={closeSlideOver}>
                {t('timeOff.slideOver.cancel')}
              </button>
              <button type="submit" form="time-off-policy-form" className="btn-primary">
                {slideOverMode === 'edit' ? t('timeOff.slideOver.save') : t('timeOff.slideOver.create')}
              </button>
            </>
          )
        }
      >
        {assignStepPolicy ? (
          <div>
            <p className="mb-3 text-sm text-ink-muted dark:text-dark-ink-muted">{t('timeOff.slideOver.assignPrompt', { name: assignStepPolicy.name })}</p>
            {assignStepAvailableEmployees.length === 0 ? (
              <p className="text-sm text-ink-muted dark:text-dark-ink-muted">
                {employees.length === 0 ? t('timeOff.slideOver.noEmployeesYet') : t('timeOff.slideOver.everyoneHasPolicy')}
              </p>
            ) : (
              <>
                <div className="mb-2 flex gap-3 text-xs">
                  <button
                    type="button"
                    className="status-manage-link"
                    onClick={() => setAssignStepSelected(new Set(assignStepAvailableEmployees.map((e) => e.id)))}
                  >
                    {t('timeOff.slideOver.selectAll')}
                  </button>
                  <button type="button" className="status-manage-link" onClick={() => setAssignStepSelected(new Set())}>
                    {t('timeOff.slideOver.selectNone')}
                  </button>
                </div>
                <div className="policy-manage-list" style={{ maxHeight: 'none' }}>
                  {assignStepAvailableEmployees.map((emp) => (
                    <label key={emp.id} className="policy-manage-row cursor-pointer">
                      <input type="checkbox" className="w-auto" checked={assignStepSelected.has(emp.id)} onChange={() => toggleAssignStepSelection(emp.id)} />
                      <span className="status-manage-name">
                        {emp.firstName} {emp.lastName}
                      </span>
                      <span className="policy-manage-meta">{emp.departmentDefn?.name}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <form id="time-off-policy-form" onSubmit={handleSubmitPolicy}>
            <div className="form-group">
              <label htmlFor="policy-name">
                {t('timeOff.policyForm.name')}
                <RequiredMark />
              </label>
              <input
                id="policy-name"
                type="text"
                value={policyForm.name}
                onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })}
                placeholder={t('timeOff.policyForm.namePlaceholder')}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="policy-days">
                {t('timeOff.policyForm.daysPerYear')}
                <RequiredMark />
              </label>
              <input
                id="policy-days"
                type="number"
                min="0"
                step="0.5"
                value={policyForm.daysPerYear}
                onChange={(e) => setPolicyForm({ ...policyForm, daysPerYear: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="policy-accrual">{t('timeOff.policyForm.accrualMethod')}</label>
              <select id="policy-accrual" value={policyForm.accrualMethod} onChange={(e) => setPolicyForm({ ...policyForm, accrualMethod: e.target.value })}>
                <option value="fixed_annual">{t('timeOff.policyForm.accrualFixedOption')}</option>
                <option value="monthly">{t('timeOff.policyForm.accrualMonthlyOption')}</option>
              </select>
            </div>
            <div className="form-group">
              <label>{t('timeOff.policyForm.color')}</label>
              <ColorPicker value={policyForm.color} onChange={(color) => setPolicyForm({ ...policyForm, color })} />
            </div>
            <div className="form-group">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={policyForm.isPaid}
                  onChange={(e) => setPolicyForm({ ...policyForm, isPaid: e.target.checked })}
                  className="w-auto"
                />
                {t('timeOff.policyForm.paid')}
              </label>
            </div>
            <div className="form-group">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={policyForm.requiresApproval}
                  onChange={(e) => setPolicyForm({ ...policyForm, requiresApproval: e.target.checked })}
                  className="w-auto"
                />
                {t('timeOff.policyForm.requiresApproval')}
              </label>
            </div>
            <h4 className="rules-subtitle">{t('timeOff.rules.policy.rulesTitle')}</h4>
            <div className="form-group">
              <label htmlFor="policy-daycount">{t('timeOff.rules.policy.dayCount')}</label>
              <select
                id="policy-daycount"
                value={policyForm.dayCount}
                onChange={(e) => setPolicyForm({ ...policyForm, dayCount: e.target.value as TimeOffPolicy['dayCount'] })}
              >
                <option value="inherit">
                  {t('timeOff.rules.policy.inherit', { mode: t(companyDayCount === 'business' ? 'timeOff.rules.request.modeBusiness' : 'timeOff.rules.request.modeCalendar') })}
                </option>
                <option value="business">{t('timeOff.rules.policy.business')}</option>
                <option value="calendar">{t('timeOff.rules.policy.calendar')}</option>
              </select>
            </div>
            {policyForm.accrualMethod === 'monthly' && (
              <div className="form-group">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="w-auto"
                    checked={policyForm.allowAdvance}
                    onChange={(e) => setPolicyForm({ ...policyForm, allowAdvance: e.target.checked })}
                  />
                  {t('timeOff.rules.policy.allowAdvance')}
                </label>
                <p className="rules-hint">{t('timeOff.rules.policy.allowAdvanceHint')}</p>
              </div>
            )}
            <div className="form-group">
              <span className="rules-label">{t('timeOff.rules.policy.unused')}</span>
              <div className="mini-toggle-row">
                <button
                  type="button"
                  className={`mini-toggle-opt ${policyForm.unusedAction === 'carry' ? 'active' : ''}`}
                  onClick={() => setPolicyForm({ ...policyForm, unusedAction: 'carry' })}
                >
                  {t('timeOff.rules.policy.carry')}
                </button>
                <button
                  type="button"
                  className={`mini-toggle-opt ${policyForm.unusedAction === 'expire' ? 'active' : ''}`}
                  onClick={() => setPolicyForm({ ...policyForm, unusedAction: 'expire' })}
                >
                  {t('timeOff.rules.policy.expire')}
                </button>
              </div>
              <p className="rules-hint">{t('timeOff.rules.policy.unusedHint')}</p>
            </div>
            {policyForm.unusedAction === 'carry' && (
              <div className="form-group">
                <label htmlFor="policy-carry-max">{t('timeOff.rules.policy.carryMax')}</label>
                <input
                  id="policy-carry-max"
                  type="number"
                  min="0"
                  step="0.5"
                  value={policyForm.carryOverMax}
                  onChange={(e) => setPolicyForm({ ...policyForm, carryOverMax: e.target.value })}
                />
                <p className="rules-hint">{t('timeOff.rules.policy.carryMaxHint')}</p>
              </div>
            )}
          </form>
        )}
      </Modal>

      {loading ? (
        <TableSkeleton />
      ) : tab === 'team' && showTeam ? (
        <TeamTimeOffView
          isAdmin={isAdmin}
          people={people}
          pendingApprovals={awaitingDecision}
          balances={teamBalances}
          mainPolicyId={mainPolicyId}
          onDecide={handleDecideRequest}
          onOpenPerson={(employeeId) => setPanel({ type: 'person', employeeId })}
        />
      ) : tab === 'policies' && isAdmin ? (
        <TimeOffPoliciesView
          policies={timeOffPolicies}
          filter={policiesFilter}
          onFilter={setPoliciesFilter}
          assignedCount={(policyId) => policyAssignees(policyId).length}
          onOpenPolicy={(p) => setPanel({ type: 'policy', id: p.id })}
          onOpenMenu={(anchor, p) => {
            policyRowMenuAnchorRef.current = anchor;
            setPolicyRowMenuFor(policyRowMenuFor === p.id ? null : p.id);
          }}
          onAdd={handleOpenAddPolicy}
        />
      ) : (
        <MyTimeOffView
          linked={!!myEmployee}
          balances={myBalances}
          requests={myRequests}
          filterPolicyId={myFilterPolicyId}
          onFilter={setMyFilterPolicyId}
          onOpenRequest={(r) => setPanel({ type: 'request', id: r.id })}
          onNewRequest={openNewRequest}
        />
      )}

      <Popover open={policyRowMenuFor !== null} onClose={() => setPolicyRowMenuFor(null)} anchorRef={policyRowMenuAnchorRef} width={160} align="right">
        {(() => {
          const menuPolicy = timeOffPolicies.find((p) => p.id === policyRowMenuFor);
          if (!menuPolicy) return null;
          return (
            <>
              <div className="popover-menu-item" onClick={() => handleStartEditPolicy(menuPolicy)}>
                {t('timeOff.policies.menu.edit')}
              </div>
              <div className="popover-menu-item" onClick={() => handleOpenBulkAssign(menuPolicy)}>
                {t('timeOff.policies.menu.addInBulk')}
              </div>
              <div
                className={`popover-menu-item ${menuPolicy.isActive ? 'danger' : 'success'}`}
                onClick={() => {
                  setPolicyRowMenuFor(null);
                  if (menuPolicy.isActive) setDeletingPolicy(menuPolicy);
                  else handleTogglePolicyActive(menuPolicy);
                }}
              >
                {menuPolicy.isActive ? t('timeOff.policies.menu.delete') : t('timeOff.policies.menu.activate')}
              </div>
            </>
          );
        })()}
      </Popover>
    </div>
  );
}
