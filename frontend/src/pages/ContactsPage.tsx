import { useEffect, useRef, useState } from 'react';
import { api, type Company, type Contact, type Opportunity, type Pipeline } from '../api';
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
import CategoryChip from '../components/CategoryChip';
import ContactDetailModal from '../components/ContactDetailModal';
import HorizontalScrollbar from '../components/HorizontalScrollbar';
import { PlusIcon, SearchIcon, TrashIcon } from '../components/Icons';

const PAGE_SIZE = 20;
const FROZEN_COLUMN_KEYS = ['name'];

const LEAD_STATUS_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  disqualified: 'Disqualified',
};

interface ContactsPageProps {
  user: any;
  token: string;
}

const emptyContactForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  companyId: '',
  title: '',
  isPrimary: false,
  leadStatus: '',
  leadSourceId: '',
};

export default function ContactsPage({ user, token }: ContactsPageProps) {
  const toast = useToast();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [tenantCurrency, setTenantCurrency] = useState('USD');
  const [leadSources, setLeadSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [slideOverMode, setSlideOverMode] = useState<'add' | null>(null);
  const [viewingContactId, setViewingContactId] = useState<string | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [contactCustomFields, setContactCustomFields] = useState<any[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [contactForm, setContactForm] = useState(emptyContactForm);
  const [draggedColKey, setDraggedColKey] = useState<string | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);

  const canManageCustomFields = user.role === 'owner' || user.role === 'admin';
  const canEditContacts = user.role === 'owner' || user.role === 'admin';
  const { getWidth: getColumnWidth, startResize } = useResizableColumns('northstack:columnWidths:contact');
  const { isHidden: isColumnHidden, toggle: toggleColumn, hide: hideColumn } = useColumnVisibility(
    'northstack:hiddenColumns:contact',
  );
  const activeContactCustomFields = contactCustomFields.filter((field) => field.isActive);

  useEffect(() => {
    loadContacts();
    loadContactCustomFields();
    api.listCompanies(token).then(setCompanies).catch(() => {});
    api.listOpportunities(token).then(setOpportunities).catch(() => {});
    api.listPipelines(token).then(setPipelines).catch(() => {});
    api.getCurrentTenant(token).then((tenant) => setTenantCurrency(tenant.currency)).catch(() => {});
    api
      .listFieldCatalogDefinitions(token, 'leadSource')
      .then((defs) => setLeadSources(defs.filter((d) => d.isActive)))
      .catch(() => {
        // Non-critical — the lead source dropdown just falls back to empty if it fails.
      });
  }, []);

  const refreshAssociatedData = () => {
    loadContacts();
    api.listCompanies(token).then(setCompanies).catch(() => {});
    api.listOpportunities(token).then(setOpportunities).catch(() => {});
  };

  const loadContacts = async () => {
    setLoading(true);
    try {
      const data = await api.listContacts(token);
      setContacts(data);
    } catch (error) {
      toast.error('Failed to load contacts: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadContactCustomFields = async () => {
    try {
      const defs = await api.listCustomFieldDefinitions(token, 'contact');
      setContactCustomFields(defs);
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
      await api.createCustomFieldDefinition(token, { ...input, entityType: 'contact' });
      toast.success(`Field "${input.name}" added.`);
      loadContactCustomFields();
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
      loadContactCustomFields();
    } catch (error) {
      toast.error('Failed to update field: ' + (error as Error).message);
    }
  };

  const handleDeactivateCustomFieldColumn = async (id: string) => {
    try {
      await api.updateCustomFieldDefinition(token, id, { isActive: false });
      toast.success('Field deleted.');
      loadContactCustomFields();
    } catch (error) {
      toast.error('Failed to delete field: ' + (error as Error).message);
    }
  };

  const closeSlideOver = () => {
    setSlideOverMode(null);
    setCustomFieldValues({});
  };

  const handleOpenAdd = () => {
    setContactForm(emptyContactForm);
    setCustomFieldValues({});
    setSlideOverMode('add');
  };

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const contact = await api.createContact(token, {
        firstName: contactForm.firstName,
        lastName: contactForm.lastName,
        email: contactForm.email,
        phone: contactForm.phone || undefined,
        companyId: contactForm.companyId || null,
        title: contactForm.title || undefined,
        isPrimary: contactForm.isPrimary,
        leadStatus: contactForm.leadStatus || null,
        leadSourceId: contactForm.leadSourceId || null,
      });

      const valueEntries = Object.entries(customFieldValues).filter(([, value]) => value.trim() !== '');
      for (const [customFieldDefinitionId, value] of valueEntries) {
        await api.createContactCustomFieldValue(token, contact.id, { customFieldDefinitionId, value });
      }

      toast.success(`${contact.firstName} ${contact.lastName} added.`);
      closeSlideOver();
      loadContacts();
    } catch (error) {
      toast.error('Failed to create contact: ' + (error as Error).message);
    }
  };

  const handleDeleteContact = async () => {
    if (!deletingContact) return;
    try {
      await api.deleteContact(token, deletingContact.id);
      toast.success(`${deletingContact.firstName} ${deletingContact.lastName} deleted.`);
      setDeletingContact(null);
      loadContacts();
    } catch (error) {
      toast.error('Failed to delete contact: ' + (error as Error).message);
      setDeletingContact(null);
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

  const searchFilteredContacts = contacts.filter((contact) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      `${contact.firstName} ${contact.lastName}`.toLowerCase().includes(query) ||
      contact.email.toLowerCase().includes(query) ||
      (contact.company?.name ?? '').toLowerCase().includes(query)
    );
  });

  const pageCount = Math.max(1, Math.ceil(searchFilteredContacts.length / PAGE_SIZE));
  const pagedContacts = paginate(searchFilteredContacts, page, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const columns = [
    {
      key: 'name',
      label: 'Name',
      render: (contact: Contact) => (
        <div className="name-cell">
          <Avatar firstName={contact.firstName} lastName={contact.lastName} />
          <button type="button" className="name-link" onClick={() => setViewingContactId(contact.id)}>
            {contact.firstName} {contact.lastName}
          </button>
          {contact.isPrimary && <span className="chip-linked">Primary</span>}
        </div>
      ),
    },
    { key: 'email', label: 'Email', render: (contact: Contact) => contact.email },
    { key: 'phone', label: 'Phone', render: (contact: Contact) => contact.phone || '—' },
    { key: 'company', label: 'Company', render: (contact: Contact) => contact.company?.name || '—' },
    { key: 'title', label: 'Title', render: (contact: Contact) => contact.title || '—' },
    {
      key: 'leadStatus',
      label: 'Lead Status',
      render: (contact: Contact) => (contact.leadStatus ? LEAD_STATUS_LABELS[contact.leadStatus] : '—'),
    },
    { key: 'leadSource', label: 'Lead Source', render: (contact: Contact) => contact.leadSource?.name || '—' },
  ];

  const toggleableColumns = [
    ...columns,
    ...activeContactCustomFields.map((field) => ({ key: `cf:${field.id}`, label: field.name })),
  ];
  const movableColumnKeys = columns.map((col) => col.key).filter((key) => !FROZEN_COLUMN_KEYS.includes(key));
  const { orderedKeys: columnOrder, reorder: reorderColumns } = useColumnOrder(
    'northstack:columnOrder:contact',
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
  const visibleCustomFields = activeContactCustomFields.filter((field) => !isColumnHidden(`cf:${field.id}`));

  return (
    <div className="page-full">
      {deletingContact && (
        <ConfirmDialog
          title="Delete contact"
          message={`Are you sure you want to delete ${deletingContact.firstName} ${deletingContact.lastName}? This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteContact}
          onCancel={() => setDeletingContact(null)}
        />
      )}

      <SlideOver
        open={slideOverMode === 'add'}
        title="Add Contact"
        onClose={closeSlideOver}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeSlideOver}>
              Cancel
            </button>
            <button type="submit" form="contact-form" className="btn-primary">
              Create
            </button>
          </>
        }
      >
        {slideOverMode === 'add' && (
          <form id="contact-form" onSubmit={handleCreateContact}>
            <div className="form-group">
              <label htmlFor="contact-firstName">First Name</label>
              <input
                id="contact-firstName"
                type="text"
                value={contactForm.firstName}
                onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="contact-lastName">Last Name</label>
              <input
                id="contact-lastName"
                type="text"
                value={contactForm.lastName}
                onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="contact-email">Email</label>
              <input
                id="contact-email"
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="contact-phone">Phone</label>
              <input
                id="contact-phone"
                type="text"
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="contact-companyId">Company</label>
              <select
                id="contact-companyId"
                value={contactForm.companyId}
                onChange={(e) => setContactForm({ ...contactForm, companyId: e.target.value })}
              >
                <option value="">-- none (lead without a confirmed company) --</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="contact-title">Title</label>
              <input
                id="contact-title"
                type="text"
                value={contactForm.title}
                onChange={(e) => setContactForm({ ...contactForm, title: e.target.value })}
                placeholder="Role within the company"
              />
            </div>
            <div className="form-group">
              <label htmlFor="contact-isPrimary" className="inline-flex items-center gap-1.5 font-normal">
                <input
                  id="contact-isPrimary"
                  type="checkbox"
                  checked={contactForm.isPrimary}
                  onChange={(e) => setContactForm({ ...contactForm, isPrimary: e.target.checked })}
                />
                Primary contact for this company
              </label>
            </div>
            <div className="form-group">
              <label htmlFor="contact-leadStatus">Lead Status</label>
              <select
                id="contact-leadStatus"
                value={contactForm.leadStatus}
                onChange={(e) => setContactForm({ ...contactForm, leadStatus: e.target.value })}
              >
                <option value="">-- none --</option>
                {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="contact-leadSourceId">Lead Source</label>
              <select
                id="contact-leadSourceId"
                value={contactForm.leadSourceId}
                onChange={(e) => setContactForm({ ...contactForm, leadSourceId: e.target.value })}
              >
                <option value="">-- none --</option>
                {leadSources.map((ls) => (
                  <option key={ls.id} value={ls.id}>
                    {ls.name}
                  </option>
                ))}
              </select>
            </div>

            {activeContactCustomFields.map((field) => (
              <div className="form-group" key={field.id}>
                <label htmlFor={`contact-cf-${field.id}`}>
                  {field.name}
                  {field.required ? ' *' : ''}
                </label>
                {renderCustomFieldInput(field, customFieldValues, setCustomFieldValues, 'contact-cf')}
              </div>
            ))}
          </form>
        )}
      </SlideOver>

      {viewingContactId &&
        (() => {
          const viewingContact = contacts.find((c) => c.id === viewingContactId);
          if (!viewingContact) return null;
          return (
            <ContactDetailModal
              contact={viewingContact}
              token={token}
              companies={companies}
              contacts={contacts}
              opportunities={opportunities}
              pipelines={pipelines}
              leadSources={leadSources}
              customFields={activeContactCustomFields}
              tenantCurrency={tenantCurrency}
              currentUserId={user.id}
              onClose={() => setViewingContactId(null)}
              onChanged={refreshAssociatedData}
            />
          );
        })()}

      <div className="page-toolbar">
        <h2>Contacts</h2>
        {contacts.length > 0 && (
          <div className="toolbar-search">
            <SearchIcon />
            <label htmlFor="contact-search" className="sr-only">
              Search contacts
            </label>
            <input
              id="contact-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email or company..."
            />
          </div>
        )}
        <ColumnVisibilityMenu columns={toggleableColumns} isHidden={isColumnHidden} onToggle={toggleColumn} />
      </div>

      {loading ? (
        <p className="mt-4">Loading...</p>
      ) : contacts.length === 0 ? (
        <div className="empty-state">
          <p>No contacts yet.</p>
          {canEditContacts && (
            <button className="btn btn-success" onClick={handleOpenAdd}>
              Add your first contact
            </button>
          )}
        </div>
      ) : searchFilteredContacts.length === 0 ? (
        <p className="mt-4">No contacts match your search.</p>
      ) : (
        <>
          <div className="full-table-wrap" ref={tableWrapRef}>
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
                {pagedContacts.map((contact) => (
                  <tr key={contact.id}>
                    {visibleColumns.map((col) => {
                      const isFrozen = FROZEN_COLUMN_KEYS.includes(col.key);
                      const isLastFrozen = isFrozen && frozenColumns[frozenColumns.length - 1]?.key === col.key;
                      return (
                        <td
                          key={col.key}
                          className={`${isFrozen ? 'col-frozen' : ''} ${isLastFrozen ? 'col-frozen-edge' : ''}`}
                          style={isFrozen ? { left: getFrozenLeft(col.key), zIndex: 1 } : undefined}
                        >
                          {col.render(contact)}
                        </td>
                      );
                    })}
                    {visibleCustomFields.map((field) => {
                      const fieldValue = contact.customFieldVals?.find(
                        (v: any) => v.customFieldDefinitionId === field.id,
                      );
                      const value = fieldValue?.value;
                      return (
                        <td key={field.id}>
                          {value ? (
                            field.fieldType === 'select' ? (
                              <CategoryChip label={value} seed={`${field.id}:${value}`} />
                            ) : (
                              value
                            )
                          ) : (
                            '—'
                          )}
                        </td>
                      );
                    })}
                    {canManageCustomFields && <td></td>}
                    <td>
                      <div className="icon-actions">
                        <button className="icon-btn danger" onClick={() => setDeletingContact(contact)}>
                          <span className="tip">Delete</span>
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {canEditContacts && (
                  <tr className="ghost-row">
                    <td
                      colSpan={visibleColumns.length + visibleCustomFields.length + (canManageCustomFields ? 1 : 0) + 1}
                      className="ghost-row-cell"
                      onClick={handleOpenAdd}
                    >
                      <span className="ghost-row-inner">
                        <span className="ghost-plus-box">
                          <PlusIcon className="h-3 w-3" />
                        </span>
                        Add
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <HorizontalScrollbar targetRef={tableWrapRef} />
          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
