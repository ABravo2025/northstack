import { useState, useEffect } from 'react';
import { api } from '../api';

interface DashboardPageProps {
  user: any;
  token: string;
  onLogout: () => void;
}

type Tab = 'employees' | 'clients' | 'settings';
type Module = 'employee' | 'client';

export default function DashboardPage({ user, token, onLogout }: DashboardPageProps) {
  const [tab, setTab] = useState<Tab>('employees');
  const [employees, setEmployees] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeCustomFields, setEmployeeCustomFields] = useState<any[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [editCustomFieldValues, setEditCustomFieldValues] = useState<Record<string, string>>({});
  const [editCustomFieldValueIds, setEditCustomFieldValueIds] = useState<Record<string, string>>({});

  const [settingsModule, setSettingsModule] = useState<Module>('employee');
  const [settingsCustomFields, setSettingsCustomFields] = useState<any[]>([]);
  const [newCustomField, setNewCustomField] = useState({ name: '', fieldType: 'text', options: '' });

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

  const [clientForm, setClientForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
  });

  useEffect(() => {
    if (tab === 'employees') {
      loadEmployees();
      loadEmployeeCustomFields();
    } else if (tab === 'clients') {
      loadClients();
    } else if (tab === 'settings') {
      loadSettingsCustomFields();
    }
  }, [tab]);

  useEffect(() => {
    if (tab === 'settings') {
      loadSettingsCustomFields();
    }
  }, [settingsModule]);

  const loadEmployeeCustomFields = async () => {
    try {
      const defs = await api.listCustomFieldDefinitions(token, 'employee');
      setEmployeeCustomFields(defs);
    } catch (error) {
      setError('Failed to load custom fields: ' + (error as Error).message);
    }
  };

  const loadSettingsCustomFields = async () => {
    setError(null);
    try {
      const defs = await api.listCustomFieldDefinitions(token, settingsModule);
      setSettingsCustomFields(defs);
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

  const loadClients = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listClients(token);
      setClients(data);
    } catch (error) {
      setError('Failed to load clients: ' + (error as Error).message);
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

  const handleCreateSettingsCustomField = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const options =
        newCustomField.fieldType === 'select'
          ? JSON.stringify(
              newCustomField.options
                .split(',')
                .map((o) => o.trim())
                .filter(Boolean),
            )
          : undefined;

      await api.createCustomFieldDefinition(token, {
        name: newCustomField.name,
        entityType: settingsModule,
        fieldType: newCustomField.fieldType,
        options,
      });
      setNewCustomField({ name: '', fieldType: 'text', options: '' });
      loadSettingsCustomFields();
    } catch (error) {
      setError('Failed to create custom field: ' + (error as Error).message);
    }
  };

  const handleToggleCustomFieldActive = async (field: any) => {
    setError(null);
    try {
      await api.setCustomFieldDefinitionActive(token, field.id, !field.isActive);
      loadSettingsCustomFields();
    } catch (error) {
      setError('Failed to update custom field: ' + (error as Error).message);
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

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.createClient(token, clientForm);
      setClientForm({ firstName: '', lastName: '', email: '', company: '' });
      setShowClientForm(false);
      loadClients();
    } catch (error) {
      setError('Failed to create client: ' + (error as Error).message);
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    if (confirm('Are you sure?')) {
      setError(null);
      try {
        await api.deleteClient(token, clientId);
        loadClients();
      } catch (error) {
        setError('Failed to delete client: ' + (error as Error).message);
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
      />
    );
  };

  return (
    <div className="page">
      <div className="header">
        <div>
          <h1>Northstack Dashboard</h1>
          <p>Welcome, {user.firstName} {user.lastName}</p>
        </div>
        <div>
          <button className="btn btn-secondary" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="container">
        {error && <div className="alert alert-error">{error}</div>}
        <div className="nav" style={{ marginBottom: '20px' }}>
          <button
            className={`${tab === 'employees' ? 'active' : ''}`}
            onClick={() => setTab('employees')}
          >
            Employees ({employees.length})
          </button>
          <button
            className={`${tab === 'clients' ? 'active' : ''}`}
            onClick={() => setTab('clients')}
          >
            Clients ({clients.length})
          </button>
          {canManageCustomFields && (
            <button
              className={`${tab === 'settings' ? 'active' : ''}`}
              onClick={() => setTab('settings')}
            >
              Settings
            </button>
          )}
        </div>

        {tab === 'employees' && (
          <div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Employees</h3>
                <button
                  className="btn btn-success"
                  onClick={() => setShowEmployeeForm(!showEmployeeForm)}
                >
                  {showEmployeeForm ? 'Cancel' : 'Add Employee'}
                </button>
              </div>

              {showEmployeeForm && (
                <form onSubmit={handleCreateEmployee} style={{ marginBottom: '20px' }}>
                  <div className="form-group">
                    <label>First Name</label>
                    <input
                      type="text"
                      value={employeeForm.firstName}
                      onChange={(e) =>
                        setEmployeeForm({ ...employeeForm, firstName: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Last Name</label>
                    <input
                      type="text"
                      value={employeeForm.lastName}
                      onChange={(e) =>
                        setEmployeeForm({ ...employeeForm, lastName: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={employeeForm.email}
                      onChange={(e) =>
                        setEmployeeForm({ ...employeeForm, email: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Department</label>
                    <input
                      type="text"
                      value={employeeForm.department}
                      onChange={(e) =>
                        setEmployeeForm({ ...employeeForm, department: e.target.value })
                      }
                      required
                    />
                  </div>

                  {activeEmployeeCustomFields.map((field) => (
                    <div className="form-group" key={field.id}>
                      <label>{field.name}</label>
                      {renderCustomFieldInput(field, customFieldValues, setCustomFieldValues)}
                    </div>
                  ))}

                  <button type="submit" className="btn btn-primary">
                    Create
                  </button>
                </form>
              )}

              {editingEmployeeId && (
                <form onSubmit={handleUpdateEmployee} style={{ marginBottom: '20px' }}>
                  <div className="form-group">
                    <label>First Name</label>
                    <input
                      type="text"
                      value={editEmployeeForm.firstName}
                      onChange={(e) =>
                        setEditEmployeeForm({ ...editEmployeeForm, firstName: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Last Name</label>
                    <input
                      type="text"
                      value={editEmployeeForm.lastName}
                      onChange={(e) =>
                        setEditEmployeeForm({ ...editEmployeeForm, lastName: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={editEmployeeForm.email}
                      onChange={(e) =>
                        setEditEmployeeForm({ ...editEmployeeForm, email: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Department</label>
                    <input
                      type="text"
                      value={editEmployeeForm.department}
                      onChange={(e) =>
                        setEditEmployeeForm({ ...editEmployeeForm, department: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      value={editEmployeeForm.status}
                      onChange={(e) =>
                        setEditEmployeeForm({ ...editEmployeeForm, status: e.target.value })
                      }
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>

                  {activeEmployeeCustomFields.map((field) => (
                    <div className="form-group" key={field.id}>
                      <label>{field.name}</label>
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
                            className="btn btn-secondary"
                            onClick={() => handleStartEditEmployee(emp)}
                            style={{ padding: '4px 8px', fontSize: '12px', marginRight: '6px' }}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={() => handleDeleteEmployee(emp.id)}
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {tab === 'clients' && (
          <div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Clients</h3>
                <button
                  className="btn btn-success"
                  onClick={() => setShowClientForm(!showClientForm)}
                >
                  {showClientForm ? 'Cancel' : 'Add Client'}
                </button>
              </div>

              {showClientForm && (
                <form onSubmit={handleCreateClient} style={{ marginBottom: '20px' }}>
                  <div className="form-group">
                    <label>First Name</label>
                    <input
                      type="text"
                      value={clientForm.firstName}
                      onChange={(e) =>
                        setClientForm({ ...clientForm, firstName: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Last Name</label>
                    <input
                      type="text"
                      value={clientForm.lastName}
                      onChange={(e) =>
                        setClientForm({ ...clientForm, lastName: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={clientForm.email}
                      onChange={(e) =>
                        setClientForm({ ...clientForm, email: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Company</label>
                    <input
                      type="text"
                      value={clientForm.company}
                      onChange={(e) =>
                        setClientForm({ ...clientForm, company: e.target.value })
                      }
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary">
                    Create
                  </button>
                </form>
              )}

              {loading ? (
                <p>Loading...</p>
              ) : clients.length === 0 ? (
                <p>No clients yet.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Company</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((client) => (
                      <tr key={client.id}>
                        <td>
                          {client.firstName} {client.lastName}
                        </td>
                        <td>{client.email}</td>
                        <td>{client.company}</td>
                        <td>{client.status}</td>
                        <td>
                          <button
                            className="btn btn-danger"
                            onClick={() => handleDeleteClient(client.id)}
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {tab === 'settings' && canManageCustomFields && (
          <div>
            <div className="card">
              <h3>Custom Fields</h3>
              <div className="nav" style={{ marginBottom: '20px' }}>
                <button
                  className={`${settingsModule === 'employee' ? 'active' : ''}`}
                  onClick={() => setSettingsModule('employee')}
                >
                  Employees
                </button>
                <button
                  className={`${settingsModule === 'client' ? 'active' : ''}`}
                  onClick={() => setSettingsModule('client')}
                >
                  Clients
                </button>
              </div>

              {settingsCustomFields.length === 0 ? (
                <p>No custom fields defined for this module yet.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settingsCustomFields.map((field) => (
                      <tr key={field.id}>
                        <td>{field.name}</td>
                        <td>{field.fieldType}</td>
                        <td>{field.isActive ? 'Active' : 'Inactive'}</td>
                        <td>
                          <button
                            className="btn btn-secondary"
                            onClick={() => handleToggleCustomFieldActive(field)}
                            style={{ padding: '4px 8px', fontSize: '12px' }}
                          >
                            {field.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h3 style={{ marginTop: '20px' }}>Add Custom Field</h3>
              <form onSubmit={handleCreateSettingsCustomField}>
                <div className="form-group">
                  <label>Field Name</label>
                  <input
                    type="text"
                    value={newCustomField.name}
                    onChange={(e) => setNewCustomField({ ...newCustomField, name: e.target.value })}
                    placeholder="e.g. Emergency Contact"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Field Type</label>
                  <select
                    value={newCustomField.fieldType}
                    onChange={(e) =>
                      setNewCustomField({ ...newCustomField, fieldType: e.target.value })
                    }
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="email">Email</option>
                    <option value="select">Select (dropdown)</option>
                  </select>
                </div>
                {newCustomField.fieldType === 'select' && (
                  <div className="form-group">
                    <label>Options (comma-separated)</label>
                    <input
                      type="text"
                      value={newCustomField.options}
                      onChange={(e) =>
                        setNewCustomField({ ...newCustomField, options: e.target.value })
                      }
                      placeholder="e.g. Small, Medium, Large"
                    />
                  </div>
                )}
                <button type="submit" className="btn btn-primary">
                  Add Field
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
