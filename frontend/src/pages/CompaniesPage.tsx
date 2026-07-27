import { useEffect, useState } from 'react';
import { api, type Company } from '../api';
import { useToast } from '../components/ToastProvider';
import ConfirmDialog from '../components/ConfirmDialog';
import Pagination, { paginate } from '../components/Pagination';
import SlideOver from '../components/SlideOver';
import CustomFieldColumnMenu from '../components/CustomFieldColumnMenu';
import AddCustomFieldColumn from '../components/AddCustomFieldColumn';
import ColumnResizeHandle from '../components/ColumnResizeHandle';
import { useResizableColumns } from '../hooks/useResizableColumns';
import ColumnVisibilityMenu from '../components/ColumnVisibilityMenu';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { useColumnOrder } from '../hooks/useColumnOrder';
import Avatar from '../components/Avatar';
import StatusChip from '../components/StatusChip';
import { PencilIcon, PlusIcon, SearchIcon, TrashIcon } from '../components/Icons';

const PAGE_SIZE = 20;
// Frozen columns stay pinned to the left through horizontal scroll and can't
// be dragged to reorder — everything else can. Same pattern as Employees/Clients.
const FROZEN_COLUMN_KEYS = ['name', 'status'];

interface CompaniesPageProps {
  user: any;
  token: string;
}

const emptyCompanyForm = {
  name: '',
  industry: '',
  website: '',
  phone: '',
  billingAddress: '',
  size: '',
  accountOwnerId: '',
};

export default function CompaniesPage({ user, token }: CompaniesPageProps) {
  const toast = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [tenantUsers, setTenantUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [slideOverMode, setSlideOverMode] = useState<'add' | 'edit' | null>(null);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [companyCustomFields, setCompanyCustomFields] = useState<any[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [editCustomFieldValues, setEditCustomFieldValues] = useState<Record<string, string>>({});
  const [editCustomFieldValueIds, setEditCustomFieldValueIds] = useState<Record<string, string>>({});
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const [editCompanyForm, setEditCompanyForm] = useState(emptyCompanyForm);
  const [draggedColKey, setDraggedColKey] = useState<string | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);

  const canManageCustomFields = user.role === 'owner' || user.role === 'admin';
  const canEditCompanies = user.role === 'owner' || user.role === 'admin';
  const { getWidth: getColumnWidth, startResize } = useResizableColumns('northstack:columnWidths:company');
  const { isHidden: isColumnHidden, toggle: toggleColumn, hide: hideColumn } = useColumnVisibility(
    'northstack:hiddenColumns:company',
  );
  const activeCompanyCustomFields = companyCustomFields.filter((field) => field.isActive);

  useEffect(() => {
    loadCompanies();
    loadCompanyCustomFields();
    api
      .listTenantUsers(token)
      .then(setTenantUsers)
      .catch(() => {
        // Non-critical — the account owner dropdown just falls back to empty if it fails.
      });
  }, []);

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const data = await api.listCompanies(token);
      setCompanies(data);
    } catch (error) {
      toast.error('Failed to load companies: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadCompanyCustomFields = async () => {
    try {
      const defs = await api.listCustomFieldDefinitions(token, 'company');
      setCompanyCustomFields(defs);
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
      await api.createCustomFieldDefinition(token, { ...input, entityType: 'company' });
      toast.success(`Field "${input.name}" added.`);
      loadCompanyCustomFields();
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
      loadCompanyCustomFields();
    } catch (error) {
      toast.error('Failed to update field: ' + (error as Error).message);
    }
  };

  const handleDeactivateCustomFieldColumn = async (id: string) => {
    try {
      await api.updateCustomFieldDefinition(token, id, { isActive: false });
      toast.success('Field deleted.');
      loadCompanyCustomFields();
    } catch (error) {
      toast.error('Failed to delete field: ' + (error as Error).message);
    }
  };

  const closeSlideOver = () => {
    setSlideOverMode(null);
    setEditingCompanyId(null);
    setCustomFieldValues({});
    setEditCustomFieldValues({});
    setEditCustomFieldValueIds({});
  };

  const handleOpenAdd = () => {
    setCompanyForm(emptyCompanyForm);
    setCustomFieldValues({});
    setSlideOverMode('add');
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const company = await api.createCompany(token, {
        name: companyForm.name,
        industry: companyForm.industry || undefined,
        website: companyForm.website || undefined,
        phone: companyForm.phone || undefined,
        billingAddress: companyForm.billingAddress || undefined,
        size: companyForm.size || undefined,
        accountOwnerId: companyForm.accountOwnerId || undefined,
      });

      const valueEntries = Object.entries(customFieldValues).filter(([, value]) => value.trim() !== '');
      for (const [customFieldDefinitionId, value] of valueEntries) {
        await api.createCompanyCustomFieldValue(token, company.id, { customFieldDefinitionId, value });
      }

      toast.success(`${company.name} added.`);
      closeSlideOver();
      loadCompanies();
    } catch (error) {
      toast.error('Failed to create company: ' + (error as Error).message);
    }
  };

  const handleStartEditCompany = (company: Company) => {
    setEditingCompanyId(company.id);
    setEditCompanyForm({
      name: company.name,
      industry: company.industry || '',
      website: company.website || '',
      phone: company.phone || '',
      billingAddress: company.billingAddress || '',
      size: company.size || '',
      accountOwnerId: company.accountOwnerId || '',
    });

    const values: Record<string, string> = {};
    const valueIds: Record<string, string> = {};
    for (const fieldValue of company.customFieldVals || []) {
      values[fieldValue.customFieldDefinitionId] = fieldValue.value;
      valueIds[fieldValue.customFieldDefinitionId] = fieldValue.id;
    }
    setEditCustomFieldValues(values);
    setEditCustomFieldValueIds(valueIds);
    setSlideOverMode('edit');
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompanyId) return;
    try {
      await api.updateCompany(token, editingCompanyId, {
        name: editCompanyForm.name,
        industry: editCompanyForm.industry || null,
        website: editCompanyForm.website || null,
        phone: editCompanyForm.phone || null,
        billingAddress: editCompanyForm.billingAddress || null,
        size: editCompanyForm.size || null,
        accountOwnerId: editCompanyForm.accountOwnerId || null,
      });

      for (const field of activeCompanyCustomFields) {
        const newValue = (editCustomFieldValues[field.id] || '').trim();
        const existingValueId = editCustomFieldValueIds[field.id];

        if (newValue === '' && existingValueId) {
          await api.deleteCompanyCustomFieldValue(token, editingCompanyId, existingValueId);
        } else if (newValue !== '' && existingValueId) {
          await api.updateCompanyCustomFieldValue(token, editingCompanyId, existingValueId, newValue);
        } else if (newValue !== '' && !existingValueId) {
          await api.createCompanyCustomFieldValue(token, editingCompanyId, {
            customFieldDefinitionId: field.id,
            value: newValue,
          });
        }
      }

      toast.success('Company updated.');
      closeSlideOver();
      loadCompanies();
    } catch (error) {
      toast.error('Failed to update company: ' + (error as Error).message);
    }
  };

  const handleDeleteCompany = async () => {
    if (!deletingCompany) return;
    try {
      await api.deleteCompany(token, deletingCompany.id);
      toast.success(`${deletingCompany.name} deleted.`);
      setDeletingCompany(null);
      loadCompanies();
    } catch (error) {
      toast.error('Failed to delete company: ' + (error as Error).message);
      setDeletingCompany(null);
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

  const searchFilteredCompanies = companies.filter((company) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      company.name.toLowerCase().includes(query) ||
      (company.industry ?? '').toLowerCase().includes(query) ||
      (company.website ?? '').toLowerCase().includes(query)
    );
  });

  const pageCount = Math.max(1, Math.ceil(searchFilteredCompanies.length / PAGE_SIZE));
  const pagedCompanies = paginate(searchFilteredCompanies, page, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (company: Company) => (
        <div className="name-cell">
          <Avatar firstName={company.name} lastName="" />
          {company.name}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (company: Company) =>
        company.statusDefn && <StatusChip color={company.statusDefn.color || '#6b7280'} label={company.statusDefn.name} />,
    },
    { key: 'industry', label: 'Industry', render: (company: Company) => company.industry || '—' },
    {
      key: 'website',
      label: 'Website',
      render: (company: Company) =>
        company.website ? (
          <a href={company.website} target="_blank" rel="noopener noreferrer" className="table-link">
            {company.website}
          </a>
        ) : (
          '—'
        ),
    },
    { key: 'phone', label: 'Phone', render: (company: Company) => company.phone || '—' },
    { key: 'size', label: 'Size', render: (company: Company) => company.size || '—' },
    {
      key: 'accountOwner',
      label: 'Account Owner',
      render: (company: Company) =>
        company.accountOwner ? `${company.accountOwner.firstName} ${company.accountOwner.lastName}` : '—',
    },
  ];

  const toggleableColumns = [
    ...columns,
    ...activeCompanyCustomFields.map((field) => ({ key: `cf:${field.id}`, label: field.name })),
  ];
  const movableColumnKeys = columns.map((col) => col.key).filter((key) => !FROZEN_COLUMN_KEYS.includes(key));
  const { orderedKeys: columnOrder, reorder: reorderColumns } = useColumnOrder(
    'northstack:columnOrder:company',
    movableColumnKeys,
  );
  const frozenColumns: typeof columns = FROZEN_COLUMN_KEYS.map((key) => columns.find((col) => col.key === key)).filter(
    (col: any) => !!col && !isColumnHidden(col.key),
  ) as typeof columns;
  const movableVisibleColumns: typeof columns = columnOrder
    .map((key: string) => columns.find((col) => col.key === key))
    .filter((col: any) => !!col && !isColumnHidden(col.key)) as typeof columns;
  const visibleColumns: typeof columns = [...frozenColumns, ...movableVisibleColumns] as typeof columns;
  const getFrozenLeft = (key: string) => {
    let left = 0;
    for (const col of frozenColumns) {
      if (col.key === key) return left;
      left += getColumnWidth(col.key);
    }
    return left;
  };
  const visibleCustomFields = activeCompanyCustomFields.filter((field) => !isColumnHidden(`cf:${field.id}`));

  return (
    <div className="page-full">
      {deletingCompany && (
        <ConfirmDialog
          title="Delete company"
          message={`Are you sure you want to delete ${deletingCompany.name}? This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteCompany}
          onCancel={() => setDeletingCompany(null)}
        />
      )}

      <SlideOver
        open={slideOverMode !== null}
        title={slideOverMode === 'edit' ? 'Edit Company' : 'Add Company'}
        onClose={closeSlideOver}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeSlideOver}>
              Cancel
            </button>
            <button type="submit" form="company-form" className="btn-primary">
              {slideOverMode === 'edit' ? 'Save' : 'Create'}
            </button>
          </>
        }
      >
        {(slideOverMode === 'add' || slideOverMode === 'edit') && (
          <form
            id="company-form"
            onSubmit={slideOverMode === 'edit' ? handleUpdateCompany : handleCreateCompany}
          >
            {(() => {
              const form = slideOverMode === 'edit' ? editCompanyForm : companyForm;
              const setForm = slideOverMode === 'edit' ? setEditCompanyForm : setCompanyForm;
              const idPrefix = slideOverMode === 'edit' ? 'edit-company' : 'company';
              return (
                <>
                  <div className="form-group">
                    <label htmlFor={`${idPrefix}-name`}>Name</label>
                    <input
                      id={`${idPrefix}-name`}
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`${idPrefix}-industry`}>Industry</label>
                    <input
                      id={`${idPrefix}-industry`}
                      type="text"
                      value={form.industry}
                      onChange={(e) => setForm({ ...form, industry: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`${idPrefix}-website`}>Website</label>
                    <input
                      id={`${idPrefix}-website`}
                      type="url"
                      value={form.website}
                      onChange={(e) => setForm({ ...form, website: e.target.value })}
                      placeholder="https://example.com"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`${idPrefix}-phone`}>Phone</label>
                    <input
                      id={`${idPrefix}-phone`}
                      type="text"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`${idPrefix}-billingAddress`}>Billing Address</label>
                    <input
                      id={`${idPrefix}-billingAddress`}
                      type="text"
                      value={form.billingAddress}
                      onChange={(e) => setForm({ ...form, billingAddress: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`${idPrefix}-size`}>Size</label>
                    <input
                      id={`${idPrefix}-size`}
                      type="text"
                      value={form.size}
                      onChange={(e) => setForm({ ...form, size: e.target.value })}
                      placeholder="e.g. 11-50 employees"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`${idPrefix}-accountOwnerId`}>Account Owner</label>
                    <select
                      id={`${idPrefix}-accountOwnerId`}
                      value={form.accountOwnerId}
                      onChange={(e) => setForm({ ...form, accountOwnerId: e.target.value })}
                    >
                      <option value="">-- none --</option>
                      {tenantUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              );
            })()}

            {activeCompanyCustomFields.map((field) => (
              <div className="form-group" key={field.id}>
                <label htmlFor={`${slideOverMode === 'edit' ? 'edit-company' : 'company'}-cf-${field.id}`}>
                  {field.name}
                  {field.required ? ' *' : ''}
                </label>
                {renderCustomFieldInput(
                  field,
                  slideOverMode === 'edit' ? editCustomFieldValues : customFieldValues,
                  slideOverMode === 'edit' ? setEditCustomFieldValues : setCustomFieldValues,
                  slideOverMode === 'edit' ? 'edit-company-cf' : 'company-cf',
                )}
              </div>
            ))}
          </form>
        )}
      </SlideOver>

      <div className="page-toolbar">
        <h2>Companies</h2>
        {companies.length > 0 && (
          <div className="toolbar-search">
            <SearchIcon />
            <label htmlFor="company-search" className="sr-only">
              Search companies
            </label>
            <input
              id="company-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, industry or website..."
            />
          </div>
        )}
        <ColumnVisibilityMenu columns={toggleableColumns} isHidden={isColumnHidden} onToggle={toggleColumn} />
        {canEditCompanies && (
          <button className="btn-primary btn-toolbar-size" onClick={handleOpenAdd}>
            <span className="inline-flex items-center gap-1.5">
              <PlusIcon className="h-4 w-4" />
              Add Company
            </span>
          </button>
        )}
      </div>

      {loading ? (
        <p className="mt-4">Loading...</p>
      ) : companies.length === 0 ? (
        <div className="empty-state">
          <p>No companies yet.</p>
          {canEditCompanies && (
            <button className="btn btn-success" onClick={handleOpenAdd}>
              Add your first company
            </button>
          )}
        </div>
      ) : searchFilteredCompanies.length === 0 ? (
        <p className="mt-4">No companies match your search.</p>
      ) : (
        <>
          <div className="full-table-wrap">
            <table className="table full-table">
              <colgroup>
                {visibleColumns.map((col) => (
                  <col key={col.key} style={{ width: getColumnWidth(col.key) }} />
                ))}
                {visibleCustomFields.map((field) => (
                  <col key={field.id} style={{ width: getColumnWidth(`cf:${field.id}`) }} />
                ))}
                {canManageCustomFields && <col style={{ width: 40 }} />}
                <col style={{ width: 90 }} />
              </colgroup>
              <thead>
                <tr>
                  {visibleColumns.map((col) => {
                    const isFrozen = FROZEN_COLUMN_KEYS.includes(col.key);
                    const isLastFrozen = isFrozen && frozenColumns[frozenColumns.length - 1]?.key === col.key;
                    return (
                      <th
                        key={col.key}
                        draggable={!isFrozen}
                        onDragStart={isFrozen ? undefined : () => setDraggedColKey(col.key)}
                        onDragEnd={
                          isFrozen
                            ? undefined
                            : () => {
                                setDraggedColKey(null);
                                setDragOverColKey(null);
                              }
                        }
                        onDragOver={
                          isFrozen
                            ? undefined
                            : (e) => {
                                e.preventDefault();
                                if (dragOverColKey !== col.key) setDragOverColKey(col.key);
                              }
                        }
                        onDrop={
                          isFrozen
                            ? undefined
                            : () => {
                                if (draggedColKey) reorderColumns(draggedColKey, col.key);
                                setDraggedColKey(null);
                                setDragOverColKey(null);
                              }
                        }
                        className={`${isFrozen ? 'col-frozen' : ''} ${isLastFrozen ? 'col-frozen-edge' : ''} ${!isFrozen && draggedColKey === col.key ? 'col-dragging' : ''} ${!isFrozen && dragOverColKey === col.key && draggedColKey && draggedColKey !== col.key ? 'col-drag-over' : ''}`}
                        style={isFrozen ? { left: getFrozenLeft(col.key), zIndex: 3 } : undefined}
                      >
                        {col.label}
                        <ColumnResizeHandle onMouseDown={(e) => startResize(col.key, e)} />
                      </th>
                    );
                  })}
                  {visibleCustomFields.map((field) => (
                    <th key={field.id}>
                      {field.name}
                      {canManageCustomFields && (
                        <CustomFieldColumnMenu
                          field={field}
                          onUpdate={handleUpdateCustomFieldColumn}
                          onDeactivate={handleDeactivateCustomFieldColumn}
                          onHide={() => hideColumn(`cf:${field.id}`)}
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
                {pagedCompanies.map((company) => (
                  <tr key={company.id}>
                    {visibleColumns.map((col) => {
                      const isFrozen = FROZEN_COLUMN_KEYS.includes(col.key);
                      const isLastFrozen = isFrozen && frozenColumns[frozenColumns.length - 1]?.key === col.key;
                      return (
                        <td
                          key={col.key}
                          className={`${isFrozen ? 'col-frozen' : ''} ${isLastFrozen ? 'col-frozen-edge' : ''}`}
                          style={isFrozen ? { left: getFrozenLeft(col.key), zIndex: 1 } : undefined}
                        >
                          {col.render(company)}
                        </td>
                      );
                    })}
                    {visibleCustomFields.map((field) => {
                      const fieldValue = company.customFieldVals?.find(
                        (v: any) => v.customFieldDefinitionId === field.id,
                      );
                      return <td key={field.id}>{fieldValue?.value || '—'}</td>;
                    })}
                    {canManageCustomFields && <td></td>}
                    <td>
                      <div className="icon-actions">
                        <button className="icon-btn" onClick={() => handleStartEditCompany(company)}>
                          <span className="tip">Edit</span>
                          <PencilIcon />
                        </button>
                        <button className="icon-btn danger" onClick={() => setDeletingCompany(company)}>
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
