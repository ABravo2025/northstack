import { useState, useEffect } from 'react';
import { api } from '../api';
import { useToast } from '../components/ToastProvider';
import ConfirmDialog from '../components/ConfirmDialog';

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
  const [addPolicySelection, setAddPolicySelection] = useState<Record<string, string>>({});
  const [newRequest, setNewRequest] = useState({ ptoPolicyId: '', startDate: '', endDate: '', note: '' });

  const canManagePolicies = user.role === 'owner' || user.role === 'admin';
  const myEmployee = employees.find((emp) => emp.userId === user.id);
  const myAssignedPolicies = (myEmployee?.ptoPolicies || []).map((a: any) => a.ptoPolicy);

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
      setPtoPolicies(policyData.filter((p) => p.isActive));
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

  const handleAssign = async (employeeId: string) => {
    const policyId = addPolicySelection[employeeId];
    if (!policyId) return;
    try {
      await api.assignPtoPolicyToEmployee(token, employeeId, policyId);
      setAddPolicySelection({ ...addPolicySelection, [employeeId]: '' });
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
      <div className="card">
        <h3>PTO</h3>
        <div className="nav mb-5">
          <button className={tab === 'assignments' ? 'active' : ''} onClick={() => setTab('assignments')}>
            Assignments
          </button>
          <button className={tab === 'my-requests' ? 'active' : ''} onClick={() => setTab('my-requests')}>
            My Requests
          </button>
          <button className={tab === 'approvals' ? 'active' : ''} onClick={() => setTab('approvals')}>
            Approvals{pendingApprovals.length > 0 ? ` (${pendingApprovals.length})` : ''}
          </button>
          {canManagePolicies && (
            <button className={tab === 'all-requests' ? 'active' : ''} onClick={() => setTab('all-requests')}>
              All Requests
            </button>
          )}
          {canManagePolicies && (
            <button className={tab === 'balances' ? 'active' : ''} onClick={() => setTab('balances')}>
              Balances
            </button>
          )}
        </div>

        {loading && <p>Loading...</p>}

        {!loading && tab === 'assignments' && (
          <>
            <p className="text-sm text-gray-500 mb-3">
              Which PTO policies apply to each employee. Manage the policies themselves (days per year, accrual,
              etc.) from Settings → PTO Policies.
            </p>
            {ptoPolicies.length === 0 ? (
              <p>No PTO policies defined yet. Add some from Settings → PTO Policies first.</p>
            ) : employees.length === 0 ? (
              <p>No employees yet.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Assigned Policies</th>
                    {canManagePolicies && <th>Add</th>}
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => {
                    const assignedIds = (emp.ptoPolicies || []).map((a: any) => a.ptoPolicyId);
                    const availableToAdd = ptoPolicies.filter((p) => !assignedIds.includes(p.id));
                    return (
                      <tr key={emp.id}>
                        <td>
                          {emp.firstName} {emp.lastName}
                        </td>
                        <td>{emp.department}</td>
                        <td>
                          {(emp.ptoPolicies || []).length === 0 ? (
                            '—'
                          ) : (
                            emp.ptoPolicies.map((a: any) => (
                              <span key={a.id} className="pto-policy-chip">
                                <span
                                  style={{
                                    display: 'inline-block',
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: a.ptoPolicy.color || '#9ca3af',
                                  }}
                                ></span>
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
                            ))
                          )}
                        </td>
                        {canManagePolicies && (
                          <td>
                            {availableToAdd.length > 0 && (
                              <div className="flex items-center gap-1.5">
                                <label htmlFor={`add-policy-${emp.id}`} className="sr-only">
                                  Add policy for {emp.firstName} {emp.lastName}
                                </label>
                                <select
                                  id={`add-policy-${emp.id}`}
                                  className="select-compact"
                                  value={addPolicySelection[emp.id] || ''}
                                  onChange={(e) =>
                                    setAddPolicySelection({ ...addPolicySelection, [emp.id]: e.target.value })
                                  }
                                >
                                  <option value="">-- policy --</option>
                                  {availableToAdd.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="btn-secondary px-2 py-1 text-xs"
                                  disabled={!addPolicySelection[emp.id]}
                                  onClick={() => handleAssign(emp.id)}
                                >
                                  Add
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

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
                            <span
                              style={{
                                display: 'inline-block',
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: bal.color || '#9ca3af',
                              }}
                            ></span>
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
                  <table className="table">
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
              <table className="table">
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
            )}
          </>
        )}

        {!loading && tab === 'all-requests' && canManagePolicies && (
          <>
            {allRequests.length === 0 ? (
              <p>No PTO requests yet.</p>
            ) : (
              <table className="table">
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
            )}
          </>
        )}

        {!loading && tab === 'balances' && canManagePolicies && (
          <>
            {tenantBalances.length === 0 ? (
              <p>No PTO policy assignments yet.</p>
            ) : (
              <table className="table">
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
                        <span
                          style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: bal.color || '#9ca3af',
                            marginRight: 8,
                          }}
                        ></span>
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
            )}
          </>
        )}
      </div>
    </div>
  );
}
