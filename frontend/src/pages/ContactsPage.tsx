import { useEffect, useState } from 'react';
import { api, type Contact } from '../api';
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
import { PencilIcon, PlusIcon, SearchIcon, TrashIcon } from '../components/Icons';

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
  const [companies, setCompanies] = useState<any[]>([]);
  const [leadSources, setLeadSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [slideOverMode, setSlideOverMode] = useState<'add' | 'edit' | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [contactCustomFields, setContactCustomFields] = useState<any[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [editCustomFieldValues, setEditCustomFieldValues] = useState<Record<string, string>>({});
  const [editCustomFieldValueIds, setEditCustomFieldValueIds] = useState<Record<string, string>>({});
  const [contactForm, setContactForm] = useState(emptyContactForm);
  const [editContactForm, setEditContactForm] = useState(emptyContactForm);
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
    api
      .listFieldCatalogDefinitions(token, 'leadSource')
      .then((defs) => setLeadSources(defs.filter((d) => d.isActive)))
      .catch(() => {
        // Non-critical — the lead source dropdown just falls back to empty if it fails.
      });
  }, []);

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
    setEditingContactId(null);
    setCustomFieldValues({});
    setEditCustomFieldValues({});
    setEditCustomFieldValueIds({});
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

  const handleStartEditContact = (contact: Contact) => {
    setEditingContactId(contact.id);
    setEditContactForm({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.phone || '',
      companyId: contact.companyId || '',
      title: contact.title || '',
      isPrimary: contact.isPrimary,
      leadStatus: contact.leadStatus || '',
      leadSourceId: contact.leadSourceId || '',
    });

    const values: Record<string, string> = {};
    const valueIds: Record<string, string> = {};
    for (const fieldValue of contact.customFieldVals || []) {
      values[fieldValue.customFieldDefinitionId] = fieldValue.value;
      valueIds[fieldValue.customFieldDefinitionId] = fieldValue.id;
    }
    setEditCustomFieldValues(values);
    setEditCustomFieldValueIds(valueIds);
    setSlideOverMode('edit');
  };

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContactId) return;
    try {
      await api.updateContact(token, editingContactId, {
        firstName: editContactForm.firstName,
        lastName: editContactForm.lastName,
        email: editContactForm.email,
        phone: editContactForm.phone || null,
        companyId: editContactForm.companyId || null,
        title: editContactForm.title || null,
        isPrimary: editContactForm.isPrimary,
        leadStatus: (editContactForm.leadStatus || null) as Contact['leadStatus'],
        leadSourceId: editContactForm.leadSourceId || null,
      });

      for (const field of activeContactCustomFields) {
        const newValue = (editCustomFieldValues[field.id] || '').trim();
        const existingValueId = editCustomFieldValueIds[field.id];

        if (newValue === '' && existingValueId) {
          await api.deleteContactCustomFieldValue(token, editingContactId, existingValueId);
        } else if (newValue !== '' && existingValueId) {
          await api.updateContactCustomFieldValue(token, editingContactId, existingValueId, newValue);
        } else if (newValue !== '' && !existingValueId) {
          await api.createContactCustomFieldValue(token, editingContactId, {
            customFieldDefinitionId: field.id,
            value: newValue,
          });
        }
      }

      toast.success('Contact updated.');
      closeSlideOver();
      loadContacts();
    } catch (error) {
      toast.error('Failed to update contact: ' + (error as Error).message);
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
          {contact.firstName} {contact.lastName}
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
        open={slideOverMode !== null}
        title={slideOverMode === 'edit' ? 'Edit Contact' : 'Add Contact'}
        onClose={closeSlideOver}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeSlideOver}>
              Cancel
            </button>
            <button type="submit" form="contact-form" className="btn-primary">
              {slideOverMode === 'edit' ? 'Save' : 'Create'}
            </button>
          </>
        }
      >
        {(slideOverMode === 'add' || slideOverMode === 'edit') && (
          <form
            id="contact-form"
            onSubmit={slideOverMode === 'edit' ? handleUpdateContact : handleCreateContact}
          >
            {(() => {
              const form = slideOverMode === 'edit' ? editContactForm : contactForm;
              const setForm = slideOverMode === 'edit' ? setEditContactForm : setContactForm;
              const idPrefix = slideOverMode === 'edit' ? 'edit-contact' : 'contact';
              return (
                <>
                  <div className="form-group">
                    <label htmlFor={`${idPrefix}-firstName`}>First Name</label>
                    <input
                      id={`${idPrefix}-firstName`}
                      type="text"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`${idPrefix}-lastName`}>Last Name</label>
                    <input
                      id={`${idPrefix}-lastName`}
                      type="text"
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`${idPrefix}-email`}>Email</label>
                    <input
                      id={`${idPrefix}-email`}
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      required
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
                    <label htmlFor={`${idPrefix}-companyId`}>Company</label>
                    <select
                      id={`${idPrefix}-companyId`}
                      value={form.companyId}
                      onChange={(e) => setForm({ ...form, companyId: e.target.value })}
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
                    <label htmlFor={`${idPrefix}-title`}>Title</label>
                    <input
                      id={`${idPrefix}-title`}
                      type="text"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="Role within the company"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`${idPrefix}-isPrimary`} className="inline-flex items-center gap-1.5 font-normal">
                      <input
                        id={`${idPrefix}-isPrimary`}
                        type="checkbox"
                        checked={form.isPrimary}
                        onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })}
                      />
                      Primary contact for this company
                    </label>
                  </div>
                  <div className="form-group">
                    <label htmlFor={`${idPrefix}-leadStatus`}>Lead Status</label>
                    <select
                      id={`${idPrefix}-leadStatus`}
                      value={form.leadStatus}
                      onChange={(e) => setForm({ ...form, leadStatus: e.target.value })}
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
                    <label htmlFor={`${idPrefix}-leadSourceId`}>Lead Source</label>
                    <select
                      id={`${idPrefix}-leadSourceId`}
                      value={form.leadSourceId}
                      onChange={(e) => setForm({ ...form, leadSourceId: e.target.value })}
                    >
                      <option value="">-- none --</option>
                      {leadSources.map((ls) => (
                        <option key={ls.id} value={ls.id}>
                          {ls.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              );
            })()}

            {activeContactCustomFields.map((field) => (
              <div className="form-group" key={field.id}>
                <label htmlFor={`${slideOverMode === 'edit' ? 'edit-contact' : 'contact'}-cf-${field.id}`}>
                  {field.name}
                  {field.required ? ' *' : ''}
                </label>
                {renderCustomFieldInput(
                  field,
                  slideOverMode === 'edit' ? editCustomFieldValues : customFieldValues,
                  slideOverMode === 'edit' ? setEditCustomFieldValues : setCustomFieldValues,
                  slideOverMode === 'edit' ? 'edit-contact-cf' : 'contact-cf',
                )}
              </div>
            ))}
          </form>
        )}
      </SlideOver>

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
        {canEditContacts && (
          <button className="btn-primary btn-toolbar-size" onClick={handleOpenAdd}>
            <span className="inline-flex items-center gap-1.5">
              <PlusIcon className="h-4 w-4" />
              Add Contact
            </span>
          </button>
        )}
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
                      return <td key={field.id}>{fieldValue?.value || '—'}</td>;
                    })}
                    {canManageCustomFields && <td></td>}
                    <td>
                      <div className="icon-actions">
                        <button className="icon-btn" onClick={() => handleStartEditContact(contact)}>
                          <span className="tip">Edit</span>
                          <PencilIcon />
                        </button>
                        <button className="icon-btn danger" onClick={() => setDeletingContact(contact)}>
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
