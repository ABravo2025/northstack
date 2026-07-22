import { useEffect, useMemo, useState } from 'react';
import { api, type SavedView, type ViewFilter, type ViewSort } from '../api';
import { useToast } from '../components/ToastProvider';
import ConfirmDialog from '../components/ConfirmDialog';
import Pagination, { paginate } from '../components/Pagination';
import SlideOver from '../components/SlideOver';
import ViewsBar from '../components/ViewsBar';
import FilterBar from '../components/FilterBar';
import KanbanBoard from '../components/KanbanBoard';
import CustomFieldColumnMenu from '../components/CustomFieldColumnMenu';
import AddCustomFieldColumn from '../components/AddCustomFieldColumn';
import StatusColumnMenu from '../components/StatusColumnMenu';
import ColumnResizeHandle from '../components/ColumnResizeHandle';
import { useResizableColumns } from '../hooks/useResizableColumns';
import { PencilIcon, PlusIcon, SearchIcon, TrashIcon } from '../components/Icons';
import {
  applyFilters,
  applySort,
  buildClientFields,
  findField,
  groupableFields,
  parseFilters,
  parseSort,
} from '../lib/viewFields';

const PAGE_SIZE = 20;
const ACTIVE_VIEW_STORAGE_KEY = 'northstack:activeView:client';

interface ClientsPageProps {
  user: any;
  token: string;
}

export default function ClientsPage({ user, token }: ClientsPageProps) {
  const toast = useToast();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [slideOverMode, setSlideOverMode] = useState<'add' | 'edit' | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [deletingClient, setDeletingClient] = useState<any | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [page, setPage] = useState(1);
  const [clientCustomFields, setClientCustomFields] = useState<any[]>([]);
  const [clientStatuses, setClientStatuses] = useState<any[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [editCustomFieldValues, setEditCustomFieldValues] = useState<Record<string, string>>({});
  const [editCustomFieldValueIds, setEditCustomFieldValueIds] = useState<Record<string, string>>({});

  const [views, setViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY),
  );
  const [viewFilters, setViewFilters] = useState<ViewFilter[]>([]);
  const [viewSort, setViewSort] = useState<ViewSort | null>(null);

  const canManageCustomFields = user.role === 'owner' || user.role === 'admin';
  const canEditClients = user.role === 'owner' || user.role === 'admin';
  const { getWidth: getColumnWidth, startResize } = useResizableColumns('northstack:columnWidths:client');
  const activeClientCustomFields = clientCustomFields.filter((field) => field.isActive);
  const activeClientStatuses = clientStatuses.filter((s) => s.isActive);

  const fields = useMemo(
    () => buildClientFields(clientStatuses, clientCustomFields),
    [clientStatuses, clientCustomFields],
  );
  const groupable = useMemo(() => groupableFields(fields), [fields]);

  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  const viewType = activeView?.type ?? 'grid';

  useEffect(() => {
    setViewFilters(parseFilters(activeView?.filters ?? null));
    setViewSort(parseSort(activeView?.sortBy ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeViewId, views]);

  useEffect(() => {
    if (activeViewId) {
      localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, activeViewId);
    } else {
      localStorage.removeItem(ACTIVE_VIEW_STORAGE_KEY);
    }
  }, [activeViewId]);

  const searchFilteredClients = clients.filter((client) => {
    const query = clientSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      `${client.firstName} ${client.lastName}`.toLowerCase().includes(query) ||
      client.email.toLowerCase().includes(query) ||
      client.company.toLowerCase().includes(query)
    );
  });

  const viewFilteredClients = applyFilters(searchFilteredClients, fields, viewFilters);
  const sortedClients = applySort(viewFilteredClients, fields, viewSort);

  const pageCount = Math.max(1, Math.ceil(sortedClients.length / PAGE_SIZE));
  const pagedClients = paginate(sortedClients, page, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [clientSearch, activeViewId]);

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
    loadViews();
  }, []);

  const loadViews = async () => {
    try {
      const data = await api.listViews(token, 'client');
      setViews(data);
    } catch (error) {
      toast.error('Failed to load views: ' + (error as Error).message);
    }
  };

  const loadClientCustomFields = async () => {
    try {
      const defs = await api.listCustomFieldDefinitions(token, 'client');
      setClientCustomFields(defs);
    } catch (error) {
      toast.error('Failed to load custom fields: ' + (error as Error).message);
    }
  };

  const handleCreateCustomFieldColumn = async (input: {
    name: string;
    fieldType: string;
    options?: string;
    required: boolean;
  }) => {
    try {
      await api.createCustomFieldDefinition(token, { ...input, entityType: 'client' });
      toast.success(`Field "${input.name}" added.`);
      loadClientCustomFields();
    } catch (error) {
      toast.error('Failed to add field: ' + (error as Error).message);
    }
  };

  const handleUpdateCustomFieldColumn = async (
    id: string,
    data: { name?: string; required?: boolean; options?: string },
  ) => {
    try {
      await api.updateCustomFieldDefinition(token, id, data);
      toast.success('Field updated.');
      loadClientCustomFields();
    } catch (error) {
      toast.error('Failed to update field: ' + (error as Error).message);
    }
  };

  const handleDeactivateCustomFieldColumn = async (id: string) => {
    try {
      await api.updateCustomFieldDefinition(token, id, { isActive: false });
      toast.success('Field deleted.');
      loadClientCustomFields();
    } catch (error) {
      toast.error('Failed to delete field: ' + (error as Error).message);
    }
  };

  const loadClientStatuses = async () => {
    try {
      const statuses = await api.listStatusDefinitions(token, 'client');
      setClientStatuses(statuses);
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

  const closeSlideOver = () => {
    setSlideOverMode(null);
    setEditingClientId(null);
    setCustomFieldValues({});
    setEditCustomFieldValues({});
    setEditCustomFieldValueIds({});
  };

  const handleOpenAdd = () => {
    setClientForm({ firstName: '', lastName: '', email: '', company: '' });
    setCustomFieldValues({});
    setSlideOverMode('add');
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

      toast.success(`${client.firstName} ${client.lastName} added.`);
      closeSlideOver();
      loadClients();
    } catch (error) {
      toast.error('Failed to create client: ' + (error as Error).message);
    }
  };

  const handleStartEditClient = (client: any) => {
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
    setSlideOverMode('edit');
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

      toast.success('Client updated.');
      closeSlideOver();
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

  const handleSort = (fieldKey: string) => {
    setViewSort((current) => {
      if (current?.field === fieldKey) {
        return { field: fieldKey, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { field: fieldKey, direction: 'asc' };
    });
  };

  const handleKanbanMove = async (client: any, newValue: string) => {
    const groupField = activeView?.groupByField;
    if (!groupField) return;
    try {
      if (groupField === 'status') {
        const status = clientStatuses.find((s) => s.name === newValue);
        if (!status) return;
        await api.updateClient(token, client.id, { statusId: status.id });
      } else if (groupField.startsWith('cf:')) {
        const definitionId = groupField.slice(3);
        const existing = client.customFieldVals?.find((v: any) => v.customFieldDefinitionId === definitionId);
        if (existing) {
          await api.updateClientCustomFieldValue(token, client.id, existing.id, newValue);
        } else {
          await api.createClientCustomFieldValue(token, client.id, {
            customFieldDefinitionId: definitionId,
            value: newValue,
          });
        }
      }
      loadClients();
    } catch (error) {
      toast.error('Failed to move: ' + (error as Error).message);
    }
  };

  const handleCreateView = async (input: {
    name: string;
    type: 'grid' | 'kanban';
    visibility: 'personal' | 'shared';
    groupByField?: string;
  }) => {
    try {
      const view = await api.createView(token, {
        entityType: 'client',
        name: input.name,
        type: input.type,
        visibility: input.visibility,
        groupByField: input.groupByField,
      });
      setViews((current) => [...current, view]);
      setActiveViewId(view.id);
      toast.success(`View "${view.name}" created.`);
    } catch (error) {
      toast.error('Failed to create view: ' + (error as Error).message);
    }
  };

  const handleRenameView = async (id: string, name: string) => {
    try {
      const updated = await api.updateView(token, id, { name });
      setViews((current) => current.map((v) => (v.id === id ? updated : v)));
    } catch (error) {
      toast.error('Failed to rename view: ' + (error as Error).message);
    }
  };

  const handleDuplicateView = async (view: SavedView) => {
    try {
      const created = await api.createView(token, {
        entityType: 'client',
        name: `${view.name} (copy)`,
        type: view.type,
        visibility: 'personal',
        filters: parseFilters(view.filters),
        sortBy: parseSort(view.sortBy) ?? undefined,
        groupByField: view.groupByField ?? undefined,
      });
      setViews((current) => [...current, created]);
      setActiveViewId(created.id);
      toast.success(`View duplicated as "${created.name}".`);
    } catch (error) {
      toast.error('Failed to duplicate view: ' + (error as Error).message);
    }
  };

  const handleDeleteView = async (id: string) => {
    try {
      await api.deleteView(token, id);
      setViews((current) => current.filter((v) => v.id !== id));
      if (activeViewId === id) setActiveViewId(null);
      toast.success('View deleted.');
    } catch (error) {
      toast.error('Failed to delete view: ' + (error as Error).message);
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

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'company', label: 'Company' },
    { key: 'status', label: 'Status' },
  ];

  const groupFieldForKanban = activeView?.groupByField ? findField(fields, activeView.groupByField) : undefined;

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

      <SlideOver
        open={slideOverMode !== null}
        title={slideOverMode === 'edit' ? 'Edit Client' : 'Add Client'}
        onClose={closeSlideOver}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeSlideOver}>
              Cancel
            </button>
            <button type="submit" form="client-form" className="btn-primary">
              {slideOverMode === 'edit' ? 'Save' : 'Create'}
            </button>
          </>
        }
      >
        {slideOverMode === 'add' && (
          <form id="client-form" onSubmit={handleCreateClient}>
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
          </form>
        )}

        {slideOverMode === 'edit' && (
          <form id="client-form" onSubmit={handleUpdateClient}>
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
                {activeClientStatuses.map((status) => (
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
          </form>
        )}
      </SlideOver>

      <ViewsBar
        allLabel="All Clients"
        views={views}
        activeViewId={activeViewId}
        onSelectView={setActiveViewId}
        canCreateShared={canManageCustomFields}
        canDeleteShared={(view) => view.createdByUserId === user.id || user.role === 'owner'}
        groupableFields={groupable}
        onCreateView={handleCreateView}
        onRenameView={handleRenameView}
        onDuplicateView={handleDuplicateView}
        onDeleteView={handleDeleteView}
      />

      <div className="page-toolbar">
        <h2>Clients</h2>
        {clients.length > 0 && (
          <div className="toolbar-search">
            <SearchIcon />
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
        {viewType === 'grid' && <FilterBar fields={fields} filters={viewFilters} onChange={setViewFilters} />}
        <button className="btn-primary" onClick={handleOpenAdd}>
          <span className="inline-flex items-center gap-1.5">
            <PlusIcon className="h-4 w-4" />
            Add Client
          </span>
        </button>
      </div>

      {loading ? (
        <p className="mt-4">Loading...</p>
      ) : clients.length === 0 ? (
        <div className="empty-state">
          <p>No clients yet.</p>
          <button className="btn btn-success" onClick={handleOpenAdd}>
            Add your first client
          </button>
        </div>
      ) : viewType === 'kanban' ? (
        !groupFieldForKanban ? (
          <p className="mt-4">This view's group-by field no longer exists.</p>
        ) : (
          <KanbanBoard
            columns={
              groupFieldForKanban.selectOptions?.map((opt) => ({
                key: opt.value,
                label: opt.value,
                color: opt.color,
              })) ?? []
            }
            items={viewFilteredClients}
            getItemKey={(client) => client.id}
            getItemColumn={(client) => groupFieldForKanban.getValue(client)}
            onMove={canEditClients ? handleKanbanMove : () => {}}
            renderCard={(client) => (
              <>
                <div className="kc-name">
                  {client.firstName} {client.lastName}
                </div>
                <div className="kc-meta">{client.company}</div>
              </>
            )}
          />
        )
      ) : sortedClients.length === 0 ? (
        <p className="mt-4">No clients match your search or filters.</p>
      ) : (
        <>
          <div className="full-table-wrap">
            <table className="table full-table">
              <colgroup>
                {columns.map((col) => (
                  <col key={col.key} style={{ width: getColumnWidth(col.key) }} />
                ))}
                {activeClientCustomFields.map((field) => (
                  <col key={field.id} style={{ width: getColumnWidth(`cf:${field.id}`) }} />
                ))}
                {canManageCustomFields && <col style={{ width: 40 }} />}
                <col style={{ width: 90 }} />
              </colgroup>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`sortable ${viewSort?.field === col.key ? 'sorted' : ''}`}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      <span className="sort-arrow">{viewSort?.field === col.key && viewSort.direction === 'desc' ? '▴' : '▾'}</span>
                      {col.key === 'status' && canManageCustomFields && (
                        <StatusColumnMenu
                          token={token}
                          entityType="client"
                          statuses={clientStatuses}
                          onChanged={loadClientStatuses}
                        />
                      )}
                      <ColumnResizeHandle onMouseDown={(e) => startResize(col.key, e)} />
                    </th>
                  ))}
                  {activeClientCustomFields.map((field) => (
                    <th
                      key={field.id}
                      className={`sortable ${viewSort?.field === `cf:${field.id}` ? 'sorted' : ''}`}
                      onClick={() => handleSort(`cf:${field.id}`)}
                    >
                      {field.name}
                      <span className="sort-arrow">
                        {viewSort?.field === `cf:${field.id}` && viewSort.direction === 'desc' ? '▴' : '▾'}
                      </span>
                      {canManageCustomFields && (
                        <CustomFieldColumnMenu
                          field={field}
                          onUpdate={handleUpdateCustomFieldColumn}
                          onDeactivate={handleDeactivateCustomFieldColumn}
                        />
                      )}
                      <ColumnResizeHandle onMouseDown={(e) => startResize(`cf:${field.id}`, e)} />
                    </th>
                  ))}
                  {canManageCustomFields && (
                    <th className="col-add-header">
                      <AddCustomFieldColumn onCreate={handleCreateCustomFieldColumn} />
                    </th>
                  )}
                  <th></th>
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
                    {canManageCustomFields && <td></td>}
                    <td>
                      <div className="icon-actions">
                        <button className="icon-btn" onClick={() => handleStartEditClient(client)}>
                          <span className="tip">Edit</span>
                          <PencilIcon />
                        </button>
                        <button className="icon-btn danger" onClick={() => setDeletingClient(client)}>
                          <span className="tip">Delete</span>
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
