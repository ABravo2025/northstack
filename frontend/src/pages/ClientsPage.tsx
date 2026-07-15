import { useState, useEffect } from 'react';
import { api } from '../api';
import { useToast } from '../components/ToastProvider';
import ConfirmDialog from '../components/ConfirmDialog';
import Pagination, { paginate } from '../components/Pagination';

const PAGE_SIZE = 20;

interface ClientsPageProps {
  token: string;
}

export default function ClientsPage({ token }: ClientsPageProps) {
  const toast = useToast();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [deletingClient, setDeletingClient] = useState<any | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [page, setPage] = useState(1);
  const [clientCustomFields, setClientCustomFields] = useState<any[]>([]);
  const [clientStatuses, setClientStatuses] = useState<any[]>([]);
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

  const pageCount = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));
  const pagedClients = paginate(filteredClients, page, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [clientSearch]);

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
    statusId: '',
  });

  useEffect(() => {
    loadClients();
    loadClientCustomFields();
    loadClientStatuses();
  }, []);

  const loadClientCustomFields = async () => {
    try {
      const defs = await api.listCustomFieldDefinitions(token, 'client');
      setClientCustomFields(defs);
    } catch (error) {
      toast.error('Failed to load custom fields: ' + (error as Error).message);
    }
  };

  const loadClientStatuses = async () => {
    try {
      const statuses = await api.listStatusDefinitions(token, 'client');
      setClientStatuses(statuses.filter((s) => s.isActive));
    } catch (error) {
      toast.error('Failed to load statuses: ' + (error as Error).message);
    }
  };

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await api.listClients(token);
      setClients(data);
    } catch (error) {
      toast.error('Failed to load clients: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
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
      toast.success(`${client.firstName} ${client.lastName} added.`);
      loadClients();
    } catch (error) {
      toast.error('Failed to create client: ' + (error as Error).message);
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
      statusId: client.statusId,
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
      toast.success('Client updated.');
      loadClients();
    } catch (error) {
      toast.error('Failed to update client: ' + (error as Error).message);
    }
  };

  const handleDeleteClient = async () => {
    if (!deletingClient) return;
    try {
      await api.deleteClient(token, deletingClient.id);
      toast.success(`${deletingClient.firstName} ${deletingClient.lastName} deleted.`);
      setDeletingClient(null);
      loadClients();
    } catch (error) {
      toast.error('Failed to delete client: ' + (error as Error).message);
      setDeletingClient(null);
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
      {deletingClient && (
        <ConfirmDialog
          title="Delete client"
          message={`Are you sure you want to delete ${deletingClient.firstName} ${deletingClient.lastName}? This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteClient}
          onCancel={() => setDeletingClient(null)}
        />
      )}
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
              <label htmlFor="client-firstName">First Name</label>
              <input
                id="client-firstName"
                type="text"
                value={clientForm.firstName}
                onChange={(e) => setClientForm({ ...clientForm, firstName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="client-lastName">Last Name</label>
              <input
                id="client-lastName"
                type="text"
                value={clientForm.lastName}
                onChange={(e) => setClientForm({ ...clientForm, lastName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="client-email">Email</label>
              <input
                id="client-email"
                type="email"
                value={clientForm.email}
                onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="client-company">Company</label>
              <input
                id="client-company"
                type="text"
                value={clientForm.company}
                onChange={(e) => setClientForm({ ...clientForm, company: e.target.value })}
                required
              />
            </div>

            {activeClientCustomFields.map((field) => (
              <div className="form-group" key={field.id}>
                <label htmlFor={`client-cf-${field.id}`}>
                  {field.name}
                  {field.required ? ' *' : ''}
                </label>
                {renderCustomFieldInput(field, customFieldValues, setCustomFieldValues, 'client-cf')}
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
              <label htmlFor="edit-client-firstName">First Name</label>
              <input
                id="edit-client-firstName"
                type="text"
                value={editClientForm.firstName}
                onChange={(e) => setEditClientForm({ ...editClientForm, firstName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-client-lastName">Last Name</label>
              <input
                id="edit-client-lastName"
                type="text"
                value={editClientForm.lastName}
                onChange={(e) => setEditClientForm({ ...editClientForm, lastName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-client-email">Email</label>
              <input
                id="edit-client-email"
                type="email"
                value={editClientForm.email}
                onChange={(e) => setEditClientForm({ ...editClientForm, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-client-company">Company</label>
              <input
                id="edit-client-company"
                type="text"
                value={editClientForm.company}
                onChange={(e) => setEditClientForm({ ...editClientForm, company: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-client-statusId">Status</label>
              <select
                id="edit-client-statusId"
                value={editClientForm.statusId}
                onChange={(e) => setEditClientForm({ ...editClientForm, statusId: e.target.value })}
              >
                {clientStatuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
            </div>

            {activeClientCustomFields.map((field) => (
              <div className="form-group" key={field.id}>
                <label htmlFor={`edit-client-cf-${field.id}`}>
                  {field.name}
                  {field.required ? ' *' : ''}
                </label>
                {renderCustomFieldInput(field, editCustomFieldValues, setEditCustomFieldValues, 'edit-client-cf')}
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
            <label htmlFor="client-search" className="sr-only">
              Search clients
            </label>
            <input
              id="client-search"
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
          <div className="empty-state">
            <p>No clients yet.</p>
            <button className="btn btn-success" onClick={() => setShowClientForm(true)}>
              Add your first client
            </button>
          </div>
        ) : filteredClients.length === 0 ? (
          <p>No clients match your search.</p>
        ) : (
          <>
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
                {pagedClients.map((client) => (
                  <tr key={client.id}>
                    <td>
                      {client.firstName} {client.lastName}
                    </td>
                    <td>{client.email}</td>
                    <td>{client.company}</td>
                    <td>{client.statusDefn?.name}</td>
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
                        onClick={() => setDeletingClient(client)}
                      >
                        Delete
                      </button>
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
