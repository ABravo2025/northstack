import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useToast } from '../components/ToastProvider';
import ConfirmDialog from '../components/ConfirmDialog';
import SlideOver from '../components/SlideOver';
import Popover from '../components/Popover';
import ColorPicker from '../components/ColorPicker';
import { ChevronDownIcon, DotsVerticalIcon, PlusIcon } from '../components/Icons';

const ACCRUAL_LABELS: Record<string, string> = {
  fixed_annual: 'Fixed',
  monthly: 'Monthly',
};

interface TimeOffOverviewPageProps {
  user: any;
  token: string;
}

type Tab = 'assignments' | 'my-requests' | 'approvals' | 'all-requests' | 'balances' | 'policies';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export default function TimeOffOverviewPage({ user, token }: TimeOffOverviewPageProps) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('assignments');
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

  const canManagePolicies = user.role === 'owner' || user.role === 'admin';
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
  }, []);

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
      toast.error('Failed to load Time Off overview: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (employeeId: string, policyId: string) => {
    try {
      await api.assignTimeOffPolicyToEmployee(token, employeeId, policyId);
      setAssignMenuFor(null);
      toast.success('Policy assigned.');
      loadData();
    } catch (error) {
      toast.error('Failed to assign Time Off policy: ' + (error as Error).message);
    }
  };

  const handleUnassign = async (employeeId: string, policyId: string) => {
    try {
      await api.unassignTimeOffPolicyFromEmployee(token, employeeId, policyId);
      toast.success('Policy removed.');
      loadData();
    } catch (error) {
      toast.error('Failed to remove Time Off policy: ' + (error as Error).message);
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
        toast.success('Time off policy updated.');
        closeSlideOver();
      } else {
        const created = await api.createTimeOffPolicy(token, data);
        toast.success('Time off policy added.');
        setAssignStepPolicy(created);
      }
      loadData();
    } catch (error) {
      toast.error('Failed to save time off policy: ' + (error as Error).message);
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
        toast.error(`Assigned to ${results.length - failures} of ${results.length} employees — ${failures} failed.`);
      } else {
        toast.success(`Assigned to ${results.length} employee${results.length === 1 ? '' : 's'}.`);
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
      toast.error('Failed to update time off policy: ' + (error as Error).message);
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
      toast.success(`"${deletingPolicy.name}" deleted and removed from ${assignedEmployeeIds.length} employee${assignedEmployeeIds.length === 1 ? '' : 's'}.`);
      setDeletingPolicy(null);
      loadData();
    } catch (error) {
      toast.error('Failed to delete time off policy: ' + (error as Error).message);
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
      toast.success('Request submitted.');
      loadData();
    } catch (error) {
      toast.error('Failed to submit time off request: ' + (error as Error).message);
    }
  };

  const handleCancelRequest = async () => {
    if (!cancellingRequestId) return;
    try {
      await api.cancelTimeOffRequest(token, cancellingRequestId);
      setCancellingRequestId(null);
      toast.success('Request cancelled.');
      loadData();
    } catch (error) {
      toast.error('Failed to cancel request: ' + (error as Error).message);
      setCancellingRequestId(null);
    }
  };

  const handleDecideRequest = async (requestId: string, status: 'approved' | 'rejected') => {
    try {
      await api.decideTimeOffRequest(token, requestId, status);
      toast.success(status === 'approved' ? 'Request approved.' : 'Request rejected.');
      loadData();
    } catch (error) {
      toast.error('Failed to decide request: ' + (error as Error).message);
    }
  };

  return (
    <div>
      {cancellingRequestId && (
        <ConfirmDialog
          title="Cancel request"
          message="Are you sure you want to cancel this time off request?"
          confirmLabel="Cancel Request"
          onConfirm={handleCancelRequest}
          onCancel={() => setCancellingRequestId(null)}
        />
      )}
      {deletingPolicy && (
        <ConfirmDialog
          title={`Delete "${deletingPolicy.name}"`}
          message={`This will remove "${deletingPolicy.name}" from all ${
            employees.filter((emp) => (emp.timeOffPolicies || []).some((a: any) => a.timeOffPolicyId === deletingPolicy.id))
              .length
          } employee(s) currently assigned to it, then deactivate the policy. Past time off requests made under it are not affected. Type DELETE to confirm.`}
          confirmLabel={deletingPolicySaving ? 'Deleting…' : 'DELETE'}
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
            ? `Assign "${assignStepPolicy.name}"`
            : slideOverMode === 'edit'
              ? 'Edit Time Off Policy'
              : 'Add Time Off Policy'
        }
        onClose={closeSlideOver}
        footer={
          assignStepPolicy ? (
            <>
              <button type="button" className="btn-secondary" onClick={closeSlideOver} disabled={assignStepSaving}>
                Skip
              </button>
              <button type="button" className="btn-primary" onClick={handleBulkAssign} disabled={assignStepSaving}>
                {assignStepSaving
                  ? 'Assigning…'
                  : assignStepSelected.size === 0
                    ? 'Done'
                    : `Assign to ${assignStepSelected.size} employee${assignStepSelected.size === 1 ? '' : 's'}`}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={closeSlideOver}>
                Cancel
              </button>
              <button type="submit" form="time-off-policy-form" className="btn-primary">
                {slideOverMode === 'edit' ? 'Save' : 'Create'}
              </button>
            </>
          )
        }
      >
        {assignStepPolicy ? (
          <div>
            <p className="mb-3 text-sm text-gray-500">
              Who should have "{assignStepPolicy.name}"? You can also do this later from the Assignments tab.
            </p>
            {assignStepAvailableEmployees.length === 0 ? (
              <p className="text-sm text-gray-500">
                {employees.length === 0 ? 'No employees yet.' : 'Every employee already has this policy.'}
              </p>
            ) : (
              <>
                <div className="mb-2 flex gap-3 text-xs">
                  <button
                    type="button"
                    className="status-manage-link"
                    onClick={() => setAssignStepSelected(new Set(assignStepAvailableEmployees.map((e) => e.id)))}
                  >
                    Select all
                  </button>
                  <button type="button" className="status-manage-link" onClick={() => setAssignStepSelected(new Set())}>
                    Select none
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
              <label htmlFor="policy-name">Name</label>
              <input
                id="policy-name"
                type="text"
                value={policyForm.name}
                onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })}
                placeholder="e.g. PTO, Sick Leave, Leave Emergency"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="policy-days">Days per year</label>
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
              <label htmlFor="policy-accrual">Accrual method</label>
              <select
                id="policy-accrual"
                value={policyForm.accrualMethod}
                onChange={(e) => setPolicyForm({ ...policyForm, accrualMethod: e.target.value })}
              >
                <option value="fixed_annual">Fixed annual — all days available at once</option>
                <option value="monthly">Monthly — days accrue progressively</option>
              </select>
            </div>
            <div className="form-group">
              <label>Color</label>
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
                Paid
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
                Requires approval
              </label>
            </div>
          </form>
        )}
      </SlideOver>

      <div className="page-toolbar no-border">
        <h2>Time Off</h2>
      </div>
      <div className="views-bar">
        <button
          type="button"
          className={`view-tab ${tab === 'assignments' ? 'active' : ''}`}
          onClick={() => setTab('assignments')}
        >
          Assignments
        </button>
        <button
          type="button"
          className={`view-tab ${tab === 'my-requests' ? 'active' : ''}`}
          onClick={() => setTab('my-requests')}
        >
          My Requests
        </button>
        <button
          type="button"
          className={`view-tab ${tab === 'approvals' ? 'active' : ''}`}
          onClick={() => setTab('approvals')}
        >
          Approvals{pendingApprovals.length > 0 ? ` (${pendingApprovals.length})` : ''}
        </button>
        {canManagePolicies && (
          <button
            type="button"
            className={`view-tab ${tab === 'all-requests' ? 'active' : ''}`}
            onClick={() => setTab('all-requests')}
          >
            All Requests
          </button>
        )}
        {canManagePolicies && (
          <button
            type="button"
            className={`view-tab ${tab === 'balances' ? 'active' : ''}`}
            onClick={() => setTab('balances')}
          >
            Balances
          </button>
        )}
        {canManagePolicies && (
          <button
            type="button"
            className={`view-tab ${tab === 'policies' ? 'active' : ''}`}
            onClick={() => setTab('policies')}
          >
            Policies
          </button>
        )}
        {canManagePolicies && (
          <button type="button" className="btn-outline btn-tab-size ml-auto" onClick={handleOpenAddPolicy}>
            <PlusIcon className="h-3.5 w-3.5" />
            Add Policy
          </button>
        )}
      </div>

      <div className="mt-4">
        {loading && <p>Loading...</p>}

        {!loading && tab === 'assignments' && (
          <>
            <p className="text-sm text-gray-500 mb-3">
              Which time off policies apply to each employee. Manage the policies themselves (days per year, accrual,
              etc.) from the Policies tab.
            </p>
            {activeTimeOffPolicies.length === 0 ? (
              <p>No time off policies defined yet. Add one from the Policies tab.</p>
            ) : employees.length === 0 ? (
              <p>No employees yet.</p>
            ) : (
              <div className="full-table-wrap">
                <table className="table full-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Department</th>
                      <th>Assigned Policies</th>
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
                                <span className="text-gray-400 dark:text-gray-500">—</span>
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
                                      aria-label={`Remove ${a.timeOffPolicy.name}`}
                                      title="Remove"
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
                                  aria-label={`Add policy for ${emp.firstName} ${emp.lastName}`}
                                  title="Add policy"
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
                return <p className="text-xs text-gray-500">No more policies to assign.</p>;
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
              <p>Your account isn't linked to an employee record, so you can't submit time off requests.</p>
            ) : (
              <>
                {myAssignedPolicies.length === 0 ? (
                  <p>You don't have any time off policies assigned yet — ask an admin to assign one.</p>
                ) : (
                  <>
                    {myBalances.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {myBalances.map((bal) => (
                          <span key={bal.timeOffPolicyId} className="time-off-policy-chip">
                            <span className="color-dot" style={{ background: bal.color || '#9ca3af' }} />
                            {bal.policyName}: {bal.remaining} of {bal.allocated} days left
                            {bal.pending > 0 ? ` (${bal.pending} pending)` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    <form onSubmit={handleCreateRequest} className="mb-5">
                      <div className="form-group">
                        <label htmlFor="time-off-request-policy">Policy</label>
                        <select
                          id="time-off-request-policy"
                          value={newRequest.timeOffPolicyId}
                          onChange={(e) => setNewRequest({ ...newRequest, timeOffPolicyId: e.target.value })}
                          required
                        >
                          <option value="">-- select --</option>
                          {myAssignedPolicies.map((p: any) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="time-off-request-start">Start date</label>
                        <input
                          id="time-off-request-start"
                          type="date"
                          value={newRequest.startDate}
                          onChange={(e) => setNewRequest({ ...newRequest, startDate: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="time-off-request-end">End date</label>
                        <input
                          id="time-off-request-end"
                          type="date"
                          value={newRequest.endDate}
                          onChange={(e) => setNewRequest({ ...newRequest, endDate: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="time-off-request-note">Note (optional)</label>
                        <input
                          id="time-off-request-note"
                          type="text"
                          value={newRequest.note}
                          onChange={(e) => setNewRequest({ ...newRequest, note: e.target.value })}
                        />
                      </div>
                      <button type="submit" className="btn-primary">
                        Submit Request
                      </button>
                    </form>
                  </>
                )}

                {myRequests.length === 0 ? (
                  <p>You haven't requested any time off yet.</p>
                ) : (
                  <div className="full-table-wrap">
                  <table className="table full-table">
                    <thead>
                      <tr>
                        <th>Policy</th>
                        <th>Dates</th>
                        <th>Days</th>
                        <th>Status</th>
                        <th>Note</th>
                        <th>Actions</th>
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
                          <td>{STATUS_LABELS[req.status] || req.status}</td>
                          <td>{req.decisionNote || req.note || '—'}</td>
                          <td>
                            {req.status === 'pending' && (
                              <button
                                className="btn-danger px-2 py-1 text-xs"
                                onClick={() => setCancellingRequestId(req.id)}
                              >
                                Cancel
                              </button>
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
          </>
        )}

        {!loading && tab === 'approvals' && (
          <>
            {pendingApprovals.length === 0 ? (
              <p>No pending requests waiting on your approval.</p>
            ) : (
              <div className="full-table-wrap">
              <table className="table full-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Policy</th>
                    <th>Dates</th>
                    <th>Days</th>
                    <th>Note</th>
                    <th>Actions</th>
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
                          Approve
                        </button>
                        <button
                          className="btn-danger px-2 py-1 text-xs"
                          onClick={() => handleDecideRequest(req.id, 'rejected')}
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </>
        )}

        {!loading && tab === 'all-requests' && canManagePolicies && (
          <>
            {allRequests.length === 0 ? (
              <p>No time off requests yet.</p>
            ) : (
              <div className="full-table-wrap">
              <table className="table full-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Policy</th>
                    <th>Dates</th>
                    <th>Days</th>
                    <th>Status</th>
                    <th>Approver</th>
                    <th>Note</th>
                    <th>Actions</th>
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
                      <td>{STATUS_LABELS[req.status] || req.status}</td>
                      <td>{req.approver ? `${req.approver.firstName} ${req.approver.lastName}` : '—'}</td>
                      <td>{req.decisionNote || req.note || '—'}</td>
                      <td>
                        {req.status === 'pending' && (
                          <>
                            <button
                              className="btn-success px-2 py-1 text-xs mr-1.5"
                              onClick={() => handleDecideRequest(req.id, 'approved')}
                            >
                              Approve
                            </button>
                            <button
                              className="btn-danger px-2 py-1 text-xs"
                              onClick={() => handleDecideRequest(req.id, 'rejected')}
                            >
                              Reject
                            </button>
                          </>
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

        {!loading && tab === 'balances' && canManagePolicies && (
          <>
            {balancesByEmployee.length === 0 ? (
              <p>No time off policy assignments yet.</p>
            ) : (
              <div className="full-table-wrap">
                <table className="table full-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Department</th>
                      <th>Policies</th>
                      <th>Total remaining ({new Date().getFullYear()})</th>
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
            )}
          </>
        )}

        <SlideOver
          open={balancesDetailEmployeeId !== null}
          title={
            selectedBalanceEmployee
              ? `${selectedBalanceEmployee.employeeFirstName} ${selectedBalanceEmployee.employeeLastName}`
              : 'Balances'
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
                    <span className="font-semibold text-brand-navy dark:text-gray-100">{bal.policyName}</span>
                    <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{bal.remaining} left</span>
                    <ChevronDownIcon className={`h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                  {isExpanded && (
                    <div className="balance-detail-body">
                      <div className="balance-detail-stats">
                        <div>
                          <div className="balance-detail-stat-value">{bal.allocated}</div>
                          <div className="balance-detail-stat-label">Allocated</div>
                        </div>
                        <div>
                          <div className="balance-detail-stat-value">{bal.used}</div>
                          <div className="balance-detail-stat-label">Used</div>
                        </div>
                        <div>
                          <div className="balance-detail-stat-value">{bal.pending}</div>
                          <div className="balance-detail-stat-label">Pending</div>
                        </div>
                        <div>
                          <div className="balance-detail-stat-value highlight">{bal.remaining}</div>
                          <div className="balance-detail-stat-label">Remaining</div>
                        </div>
                      </div>
                      <p className="mb-1.5 text-xs font-semibold tracking-wide text-gray-400 uppercase dark:text-gray-500">
                        Accrual: {bal.accrualMethod === 'monthly' ? 'Monthly' : 'Fixed annual'}
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
                                {STATUS_LABELS[req.status] || req.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 dark:text-gray-500">No requests made under this policy yet.</p>
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
              <p>No time off policies defined yet. Add one from the "Add Policy" button above.</p>
            ) : (
              <>
                <div className="mini-toggle-row mb-3">
                  <button
                    type="button"
                    className={`mini-toggle-opt ${policiesFilter === 'active' ? 'active' : ''}`}
                    onClick={() => setPoliciesFilter('active')}
                  >
                    Active ({timeOffPolicies.filter((p) => p.isActive).length})
                  </button>
                  <button
                    type="button"
                    className={`mini-toggle-opt ${policiesFilter === 'inactive' ? 'active' : ''}`}
                    onClick={() => setPoliciesFilter('inactive')}
                  >
                    Deactivated ({timeOffPolicies.filter((p) => !p.isActive).length})
                  </button>
                </div>
                {filteredTimeOffPolicies.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    {policiesFilter === 'active' ? 'No active policies.' : 'No deactivated policies.'}
                  </p>
                ) : (
                  <div className="full-table-wrap">
                    <table className="table full-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Accrual</th>
                          <th>Days/year</th>
                          <th>Paid</th>
                          <th>Requires approval</th>
                          <th>Employees</th>
                          <th>Actions</th>
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
                              <td>{ACCRUAL_LABELS[policy.accrualMethod] || policy.accrualMethod}</td>
                              <td>{policy.daysPerYear}</td>
                              <td>{policy.isPaid ? 'Yes' : 'No'}</td>
                              <td>{policy.requiresApproval ? 'Yes' : 'No'}</td>
                              <td>{employeeCount}</td>
                              <td>
                                <button
                                  type="button"
                                  className="icon-btn"
                                  onClick={(e) => {
                                    policyRowMenuAnchorRef.current = e.currentTarget;
                                    setPolicyRowMenuFor(policyRowMenuFor === policy.id ? null : policy.id);
                                  }}
                                  aria-label={`Actions for ${policy.name}`}
                                  title="Actions"
                                >
                                  <DotsVerticalIcon />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
                      Edit
                    </div>
                    <div className="popover-menu-item" onClick={() => handleOpenBulkAssign(menuPolicy)}>
                      Add in bulk
                    </div>
                    <div
                      className={`popover-menu-item ${menuPolicy.isActive ? 'danger' : 'success'}`}
                      onClick={() =>
                        menuPolicy.isActive ? handleOpenDeletePolicy(menuPolicy) : handleTogglePolicyActive(menuPolicy)
                      }
                    >
                      {menuPolicy.isActive ? 'DELETE' : 'Activate'}
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
