import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useToast } from '../components/common/ToastProvider';
import ConfirmDialog from '../components/common/ConfirmDialog';
import SlideOver from '../components/common/SlideOver';
import Popover from '../components/common/Popover';
import ColorPicker from '../components/common/ColorPicker';
import EmptyState from '../components/common/EmptyState';
import TableSkeleton from '../components/common/TableSkeleton';
import RequiredMark from '../components/common/RequiredMark';
import { CalendarIcon, ChevronDownIcon, DotsVerticalIcon, PlusIcon } from '../components/common/Icons';
import EntityCardList from '../components/common/EntityCardList';
import { getInitials } from '../components/common/Avatar';
import { usePermissions } from '../contexts/PermissionsContext';
import { usePrimaryAction } from '../contexts/PrimaryActionContext';
import { useTimeOffTab } from '../contexts/TimeOffTabContext';

interface TimeOffOverviewPageProps {
  user: any;
  token: string;
}

// Tab values are kebab-case (routing/context concerns); JSON keys are camelCase.
const TAB_KEY_MAP: Record<string, string> = {
  'my-timeoff': 'myTimeoff',
  'my-requests': 'myRequests',
  approvals: 'approvals',
  balances: 'balances',
  'all-requests': 'allRequests',
  policies: 'policies',
  assignments: 'assignments',
};

const ACCRUAL_KEY_MAP: Record<string, string> = {
  fixed_annual: 'fixed',
  monthly: 'monthly',
};

export default function TimeOffOverviewPage({ user, token }: TimeOffOverviewPageProps) {
  const { t } = useTranslation('tasks');
  const toast = useToast();
  const { tab, setTab, setPendingApprovalsCount } = useTimeOffTab();
  const [employees, setEmployees] = useState<any[]>([]);
  const [timeOffPolicies, setTimeOffPolicies] = useState<any[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [allRequests, setAllRequests] = useState<any[]>([]);
  const [myBalances, setMyBalances] = useState<any[]>([]);
  const [tenantBalances, setTenantBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);
  const [newRequest, setNewRequest] = useState({ timeOffPolicyId: '', startDate: '', endDate: '', note: '' });

  const [assignMenuFor, setAssignMenuFor] = useState<string | null>(null);
  const assignMenuAnchorRef = useRef<HTMLElement | null>(null);
  const [slideOverMode, setSlideOverMode] = useState<'add' | 'edit' | null>(null);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [policyForm, setPolicyForm] = useState({
    name: '',
    color: '#3c6da1',
    accrualMethod: 'fixed_annual',
    daysPerYear: '15',
    isPaid: true,
    requiresApproval: true,
  });
  const [assignStepPolicy, setAssignStepPolicy] = useState<any | null>(null);
  const [assignStepSelected, setAssignStepSelected] = useState<Set<string>>(new Set());
  const [assignStepSaving, setAssignStepSaving] = useState(false);
  const [policyRowMenuFor, setPolicyRowMenuFor] = useState<string | null>(null);
  const policyRowMenuAnchorRef = useRef<HTMLElement | null>(null);
  const [deletingPolicy, setDeletingPolicy] = useState<any | null>(null);
  const [deletingPolicySaving, setDeletingPolicySaving] = useState(false);
  const [policiesFilter, setPoliciesFilter] = useState<'active' | 'inactive'>('active');
  const [balancesDetailEmployeeId, setBalancesDetailEmployeeId] = useState<string | null>(null);
  const [expandedBalancePolicyIds, setExpandedBalancePolicyIds] = useState<Set<string>>(new Set());
  const [expandedMyBalancePolicyIds, setExpandedMyBalancePolicyIds] = useState<Set<string>>(new Set());

  // Custom Roles Fase J — migrated off `user.role === 'owner'/'admin'`. Backend note: the
  // time-off-policy assignment routes (POST/DELETE .../time-off-policies) are still gated by
  // manage_custom_fields on the server, a pre-existing mismatch from before Custom Roles that
  // Fases D/E deliberately left alone (see database-schema.md's Fase E section) rather than
  // reassigning it to a more sensible-sounding permission — doing that here without also fixing
  // the backend would just be a different, newly-introduced mismatch. Mirrors the real gate.
  const permissions = usePermissions();
  const canManagePolicies = permissions.has('manage_custom_fields');
  const myEmployee = employees.find((emp) => emp.userId === user.id);
  const myAssignedPolicies = (myEmployee?.timeOffPolicies || []).map((a: any) => a.timeOffPolicy);
  const activeTimeOffPolicies = timeOffPolicies.filter((p) => p.isActive);
  const filteredTimeOffPolicies = timeOffPolicies.filter((p) => (policiesFilter === 'active' ? p.isActive : !p.isActive));
  const assignStepAvailableEmployees = assignStepPolicy
    ? employees.filter((emp) => !(emp.timeOffPolicies || []).some((a: any) => a.timeOffPolicyId === assignStepPolicy.id))
    : [];
  const balancesByEmployee = (() => {
    const map = new Map<string, any>();
    for (const bal of tenantBalances) {
      if (!map.has(bal.employeeId)) {
        const emp = employees.find((e) => e.id === bal.employeeId);
        map.set(bal.employeeId, {
          employeeId: bal.employeeId,
          employeeFirstName: bal.employeeFirstName,
          employeeLastName: bal.employeeLastName,
          department: emp?.departmentDefn?.name || '—',
          policies: [] as any[],
          totalRemaining: 0,
        });
      }
      const entry = map.get(bal.employeeId);
      entry.policies.push(bal);
      entry.totalRemaining += bal.remaining;
    }
    return Array.from(map.values());
  })();
  const selectedBalanceEmployee = balancesByEmployee.find((row) => row.employeeId === balancesDetailEmployeeId) ?? null;

  useEffect(() => {
    loadData();
    // TimeOffTabContext is mounted once at AppLayout, not per-visit, so the tab this page last
    // left on would otherwise still be selected next time you navigate here — reset it so
    // arriving at Time Off behaves the same as before this used shared state (2026-09-09).
    setTab('my-timeoff');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setPendingApprovalsCount(pendingApprovals.length);
  }, [pendingApprovals, setPendingApprovalsCount]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [employeeData, policyData, myRequestData, approvalData, allRequestData, tenantBalanceData] =
        await Promise.all([
          api.listEmployees(token),
          api.listTimeOffPolicies(token),
          api.listTimeOffRequests(token, 'mine'),
          api.listTimeOffRequests(token, 'pending-approval'),
          canManagePolicies ? api.listTimeOffRequests(token, 'all') : Promise.resolve([]),
          canManagePolicies ? api.listTimeOffBalances(token) : Promise.resolve([]),
        ]);
      setEmployees(employeeData);
      setTimeOffPolicies(policyData);
      setMyRequests(myRequestData);
      setPendingApprovals(approvalData);
      setAllRequests(allRequestData);
      setTenantBalances(tenantBalanceData);

      const myEmployeeRecord = employeeData.find((emp: any) => emp.userId === user.id);
      setMyBalances(myEmployeeRecord ? await api.getEmployeeTimeOffBalance(token, myEmployeeRecord.id) : []);
    } catch (error) {
      toast.error(t('timeOff.toasts.loadFailed', { message: (error as Error).message }));
    } finally {
      setLoading(false);
    }
  };

  // Silent refresh (no setLoading) — only the two things a policy
  // assignment/removal can actually affect (the employee's assignment list
  // and, for admins, tenant-wide balances), instead of loadData()'s full
  // 6-endpoint reload that flashed the whole tab behind the assign menu
  // (backlog QA, 2026-08-27 — same fix already used by
  // EmployeeOverviewPanel.tsx's onChanged for this same action).
  const refreshAfterAssignmentChange = async () => {
    try {
      const [employeeData, tenantBalanceData] = await Promise.all([
        api.listEmployees(token),
        canManagePolicies ? api.listTimeOffBalances(token) : Promise.resolve(tenantBalances),
      ]);
      setEmployees(employeeData);
      setTenantBalances(tenantBalanceData);
    } catch {
      // Non-critical — the assignment itself already succeeded; a stale list
      // here just means the next full loadData() (e.g. tab switch) catches up.
    }
  };

  const handleAssign = async (employeeId: string, policyId: string) => {
    try {
      await api.assignTimeOffPolicyToEmployee(token, employeeId, policyId);
      setAssignMenuFor(null);
      toast.success(t('timeOff.toasts.policyAssigned'));
      refreshAfterAssignmentChange();
    } catch (error) {
      toast.error(t('timeOff.toasts.assignFailed', { message: (error as Error).message }));
    }
  };

  const handleUnassign = async (employeeId: string, policyId: string) => {
    try {
      await api.unassignTimeOffPolicyFromEmployee(token, employeeId, policyId);
      toast.success(t('timeOff.toasts.policyRemoved'));
      refreshAfterAssignmentChange();
    } catch (error) {
      toast.error(t('timeOff.toasts.removeFailed', { message: (error as Error).message }));
    }
  };

  const closeSlideOver = () => {
    setSlideOverMode(null);
    setEditingPolicyId(null);
    setAssignStepPolicy(null);
    setAssignStepSelected(new Set());
  };

  const handleOpenAddPolicy = () => {
    setPolicyForm({
      name: '',
      color: '#3c6da1',
      accrualMethod: 'fixed_annual',
      daysPerYear: '15',
      isPaid: true,
      requiresApproval: true,
    });
    setSlideOverMode('add');
  };

  // Mobile FAB for the Policies tab — the header "Add Policy" button (previously always visible,
  // on every tab, wedged into the .views-bar) had no mobile equivalent at all, unlike every other
  // entity list in the app. Mirrors PayrollPage's per-tab usePrimaryAction.
  usePrimaryAction(
    canManagePolicies && tab === 'policies' ? { label: t('timeOff.policies.emptyState.primaryLabel'), onClick: handleOpenAddPolicy } : null,
  );

  const handleStartEditPolicy = (policy: any) => {
    setPolicyForm({
      name: policy.name,
      color: policy.color || '#3c6da1',
      accrualMethod: policy.accrualMethod,
      daysPerYear: String(policy.daysPerYear),
      isPaid: policy.isPaid,
      requiresApproval: policy.requiresApproval,
    });
    setEditingPolicyId(policy.id);
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
      loadData();
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
        Array.from(assignStepSelected).map((employeeId) =>
          api.assignTimeOffPolicyToEmployee(token, employeeId, assignStepPolicy.id),
        ),
      );
      const failures = results.filter((r) => r.status === 'rejected').length;
      if (failures > 0) {
        toast.error(
          t('timeOff.toasts.assignedPartial', { success: results.length - failures, total: results.length, failed: failures }),
        );
      } else {
        toast.success(t('timeOff.toasts.assignedToCount', { count: results.length }));
      }
      loadData();
      closeSlideOver();
    } finally {
      setAssignStepSaving(false);
    }
  };

  const handleTogglePolicyActive = async (policy: any) => {
    try {
      await api.updateTimeOffPolicy(token, policy.id, { isActive: !policy.isActive });
      setPolicyRowMenuFor(null);
      loadData();
    } catch (error) {
      toast.error(t('timeOff.toasts.updateFailed', { message: (error as Error).message }));
    }
  };

  const handleOpenBulkAssign = (policy: any) => {
    setAssignStepPolicy(policy);
    setAssignStepSelected(new Set());
    setPolicyRowMenuFor(null);
  };

  const handleOpenDeletePolicy = (policy: any) => {
    setDeletingPolicy(policy);
    setPolicyRowMenuFor(null);
  };

  const handleConfirmDeletePolicy = async () => {
    if (!deletingPolicy) return;
    setDeletingPolicySaving(true);
    try {
      const assignedEmployeeIds = employees
        .filter((emp) => (emp.timeOffPolicies || []).some((a: any) => a.timeOffPolicyId === deletingPolicy.id))
        .map((emp) => emp.id);
      await Promise.allSettled(
        assignedEmployeeIds.map((employeeId) =>
          api.unassignTimeOffPolicyFromEmployee(token, employeeId, deletingPolicy.id),
        ),
      );
      await api.updateTimeOffPolicy(token, deletingPolicy.id, { isActive: false });
      toast.success(t('timeOff.toasts.deletedAndRemoved', { name: deletingPolicy.name, count: assignedEmployeeIds.length }));
      setDeletingPolicy(null);
      loadData();
    } catch (error) {
      toast.error(t('timeOff.toasts.deleteFailed', { message: (error as Error).message }));
    } finally {
      setDeletingPolicySaving(false);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createTimeOffRequest(token, {
        timeOffPolicyId: newRequest.timeOffPolicyId,
        startDate: newRequest.startDate,
        endDate: newRequest.endDate,
        note: newRequest.note || undefined,
      });
      setNewRequest({ timeOffPolicyId: '', startDate: '', endDate: '', note: '' });
      toast.success(t('timeOff.toasts.requestSubmitted'));
      loadData();
    } catch (error) {
      toast.error(t('timeOff.toasts.submitFailed', { message: (error as Error).message }));
    }
  };

  const handleCancelRequest = async () => {
    if (!cancellingRequestId) return;
    try {
      await api.cancelTimeOffRequest(token, cancellingRequestId);
      setCancellingRequestId(null);
      toast.success(t('timeOff.toasts.requestCancelled'));
      loadData();
    } catch (error) {
      toast.error(t('timeOff.toasts.cancelFailed', { message: (error as Error).message }));
      setCancellingRequestId(null);
    }
  };

  const handleDecideRequest = async (requestId: string, status: 'approved' | 'rejected') => {
    try {
      await api.decideTimeOffRequest(token, requestId, status);
      toast.success(status === 'approved' ? t('timeOff.toasts.requestApproved') : t('timeOff.toasts.requestRejected'));
      loadData();
    } catch (error) {
      toast.error(t('timeOff.toasts.decideFailed', { message: (error as Error).message }));
    }
  };

  const deletingPolicyAssignedCount = deletingPolicy
    ? employees.filter((emp) => (emp.timeOffPolicies || []).some((a: any) => a.timeOffPolicyId === deletingPolicy.id)).length
    : 0;

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
      <SlideOver
        open={slideOverMode !== null || assignStepPolicy !== null}
        title={
          assignStepPolicy
            ? t('timeOff.slideOver.assignTitle', { name: assignStepPolicy.name })
            : slideOverMode === 'edit'
              ? t('timeOff.slideOver.editTitle')
              : t('timeOff.slideOver.addTitle')
        }
        onClose={closeSlideOver}
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
            <p className="mb-3 text-sm text-ink-muted dark:text-dark-ink-muted">
              {t('timeOff.slideOver.assignPrompt', { name: assignStepPolicy.name })}
            </p>
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
                      <input
                        type="checkbox"
                        className="w-auto"
                        checked={assignStepSelected.has(emp.id)}
                        onChange={() => toggleAssignStepSelection(emp.id)}
                      />
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
              <select
                id="policy-accrual"
                value={policyForm.accrualMethod}
                onChange={(e) => setPolicyForm({ ...policyForm, accrualMethod: e.target.value })}
              >
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
          </form>
        )}
      </SlideOver>

      <div className="page-toolbar no-border">
        <h2>{t(`timeOff.tabs.${TAB_KEY_MAP[tab]}`)}</h2>
      </div>

      <div className="mt-4">
        {loading && <TableSkeleton />}

        {!loading && tab === 'my-timeoff' && (
          <>
            {!myEmployee ? (
              <p>{t('timeOff.myTimeoff.notLinked')}</p>
            ) : myBalances.length === 0 ? (
              <p>{t('timeOff.myTimeoff.noPoliciesAssigned')}</p>
            ) : (
              myBalances.map((bal: any) => {
                const isExpanded = expandedMyBalancePolicyIds.has(bal.timeOffPolicyId);
                const policyRequests = myRequests
                  .filter((req: any) => req.timeOffPolicyId === bal.timeOffPolicyId)
                  .sort((a: any, b: any) => b.startDate.localeCompare(a.startDate));
                return (
                  <div key={bal.timeOffPolicyId} className="balance-detail-block">
                    <button
                      type="button"
                      className="balance-detail-head balance-detail-toggle"
                      onClick={() =>
                        setExpandedMyBalancePolicyIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(bal.timeOffPolicyId)) next.delete(bal.timeOffPolicyId);
                          else next.add(bal.timeOffPolicyId);
                          return next;
                        })
                      }
                      aria-expanded={isExpanded}
                    >
                      <span className="color-dot" style={{ background: bal.color || '#9ca3af' }} />
                      <span className="font-semibold text-brand-navy dark:text-dark-ink">{bal.policyName}</span>
                      <span className="ml-auto text-xs text-ink-faint dark:text-dark-ink-faint">
                        {t('timeOff.myTimeoff.remainingLeft', { count: bal.remaining })}
                      </span>
                      <ChevronDownIcon className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {isExpanded && (
                      <div className="balance-detail-body">
                        <div className="balance-detail-stats">
                          <div>
                            <div className="balance-detail-stat-value">{bal.allocated}</div>
                            <div className="balance-detail-stat-label">{t('timeOff.myTimeoff.stats.allocated')}</div>
                          </div>
                          <div>
                            <div className="balance-detail-stat-value">{bal.used}</div>
                            <div className="balance-detail-stat-label">{t('timeOff.myTimeoff.stats.used')}</div>
                          </div>
                          <div>
                            <div className="balance-detail-stat-value">{bal.pending}</div>
                            <div className="balance-detail-stat-label">{t('timeOff.myTimeoff.stats.pending')}</div>
                          </div>
                          <div>
                            <div className="balance-detail-stat-value highlight">{bal.remaining}</div>
                            <div className="balance-detail-stat-label">{t('timeOff.myTimeoff.stats.remaining')}</div>
                          </div>
                        </div>
                        <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">
                          {t('timeOff.myTimeoff.accrualLine', {
                            method: t(`timeOff.accrual.${ACCRUAL_KEY_MAP[bal.accrualMethod] || 'fixed'}`),
                          })}
                        </p>
                        {policyRequests.length > 0 ? (
                          <div className="balance-detail-requests">
                            {policyRequests.map((req: any) => (
                              <div key={req.id} className="balance-detail-request-row">
                                <span className="balance-detail-request-dates">
                                  {req.startDate.slice(0, 10)} → {req.endDate.slice(0, 10)}
                                </span>
                                <span className="balance-detail-request-days">{req.daysRequested}d</span>
                                <span className={`status-badge status-${req.status}`}>
                                  {t(`timeOff.status.${req.status}`, { defaultValue: req.status })}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-ink-faint dark:text-dark-ink-faint">{t('timeOff.myTimeoff.noRequestsUnderPolicy')}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}

        {!loading && tab === 'assignments' && canManagePolicies && (
          <>
            <p className="text-sm text-ink-muted dark:text-dark-ink-muted mb-3">{t('timeOff.assignments.description')}</p>
            {activeTimeOffPolicies.length === 0 ? (
              <p>{t('timeOff.assignments.noPoliciesDefined')}</p>
            ) : employees.length === 0 ? (
              <p>{t('timeOff.assignments.noEmployees')}</p>
            ) : (
              <>
                <div className="entity-card-list">
                  {employees.map((emp) => {
                    const assignedIds = (emp.timeOffPolicies || []).map((a: any) => a.timeOffPolicyId);
                    const availableToAdd = activeTimeOffPolicies.filter((p) => !assignedIds.includes(p.id));
                    return (
                      <div key={emp.id} className="entity-card" style={{ alignItems: 'flex-start' }}>
                        <span className="entity-card-avatar">{getInitials(emp.firstName, emp.lastName)}</span>
                        <span className="entity-card-body">
                          <span className="entity-card-name">
                            {emp.firstName} {emp.lastName}
                          </span>
                          <span className="entity-card-meta">{emp.departmentDefn?.name || '—'}</span>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {(emp.timeOffPolicies || []).length === 0 && !canManagePolicies && (
                              <span className="text-xs text-ink-faint dark:text-dark-ink-faint">—</span>
                            )}
                            {emp.timeOffPolicies?.map((a: any) => (
                              <span key={a.id} className="time-off-policy-chip">
                                <span className="color-dot" style={{ background: a.timeOffPolicy.color || '#9ca3af' }} />
                                {a.timeOffPolicy.name}
                                {canManagePolicies && (
                                  <button
                                    type="button"
                                    className="time-off-policy-chip-remove"
                                    onClick={() => handleUnassign(emp.id, a.timeOffPolicyId)}
                                    aria-label={t('timeOff.assignments.removePolicyAria', { name: a.timeOffPolicy.name })}
                                    title={t('timeOff.assignments.removeTitle')}
                                  >
                                    ×
                                  </button>
                                )}
                              </span>
                            ))}
                            {canManagePolicies && availableToAdd.length > 0 && (
                              <button
                                type="button"
                                className="col-add-trigger"
                                onClick={(e) => {
                                  assignMenuAnchorRef.current = e.currentTarget;
                                  setAssignMenuFor(emp.id);
                                }}
                                aria-label={t('timeOff.assignments.addPolicyForAria', { name: `${emp.firstName} ${emp.lastName}` })}
                                title={t('timeOff.assignments.addPolicyTitle')}
                              >
                                <PlusIcon />
                              </button>
                            )}
                          </div>
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="full-table-wrap has-mobile-cards">
                <table className="table full-table">
                  <thead>
                    <tr>
                      <th>{t('timeOff.assignments.table.employee')}</th>
                      <th>{t('timeOff.assignments.table.department')}</th>
                      <th>{t('timeOff.assignments.table.assignedPolicies')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => {
                      const assignedIds = (emp.timeOffPolicies || []).map((a: any) => a.timeOffPolicyId);
                      const availableToAdd = activeTimeOffPolicies.filter((p) => !assignedIds.includes(p.id));
                      return (
                        <tr key={emp.id}>
                          <td>
                            {emp.firstName} {emp.lastName}
                          </td>
                          <td>{emp.departmentDefn?.name || '—'}</td>
                          <td>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {(emp.timeOffPolicies || []).length === 0 && !canManagePolicies && (
                                <span className="text-ink-faint dark:text-dark-ink-faint">—</span>
                              )}
                              {emp.timeOffPolicies?.map((a: any) => (
                                <span key={a.id} className="time-off-policy-chip">
                                  <span className="color-dot" style={{ background: a.timeOffPolicy.color || '#9ca3af' }} />
                                  {a.timeOffPolicy.name}
                                  {canManagePolicies && (
                                    <button
                                      type="button"
                                      className="time-off-policy-chip-remove"
                                      onClick={() => handleUnassign(emp.id, a.timeOffPolicyId)}
                                      aria-label={t('timeOff.assignments.removePolicyAria', { name: a.timeOffPolicy.name })}
                                      title={t('timeOff.assignments.removeTitle')}
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))}
                              {canManagePolicies && availableToAdd.length > 0 && (
                                <button
                                  type="button"
                                  className="col-add-trigger"
                                  onClick={(e) => {
                                    assignMenuAnchorRef.current = e.currentTarget;
                                    setAssignMenuFor(emp.id);
                                  }}
                                  aria-label={t('timeOff.assignments.addPolicyForAria', { name: `${emp.firstName} ${emp.lastName}` })}
                                  title={t('timeOff.assignments.addPolicyTitle')}
                                >
                                  <PlusIcon />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </>
            )}
          </>
        )}

        <Popover open={assignMenuFor !== null} onClose={() => setAssignMenuFor(null)} anchorRef={assignMenuAnchorRef} width={200}>
          <div className="policy-manage-list">
            {(() => {
              const menuEmployee = employees.find((e) => e.id === assignMenuFor);
              if (!menuEmployee) return null;
              const assignedIds = (menuEmployee.timeOffPolicies || []).map((a: any) => a.timeOffPolicyId);
              const menuAvailable = activeTimeOffPolicies.filter((p) => !assignedIds.includes(p.id));
              if (menuAvailable.length === 0) {
                return <p className="text-xs text-ink-muted dark:text-dark-ink-muted">{t('timeOff.assignments.noMorePolicies')}</p>;
              }
              return menuAvailable.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className="policy-manage-row w-full cursor-pointer border-none bg-transparent text-left"
                  onClick={() => handleAssign(menuEmployee.id, p.id)}
                >
                  <span className="color-dot" style={{ background: p.color || '#9ca3af' }} />
                  <span className="status-manage-name">{p.name}</span>
                </button>
              ));
            })()}
          </div>
        </Popover>

        {!loading && tab === 'my-requests' && (
          <>
            {!myEmployee ? (
              <p>{t('timeOff.myRequests.notLinked')}</p>
            ) : (
              <>
                {myAssignedPolicies.length === 0 ? (
                  <p>{t('timeOff.myTimeoff.noPoliciesAssigned')}</p>
                ) : (
                  <>
                    {myBalances.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {myBalances.map((bal) => (
                          <span key={bal.timeOffPolicyId} className="time-off-policy-chip">
                            <span className="color-dot" style={{ background: bal.color || '#9ca3af' }} />
                            {bal.policyName}: {t('timeOff.myRequests.balanceChip', { remaining: bal.remaining, allocated: bal.allocated })}
                            {bal.pending > 0 ? t('timeOff.myRequests.balanceChipPending', { count: bal.pending }) : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    <form onSubmit={handleCreateRequest} className="mb-5">
                      <div className="form-group">
                        <label htmlFor="time-off-request-policy">
                          {t('timeOff.myRequests.form.policy')}
                          <RequiredMark />
                        </label>
                        <select
                          id="time-off-request-policy"
                          value={newRequest.timeOffPolicyId}
                          onChange={(e) => setNewRequest({ ...newRequest, timeOffPolicyId: e.target.value })}
                          required
                        >
                          <option value="">{t('timeOff.common.selectPlaceholder')}</option>
                          {myAssignedPolicies.map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="time-off-request-start">
                          {t('timeOff.myRequests.form.startDate')}
                          <RequiredMark />
                        </label>
                        <input
                          id="time-off-request-start"
                          type="date"
                          value={newRequest.startDate}
                          onChange={(e) => setNewRequest({ ...newRequest, startDate: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="time-off-request-end">
                          {t('timeOff.myRequests.form.endDate')}
                          <RequiredMark />
                        </label>
                        <input
                          id="time-off-request-end"
                          type="date"
                          value={newRequest.endDate}
                          onChange={(e) => setNewRequest({ ...newRequest, endDate: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="time-off-request-note">{t('timeOff.myRequests.form.note')}</label>
                        <input
                          id="time-off-request-note"
                          type="text"
                          value={newRequest.note}
                          onChange={(e) => setNewRequest({ ...newRequest, note: e.target.value })}
                        />
                      </div>
                      <button type="submit" className="btn-primary">
                        {t('timeOff.myRequests.form.submit')}
                      </button>
                    </form>
                  </>
                )}

                {myRequests.length === 0 ? (
                  <p>{t('timeOff.myRequests.noneYet')}</p>
                ) : (
                  <>
                  <div className="entity-card-list">
                    {myRequests.map((req) => (
                      <div key={req.id} className="entity-card" style={{ alignItems: 'flex-start' }}>
                        <span className="entity-card-body">
                          <span className="flex items-center justify-between gap-2">
                            <span className="entity-card-name">{req.timeOffPolicy.name}</span>
                            <span className={`status-badge status-${req.status} shrink-0`}>
                              {t(`timeOff.status.${req.status}`, { defaultValue: req.status })}
                            </span>
                          </span>
                          <span className="entity-card-meta">
                            {req.startDate.slice(0, 10)} → {req.endDate.slice(0, 10)} · {req.daysRequested}d
                          </span>
                          {req.status === 'pending' && (
                            <button
                              className="btn-danger mt-2 px-2 py-1 text-xs"
                              onClick={() => setCancellingRequestId(req.id)}
                            >
                              {t('timeOff.myRequests.cancel')}
                            </button>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="full-table-wrap has-mobile-cards">
                  <table className="table full-table">
                    <thead>
                      <tr>
                        <th>{t('timeOff.myRequests.table.policy')}</th>
                        <th>{t('timeOff.myRequests.table.dates')}</th>
                        <th>{t('timeOff.myRequests.table.days')}</th>
                        <th>{t('timeOff.myRequests.table.status')}</th>
                        <th>{t('timeOff.myRequests.table.note')}</th>
                        <th>{t('timeOff.myRequests.table.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myRequests.map((req) => (
                        <tr key={req.id}>
                          <td>{req.timeOffPolicy.name}</td>
                          <td>
                            {req.startDate.slice(0, 10)} → {req.endDate.slice(0, 10)}
                          </td>
                          <td>{req.daysRequested}</td>
                          <td>{t(`timeOff.status.${req.status}`, { defaultValue: req.status })}</td>
                          <td>{req.decisionNote || req.note || '—'}</td>
                          <td>
                            {req.status === 'pending' && (
                              <button
                                className="btn-danger px-2 py-1 text-xs"
                                onClick={() => setCancellingRequestId(req.id)}
                              >
                                {t('timeOff.myRequests.cancel')}
                              </button>
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
          </>
        )}

        {!loading && tab === 'approvals' && (
          <>
            {pendingApprovals.length === 0 ? (
              <p>{t('timeOff.approvals.empty')}</p>
            ) : (
              <>
              <div className="entity-card-list">
                {pendingApprovals.map((req) => (
                  <div key={req.id} className="entity-card" style={{ alignItems: 'flex-start' }}>
                    <span className="entity-card-avatar">{getInitials(req.employee.firstName, req.employee.lastName)}</span>
                    <span className="entity-card-body">
                      <span className="entity-card-name">
                        {req.employee.firstName} {req.employee.lastName}
                      </span>
                      <span className="entity-card-meta">
                        {req.timeOffPolicy.name} · {req.startDate.slice(0, 10)} → {req.endDate.slice(0, 10)} ·{' '}
                        {req.daysRequested}d
                      </span>
                      <div className="mt-2 flex gap-1.5">
                        <button
                          className="btn-success px-2 py-1 text-xs"
                          onClick={() => handleDecideRequest(req.id, 'approved')}
                        >
                          {t('timeOff.approvals.approve')}
                        </button>
                        <button
                          className="btn-danger px-2 py-1 text-xs"
                          onClick={() => handleDecideRequest(req.id, 'rejected')}
                        >
                          {t('timeOff.approvals.reject')}
                        </button>
                      </div>
                    </span>
                  </div>
                ))}
              </div>
              <div className="full-table-wrap has-mobile-cards">
              <table className="table full-table">
                <thead>
                  <tr>
                    <th>{t('timeOff.approvals.table.employee')}</th>
                    <th>{t('timeOff.approvals.table.policy')}</th>
                    <th>{t('timeOff.approvals.table.dates')}</th>
                    <th>{t('timeOff.approvals.table.days')}</th>
                    <th>{t('timeOff.approvals.table.note')}</th>
                    <th>{t('timeOff.approvals.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovals.map((req) => (
                    <tr key={req.id}>
                      <td>
                        {req.employee.firstName} {req.employee.lastName}
                      </td>
                      <td>{req.timeOffPolicy.name}</td>
                      <td>
                        {req.startDate.slice(0, 10)} → {req.endDate.slice(0, 10)}
                      </td>
                      <td>{req.daysRequested}</td>
                      <td>{req.note || '—'}</td>
                      <td>
                        <button
                          className="btn-success px-2 py-1 text-xs mr-1.5"
                          onClick={() => handleDecideRequest(req.id, 'approved')}
                        >
                          {t('timeOff.approvals.approve')}
                        </button>
                        <button
                          className="btn-danger px-2 py-1 text-xs"
                          onClick={() => handleDecideRequest(req.id, 'rejected')}
                        >
                          {t('timeOff.approvals.reject')}
                        </button>
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

        {!loading && tab === 'all-requests' && canManagePolicies && (
          <>
            {allRequests.length === 0 ? (
              <p>{t('timeOff.allRequests.empty')}</p>
            ) : (
              <>
              <div className="entity-card-list">
                {allRequests.map((req) => (
                  <div key={req.id} className="entity-card" style={{ alignItems: 'flex-start' }}>
                    <span className="entity-card-avatar">{getInitials(req.employee.firstName, req.employee.lastName)}</span>
                    <span className="entity-card-body">
                      <span className="flex items-center justify-between gap-2">
                        <span className="entity-card-name">
                          {req.employee.firstName} {req.employee.lastName}
                        </span>
                        <span className={`status-badge status-${req.status} shrink-0`}>
                          {t(`timeOff.status.${req.status}`, { defaultValue: req.status })}
                        </span>
                      </span>
                      <span className="entity-card-meta">
                        {req.timeOffPolicy.name} · {req.startDate.slice(0, 10)} → {req.endDate.slice(0, 10)} ·{' '}
                        {req.daysRequested}d
                      </span>
                      {req.status === 'pending' && (
                        <div className="mt-2 flex gap-1.5">
                          <button
                            className="btn-success px-2 py-1 text-xs"
                            onClick={() => handleDecideRequest(req.id, 'approved')}
                          >
                            {t('timeOff.approvals.approve')}
                          </button>
                          <button
                            className="btn-danger px-2 py-1 text-xs"
                            onClick={() => handleDecideRequest(req.id, 'rejected')}
                          >
                            {t('timeOff.approvals.reject')}
                          </button>
                        </div>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              <div className="full-table-wrap has-mobile-cards">
              <table className="table full-table">
                <thead>
                  <tr>
                    <th>{t('timeOff.allRequests.table.employee')}</th>
                    <th>{t('timeOff.allRequests.table.policy')}</th>
                    <th>{t('timeOff.allRequests.table.dates')}</th>
                    <th>{t('timeOff.allRequests.table.days')}</th>
                    <th>{t('timeOff.allRequests.table.status')}</th>
                    <th>{t('timeOff.allRequests.table.approver')}</th>
                    <th>{t('timeOff.allRequests.table.note')}</th>
                    <th>{t('timeOff.allRequests.table.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {allRequests.map((req) => (
                    <tr key={req.id}>
                      <td>
                        {req.employee.firstName} {req.employee.lastName}
                      </td>
                      <td>{req.timeOffPolicy.name}</td>
                      <td>
                        {req.startDate.slice(0, 10)} → {req.endDate.slice(0, 10)}
                      </td>
                      <td>{req.daysRequested}</td>
                      <td>{t(`timeOff.status.${req.status}`, { defaultValue: req.status })}</td>
                      <td>{req.approver ? `${req.approver.firstName} ${req.approver.lastName}` : '—'}</td>
                      <td>{req.decisionNote || req.note || '—'}</td>
                      <td>
                        {req.status === 'pending' && (
                          <>
                            <button
                              className="btn-success px-2 py-1 text-xs mr-1.5"
                              onClick={() => handleDecideRequest(req.id, 'approved')}
                            >
                              {t('timeOff.approvals.approve')}
                            </button>
                            <button
                              className="btn-danger px-2 py-1 text-xs"
                              onClick={() => handleDecideRequest(req.id, 'rejected')}
                            >
                              {t('timeOff.approvals.reject')}
                            </button>
                          </>
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

        {!loading && tab === 'balances' && canManagePolicies && (
          <>
            {balancesByEmployee.length === 0 ? (
              <p>{t('timeOff.balances.empty')}</p>
            ) : (
              <>
                <EntityCardList
                  items={balancesByEmployee}
                  getKey={(row) => row.employeeId}
                  getInitials={(row) => getInitials(row.employeeFirstName, row.employeeLastName)}
                  getName={(row) => `${row.employeeFirstName} ${row.employeeLastName}`}
                  getMeta={(row) =>
                    t('timeOff.balances.meta', { department: row.department || '—', count: row.policies.length, total: row.totalRemaining })
                  }
                  onSelect={(row) => setBalancesDetailEmployeeId(row.employeeId)}
                />
                <div className="full-table-wrap has-mobile-cards">
                <table className="table full-table">
                  <thead>
                    <tr>
                      <th>{t('timeOff.balances.table.employee')}</th>
                      <th>{t('timeOff.balances.table.department')}</th>
                      <th>{t('timeOff.balances.table.policies')}</th>
                      <th>{t('timeOff.balances.table.totalRemaining', { year: new Date().getFullYear() })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balancesByEmployee.map((row) => (
                      <tr key={row.employeeId}>
                        <td>
                          <button
                            type="button"
                            className="table-link"
                            onClick={() => setBalancesDetailEmployeeId(row.employeeId)}
                          >
                            {row.employeeFirstName} {row.employeeLastName}
                          </button>
                        </td>
                        <td>{row.department}</td>
                        <td>{row.policies.length}</td>
                        <td>{row.totalRemaining}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </>
            )}
          </>
        )}

        <SlideOver
          open={balancesDetailEmployeeId !== null}
          title={
            selectedBalanceEmployee
              ? `${selectedBalanceEmployee.employeeFirstName} ${selectedBalanceEmployee.employeeLastName}`
              : t('timeOff.balances.slideOverDefaultTitle')
          }
          onClose={() => {
            setBalancesDetailEmployeeId(null);
            setExpandedBalancePolicyIds(new Set());
          }}
        >
          {selectedBalanceEmployee &&
            selectedBalanceEmployee.policies.map((bal: any) => {
              const isExpanded = expandedBalancePolicyIds.has(bal.timeOffPolicyId);
              const policyRequests = allRequests
                .filter((req) => req.employeeId === selectedBalanceEmployee.employeeId && req.timeOffPolicyId === bal.timeOffPolicyId)
                .sort((a: any, b: any) => b.startDate.localeCompare(a.startDate));
              return (
                <div key={bal.timeOffPolicyId} className="balance-detail-block">
                  <button
                    type="button"
                    className="balance-detail-head balance-detail-toggle"
                    onClick={() =>
                      setExpandedBalancePolicyIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(bal.timeOffPolicyId)) next.delete(bal.timeOffPolicyId);
                        else next.add(bal.timeOffPolicyId);
                        return next;
                      })
                    }
                    aria-expanded={isExpanded}
                  >
                    <span className="color-dot" style={{ background: bal.color || '#9ca3af' }} />
                    <span className="font-semibold text-brand-navy dark:text-dark-ink">{bal.policyName}</span>
                    <span className="ml-auto text-xs text-ink-faint dark:text-dark-ink-faint">
                      {t('timeOff.myTimeoff.remainingLeft', { count: bal.remaining })}
                    </span>
                    <ChevronDownIcon className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {isExpanded && (
                    <div className="balance-detail-body">
                      <div className="balance-detail-stats">
                        <div>
                          <div className="balance-detail-stat-value">{bal.allocated}</div>
                          <div className="balance-detail-stat-label">{t('timeOff.myTimeoff.stats.allocated')}</div>
                        </div>
                        <div>
                          <div className="balance-detail-stat-value">{bal.used}</div>
                          <div className="balance-detail-stat-label">{t('timeOff.myTimeoff.stats.used')}</div>
                        </div>
                        <div>
                          <div className="balance-detail-stat-value">{bal.pending}</div>
                          <div className="balance-detail-stat-label">{t('timeOff.myTimeoff.stats.pending')}</div>
                        </div>
                        <div>
                          <div className="balance-detail-stat-value highlight">{bal.remaining}</div>
                          <div className="balance-detail-stat-label">{t('timeOff.myTimeoff.stats.remaining')}</div>
                        </div>
                      </div>
                      <p className="mb-1.5 text-xs font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">
                        {t('timeOff.myTimeoff.accrualLine', {
                          method: t(`timeOff.accrual.${ACCRUAL_KEY_MAP[bal.accrualMethod] || 'fixed'}`),
                        })}
                      </p>
                      {policyRequests.length > 0 ? (
                        <div className="balance-detail-requests">
                          {policyRequests.map((req: any) => (
                            <div key={req.id} className="balance-detail-request-row">
                              <span className="balance-detail-request-dates">
                                {req.startDate.slice(0, 10)} → {req.endDate.slice(0, 10)}
                              </span>
                              <span className="balance-detail-request-days">{req.daysRequested}d</span>
                              <span className={`status-badge status-${req.status}`}>
                                {t(`timeOff.status.${req.status}`, { defaultValue: req.status })}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-ink-faint dark:text-dark-ink-faint">{t('timeOff.myTimeoff.noRequestsUnderPolicy')}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </SlideOver>

        {!loading && tab === 'policies' && canManagePolicies && (
          <>
            {timeOffPolicies.length === 0 ? (
              <EmptyState
                icon={<CalendarIcon />}
                title={t('timeOff.policies.emptyState.title')}
                body={t('timeOff.policies.emptyState.body')}
                primaryLabel={t('timeOff.policies.emptyState.primaryLabel')}
                onPrimary={handleOpenAddPolicy}
              />
            ) : (
              <>
                <div className="mini-toggle-row mb-3">
                  <button
                    type="button"
                    className={`mini-toggle-opt ${policiesFilter === 'active' ? 'active' : ''}`}
                    onClick={() => setPoliciesFilter('active')}
                  >
                    {t('timeOff.policies.activeCount', { count: timeOffPolicies.filter((p) => p.isActive).length })}
                  </button>
                  <button
                    type="button"
                    className={`mini-toggle-opt ${policiesFilter === 'inactive' ? 'active' : ''}`}
                    onClick={() => setPoliciesFilter('inactive')}
                  >
                    {t('timeOff.policies.deactivatedCount', { count: timeOffPolicies.filter((p) => !p.isActive).length })}
                  </button>
                </div>
                {filteredTimeOffPolicies.length === 0 ? (
                  <p className="text-sm text-ink-muted dark:text-dark-ink-muted">
                    {policiesFilter === 'active' ? t('timeOff.policies.noActive') : t('timeOff.policies.noDeactivated')}
                  </p>
                ) : (
                  <>
                  <div className="entity-card-list">
                    {filteredTimeOffPolicies.map((policy) => {
                      const employeeCount = employees.filter((emp) =>
                        (emp.timeOffPolicies || []).some((a: any) => a.timeOffPolicyId === policy.id),
                      ).length;
                      return (
                        <div key={policy.id} className={`entity-card ${!policy.isActive ? 'opacity-60' : ''}`}>
                          <span className="entity-card-avatar" style={{ background: policy.color || '#9ca3af' }} />
                          <span className="entity-card-body">
                            <span className={`entity-card-name ${!policy.isActive ? 'line-through' : ''}`}>{policy.name}</span>
                            <span className="entity-card-meta">
                              {t('timeOff.policies.meta', {
                                accrual: t(`timeOff.accrual.${ACCRUAL_KEY_MAP[policy.accrualMethod] || 'fixed'}`),
                                days: policy.daysPerYear,
                                count: employeeCount,
                              })}
                            </span>
                          </span>
                          <button
                            type="button"
                            className="icon-btn shrink-0"
                            onClick={(e) => {
                              policyRowMenuAnchorRef.current = e.currentTarget;
                              setPolicyRowMenuFor(policyRowMenuFor === policy.id ? null : policy.id);
                            }}
                            aria-label={t('timeOff.policies.actionsForAria', { name: policy.name })}
                            title={t('timeOff.policies.actionsTitle')}
                          >
                            <DotsVerticalIcon />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="full-table-wrap has-mobile-cards">
                    <table className="table full-table">
                      <thead>
                        <tr>
                          <th>{t('timeOff.policies.table.name')}</th>
                          <th>{t('timeOff.policies.table.accrual')}</th>
                          <th>{t('timeOff.policies.table.daysPerYear')}</th>
                          <th>{t('timeOff.policies.table.paid')}</th>
                          <th>{t('timeOff.policies.table.requiresApproval')}</th>
                          <th>{t('timeOff.policies.table.employees')}</th>
                          <th>{t('timeOff.policies.table.actions')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTimeOffPolicies.map((policy) => {
                          const employeeCount = employees.filter((emp) =>
                            (emp.timeOffPolicies || []).some((a: any) => a.timeOffPolicyId === policy.id),
                          ).length;
                          return (
                            <tr key={policy.id} className={!policy.isActive ? 'table-row-inactive' : ''}>
                              <td>
                                <span className="color-dot mr-2 inline-block" style={{ background: policy.color || '#9ca3af' }} />
                                <span className={!policy.isActive ? 'line-through' : ''}>{policy.name}</span>
                              </td>
                              <td>{t(`timeOff.accrual.${ACCRUAL_KEY_MAP[policy.accrualMethod] || 'fixed'}`)}</td>
                              <td>{policy.daysPerYear}</td>
                              <td>{policy.isPaid ? t('timeOff.common.yes') : t('timeOff.common.no')}</td>
                              <td>{policy.requiresApproval ? t('timeOff.common.yes') : t('timeOff.common.no')}</td>
                              <td>{employeeCount}</td>
                              <td>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  onClick={(e) => {
                                    policyRowMenuAnchorRef.current = e.currentTarget;
                                    setPolicyRowMenuFor(policyRowMenuFor === policy.id ? null : policy.id);
                                  }}
                                  aria-label={t('timeOff.policies.actionsForAria', { name: policy.name })}
                                  title={t('timeOff.policies.actionsTitle')}
                                >
                                  <DotsVerticalIcon />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="ghost-row">
                          <td colSpan={7} className="ghost-row-cell" onClick={handleOpenAddPolicy}>
                            <span className="ghost-row-inner">
                              <span className="ghost-plus-box">
                                <PlusIcon className="h-3 w-3" />
                              </span>
                              {t('timeOff.policies.addRow')}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  </>
                )}
              </>
            )}
            <Popover
              open={policyRowMenuFor !== null}
              onClose={() => setPolicyRowMenuFor(null)}
              anchorRef={policyRowMenuAnchorRef}
              width={160}
              align="right"
            >
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
                      onClick={() =>
                        menuPolicy.isActive ? handleOpenDeletePolicy(menuPolicy) : handleTogglePolicyActive(menuPolicy)
                      }
                    >
                      {menuPolicy.isActive ? t('timeOff.policies.menu.delete') : t('timeOff.policies.menu.activate')}
                    </div>
                  </>
                );
              })()}
            </Popover>
          </>
        )}
      </div>
    </div>
  );
}
