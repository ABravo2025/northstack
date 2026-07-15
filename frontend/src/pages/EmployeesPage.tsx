import { useState, useEffect } from 'react';
import { api } from '../api';
import { useToast } from '../components/ToastProvider';
import ConfirmDialog from '../components/ConfirmDialog';
import Pagination, { paginate } from '../components/Pagination';

const PAGE_SIZE = 20;

interface EmployeesPageProps {
  user: any;
  token: string;
}

export default function EmployeesPage({ user, token }: EmployeesPageProps) {
  const toast = useToast();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<any | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [page, setPage] = useState(1);
  const [employeeCustomFields, setEmployeeCustomFields] = useState<any[]>([]);
  const [employeeStatuses, setEmployeeStatuses] = useState<any[]>([]);
  const [ptoPolicies, setPtoPolicies] = useState<any[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [editCustomFieldValues, setEditCustomFieldValues] = useState<Record<string, string>>({});
  const [editCustomFieldValueIds, setEditCustomFieldValueIds] = useState<Record<string, string>>({});
  const [editAssignedPolicyIds, setEditAssignedPolicyIds] = useState<string[]>([]);
  const [originalAssignedPolicyIds, setOriginalAssignedPolicyIds] = useState<string[]>([]);

  const canManageCustomFields = user.role === 'owner' || user.role === 'admin';
  const activeEmployeeCustomFields = employeeCustomFields.filter((field) => field.isActive);

  const filteredEmployees = employees.filter((emp) => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(query) ||
      emp.email.toLowerCase().includes(query) ||
      emp.department.toLowerCase().includes(query)
    );
  });

  const pageCount = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE));
  const pagedEmployees = paginate(filteredEmployees, page, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [employeeSearch]);

  const [employeeForm, setEmployeeForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    department: '',
    managerId: '',
  });

  const [editEmployeeForm, setEditEmployeeForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    department: '',
    statusId: '',
    managerId: '',
  });

  useEffect(() => {
    loadEmployees();
    loadEmployeeCustomFields();
    loadEmployeeStatuses();
    loadPtoPolicies();
  }, []);

  const loadPtoPolicies = async () => {
    try {
      const policies = await api.listPtoPolicies(token);
      setPtoPolicies(policies.filter((p) => p.isActive));
    } catch (error) {
      toast.error('Failed to load PTO policies: ' + (error as Error).message);
    }
  };

  const loadEmployeeCustomFields = async () => {
    try {
      const defs = await api.listCustomFieldDefinitions(token, 'employee');
      setEmployeeCustomFields(defs);
    } catch (error) {
      toast.error('Failed to load custom fields: ' + (error as Error).message);
    }
  };

  const loadEmployeeStatuses = async () => {
    try {
      const statuses = await api.listStatusDefinitions(token, 'employee');
      setEmployeeStatuses(statuses.filter((s) => s.isActive));
    } catch (error) {
      toast.error('Failed to load statuses: ' + (error as Error).message);
    }
  };

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const data = await api.listEmployees(token);
      setEmployees(data);
    } catch (error) {
      toast.error('Failed to load employees: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const employee = await api.createEmployee(token, {
        ...employeeForm,
        managerId: employeeForm.managerId || null,
      });

      const valueEntries = Object.entries(customFieldValues).filter(([, value]) => value.trim() !== '');
      for (const [customFieldDefinitionId, value] of valueEntries) {
        await api.createEmployeeCustomFieldValue(token, employee.id, {
          customFieldDefinitionId,
          value,
        });
      }

      setEmployeeForm({ firstName: '', lastName: '', email: '', department: '', managerId: '' });
      setCustomFieldValues({});
      setShowEmployeeForm(false);
      toast.success(`${employee.firstName} ${employee.lastName} added.`);
      loadEmployees();
    } catch (error) {
      toast.error('Failed to create employee: ' + (error as Error).message);
    }
  };

  const handleStartEditEmployee = (emp: any) => {
    setShowEmployeeForm(false);
    setEditingEmployeeId(emp.id);
    setEditEmployeeForm({
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      department: emp.department,
      statusId: emp.statusId,
      managerId: emp.managerId || '',
    });

    const values: Record<string, string> = {};
    const valueIds: Record<string, string> = {};
    for (const fieldValue of emp.customFieldVals || []) {
      values[fieldValue.customFieldDefinitionId] = fieldValue.value;
      valueIds[fieldValue.customFieldDefinitionId] = fieldValue.id;
    }
    setEditCustomFieldValues(values);
    setEditCustomFieldValueIds(valueIds);

    const assignedIds = (emp.ptoPolicies || []).map((a: any) => a.ptoPolicyId);
    setEditAssignedPolicyIds(assignedIds);
    setOriginalAssignedPolicyIds(assignedIds);
  };

  const handleTogglePtoPolicy = (policyId: string) => {
    setEditAssignedPolicyIds((current) =>
      current.includes(policyId) ? current.filter((id) => id !== policyId) : [...current, policyId],
    );
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployeeId) return;
    try {
      await api.updateEmployee(token, editingEmployeeId, {
        ...editEmployeeForm,
        managerId: editEmployeeForm.managerId || null,
      });

      for (const field of activeEmployeeCustomFields) {
        const newValue = (editCustomFieldValues[field.id] || '').trim();
        const existingValueId = editCustomFieldValueIds[field.id];

        if (newValue === '' && existingValueId) {
          await api.deleteEmployeeCustomFieldValue(token, editingEmployeeId, existingValueId);
        } else if (newValue !== '' && existingValueId) {
          await api.updateEmployeeCustomFieldValue(token, editingEmployeeId, existingValueId, newValue);
        } else if (newValue !== '' && !existingValueId) {
          await api.createEmployeeCustomFieldValue(token, editingEmployeeId, {
            customFieldDefinitionId: field.id,
            value: newValue,
          });
        }
      }

      const policiesToAssign = editAssignedPolicyIds.filter((id) => !originalAssignedPolicyIds.includes(id));
      const policiesToUnassign = originalAssignedPolicyIds.filter((id) => !editAssignedPolicyIds.includes(id));
      for (const policyId of policiesToAssign) {
        await api.assignPtoPolicyToEmployee(token, editingEmployeeId, policyId);
      }
      for (const policyId of policiesToUnassign) {
        await api.unassignPtoPolicyFromEmployee(token, editingEmployeeId, policyId);
      }

      setEditingEmployeeId(null);
      setEditCustomFieldValues({});
      setEditCustomFieldValueIds({});
      setEditAssignedPolicyIds([]);
      setOriginalAssignedPolicyIds([]);
      toast.success('Employee updated.');
      loadEmployees();
    } catch (error) {
      toast.error('Failed to update employee: ' + (error as Error).message);
    }
  };

  const handleInviteEmployee = async (employeeId: string) => {
    try {
      const { invitation } = await api.inviteEmployee(token, employeeId);
      const link = `${window.location.origin}/accept-invite/${invitation.token}`;
      await navigator.clipboard.writeText(link);
      toast.success('Invite link copied to clipboard.');
      loadEmployees();
    } catch (error) {
      toast.error('Failed to invite employee: ' + (error as Error).message);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!deletingEmployee) return;
    try {
      await api.deleteEmployee(token, deletingEmployee.id);
      toast.success(`${deletingEmployee.firstName} ${deletingEmployee.lastName} deleted.`);
      setDeletingEmployee(null);
      loadEmployees();
    } catch (error) {
      toast.error('Failed to delete employee: ' + (error as Error).message);
      setDeletingEmployee(null);
    }
  };

  const renderCustomFieldInput = (
    field: any,
    values: Record<string, string>,
    setValues: (values: Record<string, string>) => void,
    idPrefix: string,
  ) => {
    const inputId = `${idPrefix}-${field.id}`;
    if (field.fieldType === 'select') {
      return (
        <select
          id={inputId}
          value={values[field.id] || ''}
          onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
          required={field.required}
        >
          <option value="">-- select --</option>
          {(JSON.parse(field.options || '[]') as string[]).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }

    const inputType =
      field.fieldType === 'number'
        ? 'number'
        : field.fieldType === 'date'
          ? 'date'
          : field.fieldType === 'email'
            ? 'email'
            : 'text';

    return (
      <input
        id={inputId}
        type={inputType}
        value={values[field.id] || ''}
        onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
        required={field.required}
      />
    );
  };

  return (
    <div>
      {deletingEmployee && (
        <ConfirmDialog
          title="Delete employee"
          message={`Are you sure you want to delete ${deletingEmployee.firstName} ${deletingEmployee.lastName}? This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteEmployee}
          onCancel={() => setDeletingEmployee(null)}
        />
      )}
      <div className="card">
        <div className="flex items-center justify-between">
          <h3>Employees</h3>
          <button className="btn btn-success" onClick={() => setShowEmployeeForm(!showEmployeeForm)}>
            {showEmployeeForm ? 'Cancel' : 'Add Employee'}
          </button>
        </div>

        {showEmployeeForm && (
          <form onSubmit={handleCreateEmployee} className="mb-5">
            <div className="form-group">
              <label htmlFor="emp-firstName">First Name</label>
              <input
                id="emp-firstName"
                type="text"
                value={employeeForm.firstName}
                onChange={(e) => setEmployeeForm({ ...employeeForm, firstName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="emp-lastName">Last Name</label>
              <input
                id="emp-lastName"
                type="text"
                value={employeeForm.lastName}
                onChange={(e) => setEmployeeForm({ ...employeeForm, lastName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="emp-email">Email</label>
              <input
                id="emp-email"
                type="email"
                value={employeeForm.email}
                onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="emp-department">Department</label>
              <input
                id="emp-department"
                type="text"
                value={employeeForm.department}
                onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="emp-managerId">Reports To</label>
              <select
                id="emp-managerId"
                value={employeeForm.managerId}
                onChange={(e) => setEmployeeForm({ ...employeeForm, managerId: e.target.value })}
              >
                <option value="">-- No manager --</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.firstName} {emp.lastName}
                  </option>
                ))}
              </select>
            </div>

            {activeEmployeeCustomFields.map((field) => (
              <div className="form-group" key={field.id}>
                <label htmlFor={`emp-cf-${field.id}`}>
                  {field.name}
                  {field.required ? ' *' : ''}
                </label>
                {renderCustomFieldInput(field, customFieldValues, setCustomFieldValues, 'emp-cf')}
              </div>
            ))}

            <button type="submit" className="btn btn-primary">
              Create
            </button>
          </form>
        )}

        {editingEmployeeId && (
          <form onSubmit={handleUpdateEmployee} className="mb-5">
            <div className="form-group">
              <label htmlFor="edit-emp-firstName">First Name</label>
              <input
                id="edit-emp-firstName"
                type="text"
                value={editEmployeeForm.firstName}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, firstName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-emp-lastName">Last Name</label>
              <input
                id="edit-emp-lastName"
                type="text"
                value={editEmployeeForm.lastName}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, lastName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-emp-email">Email</label>
              <input
                id="edit-emp-email"
                type="email"
                value={editEmployeeForm.email}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-emp-department">Department</label>
              <input
                id="edit-emp-department"
                type="text"
                value={editEmployeeForm.department}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, department: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-emp-statusId">Status</label>
              <select
                id="edit-emp-statusId"
                value={editEmployeeForm.statusId}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, statusId: e.target.value })}
              >
                {employeeStatuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="edit-emp-managerId">Reports To</label>
              <select
                id="edit-emp-managerId"
                value={editEmployeeForm.managerId}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, managerId: e.target.value })}
              >
                <option value="">-- No manager --</option>
                {employees
                  .filter((emp) => emp.id !== editingEmployeeId)
                  .map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName}
                    </option>
                  ))}
              </select>
            </div>

            {ptoPolicies.length > 0 && (
              <div className="form-group">
                <span>PTO Policies</span>
                {ptoPolicies.map((policy) => (
                  <label
                    key={policy.id}
                    htmlFor={`edit-emp-pto-${policy.id}`}
                    className="mr-3 inline-flex items-center gap-1.5 text-sm font-normal"
                  >
                    <input
                      id={`edit-emp-pto-${policy.id}`}
                      type="checkbox"
                      checked={editAssignedPolicyIds.includes(policy.id)}
                      onChange={() => handleTogglePtoPolicy(policy.id)}
                    />
                    {policy.name}
                  </label>
                ))}
              </div>
            )}

            {activeEmployeeCustomFields.map((field) => (
              <div className="form-group" key={field.id}>
                <label htmlFor={`edit-emp-cf-${field.id}`}>
                  {field.name}
                  {field.required ? ' *' : ''}
                </label>
                {renderCustomFieldInput(field, editCustomFieldValues, setEditCustomFieldValues, 'edit-emp-cf')}
              </div>
            ))}

            <div className="form-actions">
              <button type="submit" className="btn btn-primary">
                Save
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setEditingEmployeeId(null);
                  setEditCustomFieldValues({});
                  setEditCustomFieldValueIds({});
                  setEditAssignedPolicyIds([]);
                  setOriginalAssignedPolicyIds([]);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {employees.length > 0 && (
          <div className="form-group">
            <label htmlFor="employee-search" className="sr-only">
              Search employees
            </label>
            <input
              id="employee-search"
              type="text"
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              placeholder="Search by name, email or department..."
            />
          </div>
        )}

        {loading ? (
          <p>Loading...</p>
        ) : employees.length === 0 ? (
          <div className="empty-state">
            <p>No employees yet.</p>
            <button className="btn btn-success" onClick={() => setShowEmployeeForm(true)}>
              Add your first employee
            </button>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <p>No employees match your search.</p>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Reports To</th>
                  <th>PTO Policies</th>
                  {activeEmployeeCustomFields.map((field) => (
                    <th key={field.id}>{field.name}</th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedEmployees.map((emp) => (
                  <tr key={emp.id}>
                    <td>
                      {emp.firstName} {emp.lastName}
                      {emp.activePtoTag && (
                        <span
                          className="pto-active-tag"
                          style={{ background: emp.activePtoTag.color || '#9ca3af' }}
                          title={`On ${emp.activePtoTag.policyName} today`}
                        >
                          {emp.activePtoTag.policyName}
                        </span>
                      )}
                    </td>
                    <td>{emp.email}</td>
                    <td>{emp.department}</td>
                    <td>{emp.statusDefn?.name}</td>
                    <td>{emp.manager ? `${emp.manager.firstName} ${emp.manager.lastName}` : '—'}</td>
                    <td>
                      {emp.ptoPolicies && emp.ptoPolicies.length > 0
                        ? emp.ptoPolicies.map((a: any) => a.ptoPolicy.name).join(', ')
                        : '—'}
                    </td>
                    {activeEmployeeCustomFields.map((field) => {
                      const fieldValue = emp.customFieldVals?.find(
                        (v: any) => v.customFieldDefinitionId === field.id,
                      );
                      return <td key={field.id}>{fieldValue?.value || '—'}</td>;
                    })}
                    <td>
                      <button
                        className="btn btn-secondary px-2 py-1 text-xs mr-1.5"
                        onClick={() => handleStartEditEmployee(emp)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger px-2 py-1 text-xs mr-1.5"
                        onClick={() => setDeletingEmployee(emp)}
                      >
                        Delete
                      </button>
                      {canManageCustomFields &&
                        (emp.userId ? (
                          <span className="text-xs text-emerald-600">Linked</span>
                        ) : (
                          <button
                            className="btn btn-success px-2 py-1 text-xs"
                            onClick={() => handleInviteEmployee(emp.id)}
                          >
                            Invite
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
