import { useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  type Company,
  type Contact,
  type Opportunity,
  type Pipeline,
  type SavedView,
  type ViewFilter,
  type ViewSort,
} from '../api';
import { useToast } from '../components/common/ToastProvider';
import ConfirmDialog from '../components/common/ConfirmDialog';
import Pagination, { paginate } from '../components/common/Pagination';
import Modal from '../components/common/Modal';
import EmptyState from '../components/common/EmptyState';
import TableSkeleton from '../components/common/TableSkeleton';
import EntityCardList from '../components/common/EntityCardList';
import ViewsBar from '../components/entity-views/ViewsBar';
import FilterBar from '../components/entity-views/FilterBar';
import KanbanBoard from '../components/entity-views/KanbanBoard';
import CustomFieldColumnMenu from '../components/entity-views/CustomFieldColumnMenu';
import AddCustomFieldColumn from '../components/entity-views/AddCustomFieldColumn';
import ColumnResizeHandle from '../components/entity-views/ColumnResizeHandle';
import { useResizableColumns } from '../hooks/useResizableColumns';
import ColumnVisibilityMenu from '../components/entity-views/ColumnVisibilityMenu';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { useColumnOrder } from '../hooks/useColumnOrder';
import Avatar, { getInitials } from '../components/common/Avatar';
import CategoryChip from '../components/common/CategoryChip';
import ContactDetailModal from '../components/crm/ContactDetailModal';
import SearchableSelect from '../components/common/SearchableSelect';
import HorizontalScrollbar from '../components/entity-views/HorizontalScrollbar';
import Field from '../components/common/Field';
import { ChevronDownIcon, PlusIcon, SearchIcon, TrashIcon, UserCircleIcon } from '../components/common/Icons';
import {
  applyFilters,
  applySort,
  buildContactFields,
  findField,
  groupableFields,
  LEAD_STATUS_VALUE_BY_LABEL,
  parseFilters,
  parseSort,
} from '../lib/viewFields';
import { isLikelyValidEmail } from '../lib/validation';
import { useAutoCreateGuard } from '../hooks/useAutoCreateGuard';

const PAGE_SIZE = 20;
const ACTIVE_VIEW_STORAGE_KEY = 'northstack:activeView:contact';
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
  // Radio gate for whether this Contact gets assigned to an existing Company
  // at creation — defaults to "no" (a lead without a confirmed company yet
  // is a valid state, companyId stays nullable).
  assignToCompany: false,
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
  const [tenantUsers, setTenantUsers] = useState<any[]>([]);
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
  const autoCreateGuard = useAutoCreateGuard();
  const [createdContactId, setCreatedContactId] = useState<string | null>(null);
  const sentContactCustomFieldIds = useRef<Set<string>>(new Set());
  const [draggedColKey, setDraggedColKey] = useState<string | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);
  const [collapsedListSections, setCollapsedListSections] = useState<Set<string>>(new Set());

  const [views, setViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY),
  );
  const [viewFilters, setViewFilters] = useState<ViewFilter[]>([]);
  const [viewSort, setViewSort] = useState<ViewSort | null>(null);

  const canManageCustomFields = user.role === 'owner' || user.role === 'admin';
  const canEditContacts = user.role === 'owner' || user.role === 'admin';
  const columnStorageSuffix = activeViewId ?? 'default';
  const { getWidth: getColumnWidth, startResize } = useResizableColumns(
    `northstack:columnWidths:contact:${columnStorageSuffix}`,
  );
  const { isHidden: isColumnHidden, toggle: toggleColumn, hide: hideColumn } = useColumnVisibility(
    `northstack:hiddenColumns:contact:${columnStorageSuffix}`,
  );
  const activeContactCustomFields = contactCustomFields.filter((field) => field.isActive);

  const fields = useMemo(
    () => buildContactFields(contactCustomFields, leadSources),
    [contactCustomFields, leadSources],
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
    if (activeViewId) localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, activeViewId);
    else localStorage.removeItem(ACTIVE_VIEW_STORAGE_KEY);
  }, [activeViewId]);

  useEffect(() => {
    loadContacts();
    loadContactCustomFields();
    loadViews();
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
    api
      .listTenantUsers(token)
      .then(setTenantUsers)
      .catch(() => {
        // Non-critical — the Tasks assignee dropdown just falls back to empty if it fails.
      });
  }, []);

  // Silent refresh (no setLoading) — same fix as Companies/Employees
  // (2026-07-30): a loud loadContacts() here flashed the whole table behind
  // an open ContactDetailModal on every field/linked-record change.
  const refreshAssociatedData = () => {
    api.listContacts(token).then(setContacts).catch(() => {});
    api.listCompanies(token).then(setCompanies).catch(() => {});
    api.listOpportunities(token).then(setOpportunities).catch(() => {});
  };

  // Instant row update from a PATCH response, no round-trip (found
  // 2026-07-30, same fix as Company/Employee). Merged onto the existing row
  // since updateContact's response doesn't include customFieldVals the way
  // listContacts does.
  const patchContactInList = (updated: Contact) => {
    setContacts((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
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

  const loadViews = async () => {
    try {
      const data = await api.listViews(token, 'contact');
      setViews(data);
    } catch (error) {
      toast.error('Failed to load views: ' + (error as Error).message);
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
    autoCreateGuard.reset();
    setCreatedContactId(null);
    sentContactCustomFieldIds.current = new Set();
  };

  const handleOpenAdd = () => {
    setContactForm(emptyContactForm);
    setCustomFieldValues({});
    autoCreateGuard.reset();
    setCreatedContactId(null);
    sentContactCustomFieldIds.current = new Set();
    setSlideOverMode('add');
  };

  const isContactAddReady = (cfValues: Record<string, string> = customFieldValues) => {
    if (!contactForm.firstName.trim() || !contactForm.lastName.trim()) return false;
    if (!isLikelyValidEmail(contactForm.email)) return false;
    for (const field of activeContactCustomFields) {
      if (field.required && !(cfValues[field.id] || '').trim()) return false;
    }
    return true;
  };

  // Mirrors EmployeesPage's jumpToEmployeePage.
  const jumpToContactPage = (list: Contact[], contactId: string) => {
    const query = search.trim().toLowerCase();
    const searchFiltered = list.filter((contact) => {
      if (!query) return true;
      return (
        `${contact.firstName} ${contact.lastName}`.toLowerCase().includes(query) ||
        contact.email.toLowerCase().includes(query) ||
        (contact.company?.name ?? '').toLowerCase().includes(query)
      );
    });
    const filtered = applyFilters(searchFiltered, fields, viewFilters);
    const sorted = applySort(filtered, fields, viewSort);
    const index = sorted.findIndex((c) => c.id === contactId);
    if (index !== -1) setPage(Math.floor(index / PAGE_SIZE) + 1);
  };

  // Fires in the background as soon as the required fields are ready — a
  // safety net, not the point where the user is "done". Does NOT close the
  // Add form or navigate; finishContact/handleCreateContact (the real
  // "Create" button) does that once the user is actually finished (backlog
  // QA, 2026-08-27 — see useAutoCreateGuard.ts).
  const createContactRecord = async (cfValues: Record<string, string> = customFieldValues) => {
    const contact = await api.createContact(token, {
      firstName: contactForm.firstName.trim(),
      lastName: contactForm.lastName.trim(),
      email: contactForm.email.trim(),
      phone: contactForm.phone || undefined,
      companyId: contactForm.companyId || null,
      title: contactForm.title || undefined,
      isPrimary: contactForm.isPrimary,
      leadStatus: contactForm.leadStatus || null,
      leadSourceId: contactForm.leadSourceId || null,
    });

    const valueEntries = Object.entries(cfValues).filter(([, value]) => value.trim() !== '');
    for (const [customFieldDefinitionId, value] of valueEntries) {
      await api.createContactCustomFieldValue(token, contact.id, { customFieldDefinitionId, value });
      sentContactCustomFieldIds.current.add(customFieldDefinitionId);
    }

    setCreatedContactId(contact.id);
    return contact;
  };

  // PATCHes the record createContactRecord already persisted. Custom field
  // values only get a create call for definitions not already sent at
  // auto-create time (same accepted gap as Opportunity/Company).
  const updateContactRecord = async (contactId: string, cfValues: Record<string, string>) => {
    await api.updateContact(token, contactId, {
      firstName: contactForm.firstName.trim(),
      lastName: contactForm.lastName.trim(),
      email: contactForm.email.trim(),
      phone: contactForm.phone || undefined,
      companyId: contactForm.companyId || null,
      title: contactForm.title || undefined,
      isPrimary: contactForm.isPrimary,
      leadStatus: (contactForm.leadStatus || null) as any,
      leadSourceId: contactForm.leadSourceId || null,
    });
    const newEntries = Object.entries(cfValues).filter(
      ([id, value]) => value.trim() !== '' && !sentContactCustomFieldIds.current.has(id),
    );
    for (const [customFieldDefinitionId, value] of newEntries) {
      await api.createContactCustomFieldValue(token, contactId, { customFieldDefinitionId, value });
      sentContactCustomFieldIds.current.add(customFieldDefinitionId);
    }
  };

  const attemptAutoCreateContact = (cfValues: Record<string, string> = customFieldValues) => {
    autoCreateGuard.attempt(isContactAddReady(cfValues), async () => {
      try {
        await createContactRecord(cfValues);
      } catch (error) {
        toast.error('Failed to create contact: ' + (error as Error).message);
        throw error;
      }
    });
  };

  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let id = createdContactId;
      if (id) {
        await updateContactRecord(id, customFieldValues);
      } else {
        const contact = await createContactRecord(customFieldValues);
        id = contact.id;
      }
      toast.success('Contact added.');
      const freshList = await api.listContacts(token);
      setContacts(freshList);
      jumpToContactPage(freshList, id);
      setSlideOverMode(null);
      setCreatedContactId(null);
      setCustomFieldValues({});
      setViewingContactId(id);
    } catch (error) {
      toast.error('Failed to create contact: ' + (error as Error).message);
    }
  };

  const handleDeleteContact = async () => {
    if (!deletingContact) return;
    try {
      await api.deactivateContact(token, deletingContact.id);
      toast.success(`${deletingContact.firstName} ${deletingContact.lastName} deactivated.`);
      setDeletingContact(null);
      refreshAssociatedData();
    } catch (error) {
      toast.error('Failed to deactivate contact: ' + (error as Error).message);
      setDeletingContact(null);
    }
  };

  const renderCustomFieldInput = (
    field: any,
    values: Record<string, string>,
    setValues: (values: Record<string, string>) => void,
    idPrefix: string,
    onCommit?: (nextValues: Record<string, string>) => void,
  ) => {
    const inputId = `${idPrefix}-${field.id}`;
    if (field.fieldType === 'select') {
      return (
        <select
          id={inputId}
          className="overview-field-input"
          value={values[field.id] || ''}
          onChange={(e) => {
            const next = { ...values, [field.id]: e.target.value };
            setValues(next);
            onCommit?.(next);
          }}
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
        className="overview-field-input"
        type={inputType}
        value={values[field.id] || ''}
        onChange={(e) => setValues({ ...values, [field.id]: e.target.value })}
        onBlur={() => onCommit?.(values)}
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

  const viewFilteredContacts = applyFilters(searchFilteredContacts, fields, viewFilters);
  const sortedContacts = applySort(viewFilteredContacts, fields, viewSort);

  const pageCount = Math.max(1, Math.ceil(sortedContacts.length / PAGE_SIZE));
  const pagedContacts = paginate(sortedContacts, page, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, activeViewId]);

  const handleSort = (fieldKey: string) => {
    setViewSort((current) => {
      if (current?.field === fieldKey) {
        return { field: fieldKey, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { field: fieldKey, direction: 'asc' };
    });
  };

  const handleKanbanMove = async (contact: Contact, newValue: string) => {
    const groupField = activeView?.groupByField;
    if (!groupField) return;
    try {
      if (groupField === 'leadStatus') {
        const raw = LEAD_STATUS_VALUE_BY_LABEL[newValue];
        if (!raw) return;
        await api.updateContact(token, contact.id, { leadStatus: raw as Contact['leadStatus'] });
      } else if (groupField === 'leadSource') {
        const match = leadSources.find((s) => s.name === newValue);
        await api.updateContact(token, contact.id, { leadSourceId: match?.id ?? null });
      } else if (groupField.startsWith('cf:')) {
        const definitionId = groupField.slice(3);
        const existing = contact.customFieldVals?.find((v) => v.customFieldDefinitionId === definitionId);
        if (existing) {
          await api.updateContactCustomFieldValue(token, contact.id, existing.id, newValue);
        } else {
          await api.createContactCustomFieldValue(token, contact.id, { customFieldDefinitionId: definitionId, value: newValue });
        }
      } else {
        return;
      }
      loadContacts();
    } catch (error) {
      toast.error('Failed to move: ' + (error as Error).message);
    }
  };

  const handleCreateView = async (input: {
    name: string;
    type: 'grid' | 'kanban' | 'list';
    visibility: 'personal' | 'shared';
    groupByField?: string;
  }) => {
    try {
      const view = await api.createView(token, { entityType: 'contact', ...input });
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
        entityType: 'contact',
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
    `northstack:columnOrder:contact:${columnStorageSuffix}`,
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

  const groupFieldForKanban = activeView?.groupByField ? findField(fields, activeView.groupByField) : undefined;
  const groupByBroken = (viewType === 'kanban' || viewType === 'list') && !groupFieldForKanban;
  const noResultsInGridOrList = viewType !== 'kanban' && sortedContacts.length === 0;
  const showAddFallback = canEditContacts && contacts.length > 0 && (groupByBroken || noResultsInGridOrList);

  const totalColumnCount = visibleColumns.length + visibleCustomFields.length + (canManageCustomFields ? 1 : 0) + 1;

  const toggleListSection = (key: string) => {
    setCollapsedListSections((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const listSections = groupFieldForKanban
    ? (() => {
        const byValue = new Map<string, Contact[]>();
        for (const opt of groupFieldForKanban.selectOptions ?? []) byValue.set(opt.value, []);
        for (const contact of sortedContacts) {
          const value = groupFieldForKanban.getValue(contact);
          if (!byValue.has(value)) byValue.set(value, []);
          byValue.get(value)!.push(contact);
        }
        return Array.from(byValue.entries()).map(([value, items]) => ({
          key: value || '(none)',
          label: value || '(none)',
          color: groupFieldForKanban.selectOptions?.find((opt) => opt.value === value)?.color ?? null,
          items,
        }));
      })()
    : [];

  const renderContactRow = (contact: Contact) => (
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
        const fieldValue = contact.customFieldVals?.find((v: any) => v.customFieldDefinitionId === field.id);
        const value = fieldValue?.value;
        return (
          <td key={field.id}>
            {value ? (
              field.fieldType === 'select' ? <CategoryChip label={value} seed={`${field.id}:${value}`} /> : value
            ) : (
              '—'
            )}
          </td>
        );
      })}
      {canManageCustomFields && <td></td>}
      <td>
        <div className="icon-actions">
          <button
            className="icon-btn danger"
            onClick={() => setDeletingContact(contact)}
          >
            <span className="tip">Deactivate</span>
            <TrashIcon />
          </button>
        </div>
      </td>
    </tr>
  );

  const ghostAddRow = canEditContacts && (
    <tr className="ghost-row">
      <td colSpan={totalColumnCount} className="ghost-row-cell" onClick={handleOpenAdd}>
        <span className="ghost-row-inner">
          <span className="ghost-plus-box">
            <PlusIcon className="h-3 w-3" />
          </span>
          Add
        </span>
      </td>
    </tr>
  );

  return (
    <div className="page-full">
      {deletingContact && (() => {
        // Same "sole active link" rule as contactService.ts's deactivateContact —
        // computed here purely so the confirm copy can say what's actually going
        // to happen, the backend is the source of truth either way.
        const linkedOpportunities = opportunities.filter((o) =>
          o.contactLinks?.some((link) => link.contactId === deletingContact.id),
        );
        const willAlsoDeactivate = linkedOpportunities.filter((o) => {
          const activeLinks = (o.contactLinks || []).filter((link) => {
            if (link.contactId === deletingContact.id) return true;
            const linkedContact = contacts.find((c) => c.id === link.contactId);
            return linkedContact?.isActive !== false;
          });
          return activeLinks.length <= 1;
        });
        const messageParts = [`Are you sure you want to deactivate ${deletingContact.firstName} ${deletingContact.lastName}? They'll stop appearing in lists, but nothing is deleted.`];
        if (willAlsoDeactivate.length > 0) {
          messageParts.push(
            `${willAlsoDeactivate.length} opportunity(ies) (${willAlsoDeactivate.map((o) => o.name).join(', ')}) will also be deactivated — this is their only active contact.`,
          );
        }
        if (linkedOpportunities.length > willAlsoDeactivate.length) {
          messageParts.push(`The rest of their linked opportunities just lose this contact, they stay active.`);
        }
        return (
          <ConfirmDialog
            title="Deactivate contact"
            message={messageParts.join(' ')}
            confirmLabel="Deactivate"
            onConfirm={handleDeleteContact}
            onCancel={() => setDeletingContact(null)}
          />
        );
      })()}

      <Modal
        open={slideOverMode === 'add'}
        title="Add Contact"
        onClose={closeSlideOver}
        wide
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeSlideOver}>
              Cancel
            </button>
            <button type="submit" form="contact-form" className="btn-primary" disabled={autoCreateGuard.isBusy}>
              Create
            </button>
          </>
        }
      >
        {slideOverMode === 'add' && (
          <form id="contact-form" onSubmit={handleCreateContact}>
            <div className="field-group">
              <h4 className="field-group-title">Identity</h4>
              <div className="field-group-body">
                <Field label="First Name" required>
                  <input
                    id="contact-firstName"
                    className="overview-field-input"
                    type="text"
                    value={contactForm.firstName}
                    onChange={(e) => setContactForm({ ...contactForm, firstName: e.target.value })}
                    onBlur={() => attemptAutoCreateContact()}
                    required
                  />
                </Field>
                <Field label="Last Name" required>
                  <input
                    id="contact-lastName"
                    className="overview-field-input"
                    type="text"
                    value={contactForm.lastName}
                    onChange={(e) => setContactForm({ ...contactForm, lastName: e.target.value })}
                    onBlur={() => attemptAutoCreateContact()}
                    required
                  />
                </Field>
                <Field label="Email" required>
                  <input
                    id="contact-email"
                    className="overview-field-input"
                    type="email"
                    value={contactForm.email}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    onBlur={() => attemptAutoCreateContact()}
                    required
                  />
                </Field>
                <Field label="Phone">
                  <input
                    id="contact-phone"
                    className="overview-field-input"
                    type="text"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                  />
                </Field>
                <div className="form-group col-span-2">
                  <label>Assign to an existing company?</label>
                  <div className="flex items-center gap-4 text-sm">
                    <label className="inline-flex items-center gap-1.5 font-normal">
                      <input
                        type="radio"
                        name="contact-assign-company"
                        checked={!contactForm.assignToCompany}
                        onChange={() => setContactForm({ ...contactForm, assignToCompany: false, companyId: '' })}
                      />
                      No — lead without a confirmed company
                    </label>
                    <label className="inline-flex items-center gap-1.5 font-normal">
                      <input
                        type="radio"
                        name="contact-assign-company"
                        checked={contactForm.assignToCompany}
                        onChange={() => setContactForm({ ...contactForm, assignToCompany: true })}
                      />
                      Yes
                    </label>
                  </div>
                </div>
                {contactForm.assignToCompany && (
                  <div className="form-group col-span-2">
                    <label htmlFor="contact-companyId">Company</label>
                    <SearchableSelect
                      id="contact-companyId"
                      options={companies.map((c) => ({ value: c.id, label: c.name }))}
                      value={contactForm.companyId}
                      onChange={(v) => setContactForm({ ...contactForm, companyId: v })}
                      placeholder="Search companies…"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="field-group">
              <h4 className="field-group-title">Role</h4>
              <div className="field-group-body">
                <Field label="Title">
                  <input
                    id="contact-title"
                    className="overview-field-input"
                    type="text"
                    value={contactForm.title}
                    onChange={(e) => setContactForm({ ...contactForm, title: e.target.value })}
                    placeholder="Role within the company"
                  />
                </Field>
                <Field label="Lead Status">
                  <select
                    id="contact-leadStatus"
                    className="overview-field-input"
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
                </Field>
                <div className="form-group col-span-2">
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
              </div>
            </div>

            <div className="field-group">
              <h4 className="field-group-title">Source</h4>
              <div className="field-group-body">
                <Field label="Lead Source">
                  <select
                    id="contact-leadSourceId"
                    className="overview-field-input"
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
                </Field>
              </div>
            </div>

            {activeContactCustomFields.length > 0 && (
              <div className="field-group">
                <h4 className="field-group-title">Custom fields</h4>
                <div className="field-group-body">
                  {activeContactCustomFields.map((field) => (
                    <Field key={field.id} label={field.name} required={field.required}>
                      {renderCustomFieldInput(
                        field,
                        customFieldValues,
                        setCustomFieldValues,
                        'contact-cf',
                        (next) => attemptAutoCreateContact(next),
                      )}
                    </Field>
                  ))}
                </div>
              </div>
            )}
          </form>
        )}
      </Modal>

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
              tenantUsers={tenantUsers}
              onClose={() => setViewingContactId(null)}
              onChanged={refreshAssociatedData}
              onSaved={patchContactInList}
              onRequestDelete={() => {
                setViewingContactId(null);
                setDeletingContact(viewingContact);
              }}
            />
          );
        })()}

      <ViewsBar
        allLabel="All Contacts"
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
        {viewType !== 'kanban' && <FilterBar fields={fields} filters={viewFilters} onChange={setViewFilters} />}
        {viewType !== 'kanban' && (
          <ColumnVisibilityMenu columns={toggleableColumns} isHidden={isColumnHidden} onToggle={toggleColumn} />
        )}
        {showAddFallback && (
          <button className="btn-primary" onClick={handleOpenAdd}>
            <span className="inline-flex items-center gap-1.5">
              <PlusIcon className="h-4 w-4" />
              Add
            </span>
          </button>
        )}
      </div>

      {loading ? (
        <TableSkeleton />
      ) : contacts.length === 0 ? (
        canEditContacts ? (
          <EmptyState
            icon={<UserCircleIcon />}
            title="No contacts yet"
            body="Add the people you work with at your companies."
            primaryLabel="Add contact"
            onPrimary={handleOpenAdd}
          />
        ) : (
          <p className="mt-4">No contacts yet.</p>
        )
      ) : viewType === 'kanban' ? (
        !groupFieldForKanban ? (
          <p className="mt-4">This view's group-by field no longer exists.</p>
        ) : (
          <KanbanBoard
            columns={groupFieldForKanban.selectOptions?.map((opt) => ({ key: opt.value, label: opt.value, color: opt.color })) ?? []}
            items={viewFilteredContacts}
            getItemKey={(contact) => contact.id}
            getItemColumn={(contact) => groupFieldForKanban.getValue(contact)}
            onMove={canEditContacts ? handleKanbanMove : () => {}}
            renderCard={(contact) => (
              <div onClick={() => setViewingContactId(contact.id)} style={{ cursor: 'pointer' }}>
                <div className="kc-name">
                  {contact.firstName} {contact.lastName}
                </div>
                <div className="kc-meta">{contact.company?.name}</div>
              </div>
            )}
            renderColumnFooter={
              canEditContacts
                ? () => (
                    <div className="kanban-ghost-card" onClick={handleOpenAdd}>
                      <span className="ghost-plus-box">
                        <PlusIcon className="h-3 w-3" />
                      </span>
                      Add
                    </div>
                  )
                : undefined
            }
          />
        )
      ) : viewType === 'list' && !groupFieldForKanban ? (
        <p className="mt-4">This view's group-by field no longer exists.</p>
      ) : sortedContacts.length === 0 ? (
        <EmptyState
          icon={<SearchIcon />}
          title={`No matches for "${search}"`}
          body="Try a different term, or clear the filters."
          primaryLabel="Clear filters"
          primaryVariant="secondary"
          onPrimary={() => {
            setSearch('');
            setViewFilters([]);
          }}
        />
      ) : (
        <>
          <EntityCardList
            items={pagedContacts}
            getKey={(contact) => contact.id}
            getInitials={(contact) => getInitials(contact.firstName, contact.lastName)}
            getName={(contact) => `${contact.firstName} ${contact.lastName}`}
            getMeta={(contact) => [contact.title, contact.company?.name].filter(Boolean).join(' · ')}
            onSelect={(contact) => setViewingContactId(contact.id)}
          />
          <div className="full-table-wrap has-mobile-cards" ref={tableWrapRef}>
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
                        className={`sortable ${viewSort?.field === col.key ? 'sorted' : ''} ${isFrozen ? 'col-frozen' : ''} ${isLastFrozen ? 'col-frozen-edge' : ''} ${!isFrozen && draggedColKey === col.key ? 'col-dragging' : ''} ${!isFrozen && dragOverColKey === col.key && draggedColKey && draggedColKey !== col.key ? 'col-drag-over' : ''}`}
                        style={isFrozen ? { left: getFrozenLeft(col.key), zIndex: 3 } : undefined}
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                        <span className="sort-arrow">{viewSort?.field === col.key && viewSort.direction === 'desc' ? '▴' : '▾'}</span>
                        <ColumnResizeHandle onMouseDown={(e) => startResize(col.key, e)} />
                      </th>
                    );
                  })}
                  {visibleCustomFields.map((field) => (
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
              {viewType === 'list'
                ? listSections.map((section) => (
                    <tbody key={section.key}>
                      <tr className="list-section-row">
                        <td colSpan={totalColumnCount} className="list-section-header" onClick={() => toggleListSection(section.key)}>
                          <ChevronDownIcon
                            className={`list-chevron ${collapsedListSections.has(section.key) ? '' : 'list-chevron-open'}`}
                          />
                          {section.color && <span className="dot" style={{ background: section.color }} />}
                          <span className="list-section-label">{section.label}</span>
                          <span className="cnt">{section.items.length}</span>
                        </td>
                      </tr>
                      {!collapsedListSections.has(section.key) && section.items.map(renderContactRow)}
                      {!collapsedListSections.has(section.key) && ghostAddRow}
                    </tbody>
                  ))
                : (
                    <tbody>
                      {pagedContacts.map(renderContactRow)}
                      {ghostAddRow}
                    </tbody>
                  )}
            </table>
          </div>
          <HorizontalScrollbar targetRef={tableWrapRef} />
          {viewType !== 'list' && <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />}
        </>
      )}
    </div>
  );
}
