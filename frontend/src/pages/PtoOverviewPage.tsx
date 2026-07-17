import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useToast } from '../components/ToastProvider';
import ConfirmDialog from '../components/ConfirmDialog';
import SlideOver from '../components/SlideOver';
import Popover from '../components/Popover';
import ColorPicker from '../components/ColorPicker';
import { ChevronDownIcon, GearIcon, PencilIcon, PlusIcon } from '../components/Icons';

const ACCRUAL_LABELS: Record<string, string> = {
  fixed_annual: 'Fixed',
  monthly: 'Monthly',
};

interface PtoOverviewPageProps {
  user: any;
  token: string;
}

type Tab = 'assignments' | 'my-requests' | 'approvals' | 'all-requests' | 'balances';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export default function PtoOverviewPage({ user, token }: PtoOverviewPageProps) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('assignments');
  const [employees, setEmployees] = useState<any[]>([]);
  const [ptoPolicies, setPtoPolicies] = useState<any[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [allRequests, setAllRequests] = useState<any[]>([]);
  const [myBalances, setMyBalances] = useState<any[]>([]);
  const [tenantBalances, setTenantBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(null);
  const [newRequest, setNewRequest] = useState({ ptoPolicyId: '', startDate: '', endDate: '', note: '' });

  const [policiesMenuOpen, setPoliciesMenuOpen] = useState(false);
  const policiesMenuButtonRef = useRef<HTMLButtonElement>(null);
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

  const canManagePolicies = user.role === 'owner' || user.role === 'admin';
  const myEmployee = employees.find((emp) => emp.userId === user.id);
  const myAssignedPolicies = (myEmployee?.ptoPolicies || []).map((a: any) => a.ptoPolicy);
  const activePtoPolicies = ptoPolicies.filter((p) => p.isActive);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [employeeData, policyData, myRequestData, approvalData, allRequestData, tenantBalanceData] =
        await Promise.all([
          api.listEmployees(token),
          api.listPtoPolicies(token),
          api.listPtoRequests(token, 'mine'),
          api.listPtoRequests(token, 'pending-approval'),
          canManagePolicies ? api.listPtoRequests(token, 'all') : Promise.resolve([]),
          canManagePolicies ? api.listPtoBalances(token) : Promise.resolve([]),
        ]);
      setEmployees(employeeData);
      setPtoPolicies(policyData);
      setMyRequests(myRequestData);
      setPendingApprovals(approvalData);
      setAllRequests(allRequestData);
      setTenantBalances(tenantBalanceData);

      const myEmployeeRecord = employeeData.find((emp: any) => emp.userId === user.id);
      setMyBalances(myEmployeeRecord ? await api.getEmployeePtoBalance(token, myEmployeeRecord.id) : []);
    } catch (error) {
      toast.error('Failed to load PTO overview: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (employeeId: string, policyId: string) => {
    try {
      await api.assignPtoPolicyToEmployee(token, employeeId, policyId);
      setAssignMenuFor(null);
      toast.success('Policy assigned.');
      loadData();
    } catch (error) {
      toast.error('Failed to assign PTO policy: ' + (error as Error).message);
    }
  };

  const handleUnassign = async (employeeId: string, policyId: string) => {
    try {
      await api.unassignPtoPolicyFromEmployee(token, employeeId, policyId);
      toast.success('Policy removed.');
      loadData();
    } catch (error) {
      toast.error('Failed to remove PTO policy: ' + (error as Error).message);
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
    setPoliciesMenuOpen(false);
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
    setPoliciesMenuOpen(false);
    setSlideOverMode('edit');
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
        await api.updatePtoPolicy(token, editingPolicyId, data);
        toast.success('PTO policy updated.');
        closeSlideOver();
      } else {
        const created = await api.createPtoPolicy(token, data);
        toast.success('PTO policy added.');
        setAssignStepPolicy(created);
      }
      loadData();
    } catch (error) {
      toast.error('Failed to save PTO policy: ' + (error as Error).message);
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
          api.assignPtoPolicyToEmployee(token, employeeId, assignStepPolicy.id),
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
      await api.updatePtoPolicy(token, policy.id, { isActive: !policy.isActive });
      loadData();
    } catch (error) {
      toast.error('Failed to update PTO policy: ' + (error as Error).message);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createPtoRequest(token, {
        ptoPolicyId: newRequest.ptoPolicyId,
        startDate: newRequest.startDate,
        endDate: newRequest.endDate,
        note: newRequest.note || undefined,
      });
      setNewRequest({ ptoPolicyId: '', startDate: '', endDate: '', note: '' });
      toast.success('Request submitted.');
      loadData();
    } catch (error) {
      toast.error('Failed to submit PTO request: ' + (error as Error).message);
    }
  };

  const handleCancelRequest = async () => {
    if (!cancellingRequestId) return;
    try {
      await api.cancelPtoRequest(token, cancellingRequestId);
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
      await api.decidePtoRequest(token, requestId, status);
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
          message="Are you sure you want to cancel this PTO request?"
          confirmLabel="Cancel Request"
          onConfirm={handleCancelRequest}
          onCancel={() => setCancellingRequestId(null)}
        />
      )}
      <SlideOver
        open={slideOverMode !== null}
        title={
          assignStepPolicy
            ? `Assign "${assignStepPolicy.name}"`
            : slideOverMode === 'edit'
              ? 'Edit PTO Policy'
              : 'Add PTO Policy'
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
              <button type="submit" form="pto-policy-form" className="btn-primary">
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
            {employees.length === 0 ? (
              <p className="text-sm text-gray-500">No employees yet.</p>
            ) : (
              <>
                <div className="mb-2 flex gap-3 text-xs">
                  <button
                    type="button"
                    className="status-manage-link"
                    onClick={() => setAssignStepSelected(new Set(employees.map((e) => e.id)))}
                  >
                    Select all
                  </button>
                  <button type="button" className="status-manage-link" onClick={() => setAssignStepSelected(new Set())}>
                    Select none
                  </button>
                </div>
                <div className="policy-manage-list" style={{ maxHeight: 'none' }}>
                  {employees.map((emp) => (
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
                      <span className="policy-manage-meta">{emp.department}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <form id="pto-policy-form" onSubmit={handleSubmitPolicy}>
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

      <div className="page-toolbar">
        <h2>PTO</h2>
        {canManagePolicies && (
          <>
            <button
              ref={policiesMenuButtonRef}
              type="button"
              className="tb-btn"
              onClick={() => setPoliciesMenuOpen((v) => !v)}
            >
              <GearIcon />
              Policies
              <ChevronDownIcon className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="btn-outline" onClick={handleOpenAddPolicy}>
              <span className="inline-flex items-center gap-1.5">
                <PlusIcon className="h-3.5 w-3.5" />
                Add Policy
              </span>
            </button>
            <Popover open={policiesMenuOpen} onClose={() => setPoliciesMenuOpen(false)} anchorRef={policiesMenuButtonRef} width={320}>
              <div className="policy-manage-list">
                {ptoPolicies.length === 0 && <p className="text-xs text-gray-500">No policies yet.</p>}
                {ptoPolicies.map((policy) => (
                  <div className="policy-manage-row" key={policy.id}>
                    <span className="color-dot" style={{ background: policy.color || '#9ca3af' }} />
                    <span className={`status-manage-name ${!policy.isActive ? 'inactive' : ''}`}>{policy.name}</span>
                    <span className="policy-manage-meta">
                      {ACCRUAL_LABELS[policy.accrualMethod] || policy.accrualMethod} · {policy.daysPerYear}d
                    </span>
                    <button
                      type="button"
                      className="col-add-trigger"
                      onClick={() => handleStartEditPolicy(policy)}
                      aria-label={`Edit ${policy.name}`}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      className="status-manage-link"
                      onClick={() => handleTogglePolicyActive(policy)}
                    >
                      {policy.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                ))}
              </div>
            </Popover>
          </>
        )}
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
      </div>

      <div className="mt-4">
        {loading && <p>Loading...</p>}

        {!loading && tab === 'assignments' && (
          <>
            <p className="text-sm text-gray-500 mb-3">
              Which PTO policies apply to each employee. Manage the policies themselves (days per year, accrual,
              etc.) from the "Policies" button above.
            </p>
            {activePtoPolicies.length === 0 ? (
              <p>No PTO policies defined yet. Add one from the "Policies" button above.</p>
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
                      const assignedIds = (emp.ptoPolicies || []).map((a: any) => a.ptoPolicyId);
                      const availableToAdd = activePtoPolicies.filter((p) => !assignedIds.includes(p.id));
                      return (
                        <tr key={emp.id}>
                          <td>
                            {emp.firstName} {emp.lastName}
                          </td>
                          <td>{emp.department}</td>
                          <td>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {(emp.ptoPolicies || []).length === 0 && !canManagePolicies && (
                                <span className="text-gray-400 dark:text-gray-500">—</span>
                              )}
                              {emp.ptoPolicies?.map((a: any) => (
                                <span key={a.id} className="pto-policy-chip">
                                  <span className="color-dot" style={{ background: a.ptoPolicy.color || '#9ca3af' }} />
                                  {a.ptoPolicy.name}
                                  {canManagePolicies && (
                                    <button
                                      type="button"
                                      className="pto-policy-chip-remove"
                                      onClick={() => handleUnassign(emp.id, a.ptoPolicyId)}
                                      aria-label={`Remove ${a.ptoPolicy.name}`}
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
              const assignedIds = (menuEmployee.ptoPolicies || []).map((a: any) => a.ptoPolicyId);
              const menuAvailable = activePtoPolicies.filter((p) => !assignedIds.includes(p.id));
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
              <p>Your account isn't linked to an employee record, so you can't submit PTO requests.</p>
            ) : (
              <>
                {myAssignedPolicies.length === 0 ? (
                  <p>You don't have any PTO policies assigned yet — ask an admin to assign one.</p>
                ) : (
                  <>
                    {myBalances.length > 0 && (
                      <div className="mb-4 flex flex-wrap gap-2">
                        {myBalances.map((bal) => (
                          <span key={bal.ptoPolicyId} className="pto-policy-chip">
                            <span className="color-dot" style={{ background: bal.color || '#9ca3af' }} />
                            {bal.policyName}: {bal.remaining} of {bal.allocated} days left
                            {bal.pending > 0 ? ` (${bal.pending} pending)` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    <form onSubmit={handleCreateRequest} className="mb-5">
                      <div className="form-group">
                        <label htmlFor="pto-request-policy">Policy</label>
                        <select
                          id="pto-request-policy"
                          value={newRequest.ptoPolicyId}
                          onChange={(e) => setNewRequest({ ...newRequest, ptoPolicyId: e.target.value })}
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
                        <label htmlFor="pto-request-start">Start date</label>
                        <input
                          id="pto-request-start"
                          type="date"
                          value={newRequest.startDate}
                          onChange={(e) => setNewRequest({ ...newRequest, startDate: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="pto-request-end">End date</label>
                        <input
                          id="pto-request-end"
                          type="date"
                          value={newRequest.endDate}
                          onChange={(e) => setNewRequest({ ...newRequest, endDate: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="pto-request-note">Note (optional)</label>
                        <input
                          id="pto-request-note"
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
                  <p>You haven't requested any PTO yet.</p>
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
                          <td>{req.ptoPolicy.name}</td>
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
                      <td>{req.ptoPolicy.name}</td>
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
              <p>No PTO requests yet.</p>
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
                      <td>{req.ptoPolicy.name}</td>
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
            {tenantBalances.length === 0 ? (
              <p>No PTO policy assignments yet.</p>
            ) : (
              <div className="full-table-wrap">
              <table className="table full-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Policy</th>
                    <th>Accrual</th>
                    <th>Allocated ({new Date().getFullYear()})</th>
                    <th>Used</th>
                    <th>Pending</th>
                    <th>Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantBalances.map((bal) => (
                    <tr key={`${bal.employeeId}-${bal.ptoPolicyId}`}>
                      <td>
                        {bal.employeeFirstName} {bal.employeeLastName}
                      </td>
                      <td>
                        <span className="color-dot mr-2 inline-block" style={{ background: bal.color || '#9ca3af' }} />
                        {bal.policyName}
                      </td>
                      <td>{bal.accrualMethod === 'monthly' ? 'Monthly' : 'Fixed annual'}</td>
                      <td>{bal.allocated}</td>
                      <td>{bal.used}</td>
                      <td>{bal.pending}</td>
                      <td>{bal.remaining}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
