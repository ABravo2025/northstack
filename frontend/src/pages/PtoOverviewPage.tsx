import { useState, useEffect } from 'react';
import { api } from '../api';

interface PtoOverviewPageProps {
  user: any;
  token: string;
}

export default function PtoOverviewPage({ user, token }: PtoOverviewPageProps) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [ptoPolicies, setPtoPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addPolicySelection, setAddPolicySelection] = useState<Record<string, string>>({});

  const canManagePolicies = user.role === 'owner' || user.role === 'admin';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [employeeData, policyData] = await Promise.all([api.listEmployees(token), api.listPtoPolicies(token)]);
      setEmployees(employeeData);
      setPtoPolicies(policyData.filter((p) => p.isActive));
    } catch (error) {
      setError('Failed to load PTO overview: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async (employeeId: string) => {
    const policyId = addPolicySelection[employeeId];
    if (!policyId) return;
    setError(null);
    try {
      await api.assignPtoPolicyToEmployee(token, employeeId, policyId);
      setAddPolicySelection({ ...addPolicySelection, [employeeId]: '' });
      loadData();
    } catch (error) {
      setError('Failed to assign PTO policy: ' + (error as Error).message);
    }
  };

  const handleUnassign = async (employeeId: string, policyId: string) => {
    setError(null);
    try {
      await api.unassignPtoPolicyFromEmployee(token, employeeId, policyId);
      loadData();
    } catch (error) {
      setError('Failed to remove PTO policy: ' + (error as Error).message);
    }
  };

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card">
        <h3>PTO</h3>
        <p className="text-sm text-gray-500 mb-3">
          Which PTO policies apply to each employee. Manage the policies themselves (days per year, accrual,
          etc.) from Settings → PTO Policies.
        </p>

        {ptoPolicies.length === 0 ? (
          <p>No PTO policies defined yet. Add some from Settings → PTO Policies first.</p>
        ) : loading ? (
          <p>Loading...</p>
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
                            <select
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
      </div>
    </div>
  );
}
