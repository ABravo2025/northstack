import { useState, useEffect } from 'react';
import { api } from '../api';

interface EmployeesPageProps {
  user: any;
  token: string;
}

export default function EmployeesPage({ user, token }: EmployeesPageProps) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeCustomFields, setEmployeeCustomFields] = useState<any[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [editCustomFieldValues, setEditCustomFieldValues] = useState<Record<string, string>>({});
  const [editCustomFieldValueIds, setEditCustomFieldValueIds] = useState<Record<string, string>>({});

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

  const [employeeForm, setEmployeeForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    department: '',
  });

  const [editEmployeeForm, setEditEmployeeForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    department: '',
    status: 'active',
  });

  useEffect(() => {
    loadEmployees();
    loadEmployeeCustomFields();
  }, []);

  const loadEmployeeCustomFields = async () => {
    try {
      const defs = await api.listCustomFieldDefinitions(token, 'employee');
      setEmployeeCustomFields(defs);
    } catch (error) {
      setError('Failed to load custom fields: ' + (error as Error).message);
    }
  };

  const loadEmployees = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listEmployees(token);
      setEmployees(data);
    } catch (error) {
      setError('Failed to load employees: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const employee = await api.createEmployee(token, employeeForm);

      const valueEntries = Object.entries(customFieldValues).filter(([, value]) => value.trim() !== '');
      for (const [customFieldDefinitionId, value] of valueEntries) {
        await api.createEmployeeCustomFieldValue(token, employee.id, {
          customFieldDefinitionId,
          value,
        });
      }

      setEmployeeForm({ firstName: '', lastName: '', email: '', department: '' });
      setCustomFieldValues({});
      setShowEmployeeForm(false);
      loadEmployees();
    } catch (error) {
      setError('Failed to create employee: ' + (error as Error).message);
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
      status: emp.status,
    });

    const values: Record<string, string> = {};
    const valueIds: Record<string, string> = {};
    for (const fieldValue of emp.customFieldVals || []) {
      values[fieldValue.customFieldDefinitionId] = fieldValue.value;
      valueIds[fieldValue.customFieldDefinitionId] = fieldValue.id;
    }
    setEditCustomFieldValues(values);
    setEditCustomFieldValueIds(valueIds);
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployeeId) return;
    setError(null);
    try {
      await api.updateEmployee(token, editingEmployeeId, editEmployeeForm);

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

      setEditingEmployeeId(null);
      setEditCustomFieldValues({});
      setEditCustomFieldValueIds({});
      loadEmployees();
    } catch (error) {
      setError('Failed to update employee: ' + (error as Error).message);
    }
  };

  const handleInviteEmployee = async (employeeId: string) => {
    setError(null);
    setInviteMessage(null);
    try {
      const { invitation } = await api.inviteEmployee(token, employeeId);
      const link = `${window.location.origin}/accept-invite/${invitation.token}`;
      await navigator.clipboard.writeText(link);
      setInviteMessage(`Invite link copied to clipboard: ${link}`);
      loadEmployees();
    } catch (error) {
      setError('Failed to invite employee: ' + (error as Error).message);
    }
  };

  const handleDeleteEmployee = async (employeeId: string) => {
    if (confirm('Are you sure?')) {
      setError(null);
      try {
        await api.deleteEmployee(token, employeeId);
        loadEmployees();
      } catch (error) {
        setError('Failed to delete employee: ' + (error as Error).message);
      }
    }
  };

  const renderCustomFieldInput = (
    field: any,
    values: Record<string, string>,
    setValues: (values: Record<string, string>) => void,
  ) => {
    if (field.fieldType === 'select') {
      return (
        <select
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
        type={inputType}
        value={values[field.id] || ''}
        onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
        required={field.required}
      />
    );
  };

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      {inviteMessage && <div className="alert alert-success">{inviteMessage}</div>}
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
              <label>First Name</label>
              <input
                type="text"
                value={employeeForm.firstName}
                onChange={(e) => setEmployeeForm({ ...employeeForm, firstName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input
                type="text"
                value={employeeForm.lastName}
                onChange={(e) => setEmployeeForm({ ...employeeForm, lastName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={employeeForm.email}
                onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Department</label>
              <input
                type="text"
                value={employeeForm.department}
                onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })}
                required
              />
            </div>

            {activeEmployeeCustomFields.map((field) => (
              <div className="form-group" key={field.id}>
                <label>
                  {field.name}
                  {field.required ? ' *' : ''}
                </label>
                {renderCustomFieldInput(field, customFieldValues, setCustomFieldValues)}
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
              <label>First Name</label>
              <input
                type="text"
                value={editEmployeeForm.firstName}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, firstName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input
                type="text"
                value={editEmployeeForm.lastName}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, lastName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={editEmployeeForm.email}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Department</label>
              <input
                type="text"
                value={editEmployeeForm.department}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, department: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                value={editEmployeeForm.status}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            {activeEmployeeCustomFields.map((field) => (
              <div className="form-group" key={field.id}>
                <label>
                  {field.name}
                  {field.required ? ' *' : ''}
                </label>
                {renderCustomFieldInput(field, editCustomFieldValues, setEditCustomFieldValues)}
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
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {employees.length > 0 && (
          <div className="form-group">
            <input
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
          <p>No employees yet.</p>
        ) : filteredEmployees.length === 0 ? (
          <p>No employees match your search.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Status</th>
                {activeEmployeeCustomFields.map((field) => (
                  <th key={field.id}>{field.name}</th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((emp) => (
                <tr key={emp.id}>
                  <td>
                    {emp.firstName} {emp.lastName}
                  </td>
                  <td>{emp.email}</td>
                  <td>{emp.department}</td>
                  <td>{emp.status}</td>
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
                      onClick={() => handleDeleteEmployee(emp.id)}
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
        )}
      </div>
    </div>
  );
}
