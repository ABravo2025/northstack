import { useState, useEffect } from 'react';
import { api } from '../api';

interface ClientsPageProps {
  token: string;
}

export default function ClientsPage({ token }: ClientsPageProps) {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientForm, setClientForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
  });

  useEffect(() => {
    loadClients();
  }, []);

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
    <div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="card">
        <div className="flex items-center justify-between">
          <h3>Clients</h3>
          <button className="btn btn-success" onClick={() => setShowClientForm(!showClientForm)}>
            {showClientForm ? 'Cancel' : 'Add Client'}
          </button>
        </div>

        {showClientForm && (
          <form onSubmit={handleCreateClient} className="mb-5">
            <div className="form-group">
              <label>First Name</label>
              <input
                type="text"
                value={clientForm.firstName}
                onChange={(e) => setClientForm({ ...clientForm, firstName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input
                type="text"
                value={clientForm.lastName}
                onChange={(e) => setClientForm({ ...clientForm, lastName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={clientForm.email}
                onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Company</label>
              <input
                type="text"
                value={clientForm.company}
                onChange={(e) => setClientForm({ ...clientForm, company: e.target.value })}
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
                      className="btn btn-danger px-2 py-1 text-xs"
                      onClick={() => handleDeleteClient(client.id)}
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
  );
}
