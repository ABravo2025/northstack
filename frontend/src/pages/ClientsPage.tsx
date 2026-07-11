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
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientCustomFields, setClientCustomFields] = useState<any[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [editCustomFieldValues, setEditCustomFieldValues] = useState<Record<string, string>>({});
  const [editCustomFieldValueIds, setEditCustomFieldValueIds] = useState<Record<string, string>>({});

  const activeClientCustomFields = clientCustomFields.filter((field) => field.isActive);

  const filteredClients = clients.filter((client) => {
    const query = clientSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      `${client.firstName} ${client.lastName}`.toLowerCase().includes(query) ||
      client.email.toLowerCase().includes(query) ||
      client.company.toLowerCase().includes(query)
    );
  });

  const [clientForm, setClientForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
  });

  const [editClientForm, setEditClientForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    status: 'prospect',
  });

  useEffect(() => {
    loadClients();
    loadClientCustomFields();
  }, []);

  const loadClientCustomFields = async () => {
    try {
      const defs = await api.listCustomFieldDefinitions(token, 'client');
      setClientCustomFields(defs);
    } catch (error) {
      setError('Failed to load custom fields: ' + (error as Error).message);
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

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const client = await api.createClient(token, clientForm);

      const valueEntries = Object.entries(customFieldValues).filter(([, value]) => value.trim() !== '');
      for (const [customFieldDefinitionId, value] of valueEntries) {
        await api.createClientCustomFieldValue(token, client.id, {
          customFieldDefinitionId,
          value,
        });
      }

      setClientForm({ firstName: '', lastName: '', email: '', company: '' });
      setCustomFieldValues({});
      setShowClientForm(false);
      loadClients();
    } catch (error) {
      setError('Failed to create client: ' + (error as Error).message);
    }
  };

  const handleStartEditClient = (client: any) => {
    setShowClientForm(false);
    setEditingClientId(client.id);
    setEditClientForm({
      firstName: client.firstName,
      lastName: client.lastName,
      email: client.email,
      company: client.company,
      status: client.status,
    });

    const values: Record<string, string> = {};
    const valueIds: Record<string, string> = {};
    for (const fieldValue of client.customFieldVals || []) {
      values[fieldValue.customFieldDefinitionId] = fieldValue.value;
      valueIds[fieldValue.customFieldDefinitionId] = fieldValue.id;
    }
    setEditCustomFieldValues(values);
    setEditCustomFieldValueIds(valueIds);
  };

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClientId) return;
    setError(null);
    try {
      await api.updateClient(token, editingClientId, editClientForm);

      for (const field of activeClientCustomFields) {
        const newValue = (editCustomFieldValues[field.id] || '').trim();
        const existingValueId = editCustomFieldValueIds[field.id];

        if (newValue === '' && existingValueId) {
          await api.deleteClientCustomFieldValue(token, editingClientId, existingValueId);
        } else if (newValue !== '' && existingValueId) {
          await api.updateClientCustomFieldValue(token, editingClientId, existingValueId, newValue);
        } else if (newValue !== '' && !existingValueId) {
          await api.createClientCustomFieldValue(token, editingClientId, {
            customFieldDefinitionId: field.id,
            value: newValue,
          });
        }
      }

      setEditingClientId(null);
      setEditCustomFieldValues({});
      setEditCustomFieldValueIds({});
      loadClients();
    } catch (error) {
      setError('Failed to update client: ' + (error as Error).message);
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

            {activeClientCustomFields.map((field) => (
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

        {editingClientId && (
          <form onSubmit={handleUpdateClient} className="mb-5">
            <div className="form-group">
              <label>First Name</label>
              <input
                type="text"
                value={editClientForm.firstName}
                onChange={(e) => setEditClientForm({ ...editClientForm, firstName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input
                type="text"
                value={editClientForm.lastName}
                onChange={(e) => setEditClientForm({ ...editClientForm, lastName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={editClientForm.email}
                onChange={(e) => setEditClientForm({ ...editClientForm, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Company</label>
              <input
                type="text"
                value={editClientForm.company}
                onChange={(e) => setEditClientForm({ ...editClientForm, company: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select
                value={editClientForm.status}
                onChange={(e) => setEditClientForm({ ...editClientForm, status: e.target.value })}
              >
                <option value="prospect">Prospect</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="inactive_archived">Archived</option>
              </select>
            </div>

            {activeClientCustomFields.map((field) => (
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
                  setEditingClientId(null);
                  setEditCustomFieldValues({});
                  setEditCustomFieldValueIds({});
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {clients.length > 0 && (
          <div className="form-group">
            <input
              type="text"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Search by name, email or company..."
            />
          </div>
        )}

        {loading ? (
          <p>Loading...</p>
        ) : clients.length === 0 ? (
          <p>No clients yet.</p>
        ) : filteredClients.length === 0 ? (
          <p>No clients match your search.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Company</th>
                <th>Status</th>
                {activeClientCustomFields.map((field) => (
                  <th key={field.id}>{field.name}</th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => (
                <tr key={client.id}>
                  <td>
                    {client.firstName} {client.lastName}
                  </td>
                  <td>{client.email}</td>
                  <td>{client.company}</td>
                  <td>{client.status}</td>
                  {activeClientCustomFields.map((field) => {
                    const fieldValue = client.customFieldVals?.find(
                      (v: any) => v.customFieldDefinitionId === field.id,
                    );
                    return <td key={field.id}>{fieldValue?.value || '—'}</td>;
                  })}
                  <td>
                    <button
                      className="btn btn-secondary px-2 py-1 text-xs mr-1.5"
                      onClick={() => handleStartEditClient(client)}
                    >
                      Edit
                    </button>
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
