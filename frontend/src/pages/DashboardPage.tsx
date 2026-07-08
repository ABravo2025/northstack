import { useState, useEffect } from 'react';
import { api } from '../api';

interface DashboardPageProps {
  user: any;
  token: string;
  onLogout: () => void;
}

type Tab = 'employees' | 'clients';

export default function DashboardPage({ user, token, onLogout }: DashboardPageProps) {
  const [tab, setTab] = useState<Tab>('employees');
  const [employees, setEmployees] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);

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
    } else {
      loadClients();
    }
  }, [tab]);

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
      await api.createEmployee(token, employeeForm);
      setEmployeeForm({ firstName: '', lastName: '', email: '', department: '' });
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
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployeeId) return;
    setError(null);
    try {
      await api.updateEmployee(token, editingEmployeeId, editEmployeeForm);
      setEditingEmployeeId(null);
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
                  <div className="form-actions">
                    <button type="submit" className="btn btn-primary">
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setEditingEmployeeId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {loading ? (
                <p>Loading...</p>
              ) : employees.length === 0 ? (
                <p>No employees yet.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Department</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr key={emp.id}>
                        <td>
                          {emp.firstName} {emp.lastName}
                        </td>
                        <td>{emp.email}</td>
                        <td>{emp.department}</td>
                        <td>{emp.status}</td>
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
      </div>
    </div>
  );
}
