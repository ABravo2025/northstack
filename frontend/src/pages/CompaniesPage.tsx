import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Company, type Contact, type Opportunity, type Pipeline, type SavedView, type ViewFilter, type ViewSort } from '../api';
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
import StatusColumnMenu from '../components/entity-views/StatusColumnMenu';
import FieldCatalogMenu from '../components/entity-views/FieldCatalogMenu';
import ColumnResizeHandle from '../components/entity-views/ColumnResizeHandle';
import { useResizableColumns } from '../hooks/useResizableColumns';
import ColumnVisibilityMenu from '../components/entity-views/ColumnVisibilityMenu';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { useColumnOrder } from '../hooks/useColumnOrder';
import Avatar, { getInitials } from '../components/common/Avatar';
import StatusChip from '../components/common/StatusChip';
import CategoryChip from '../components/common/CategoryChip';
import CompanyDetailModal from '../components/crm/CompanyDetailModal';
import HorizontalScrollbar from '../components/entity-views/HorizontalScrollbar';
import { BuildingIcon, ChevronDownIcon, PlusIcon, SearchIcon, TrashIcon } from '../components/common/Icons';
import { applyFilters, applySort, buildCompanyFields, findField, groupableFields, parseFilters, parseSort } from '../lib/viewFields';

const PAGE_SIZE = 20;
const ACTIVE_VIEW_STORAGE_KEY = 'northstack:activeView:company';
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
  sizeId: '',
  accountOwnerId: '',
  // A Company can't be created without a founding Contact — confirmed
  // business rule, not just a form nicety (see docs/tareas-desarrollo.md,
  // Checkpoint E). Required alongside Name in the same step.
  contactFirstName: '',
  contactLastName: '',
  contactEmail: '',
};

export default function CompaniesPage({ user, token }: CompaniesPageProps) {
  const toast = useToast();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [tenantUsers, setTenantUsers] = useState<any[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [tenantCurrency, setTenantCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [slideOverMode, setSlideOverMode] = useState<'add' | null>(null);
  const [viewingCompanyId, setViewingCompanyId] = useState<string | null>(null);
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [deleteLinkedOpportunities, setDeleteLinkedOpportunities] = useState(false);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [companyCustomFields, setCompanyCustomFields] = useState<any[]>([]);
  const [companyStatuses, setCompanyStatuses] = useState<any[]>([]);
  const [companySizes, setCompanySizes] = useState<any[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
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
  const canEditCompanies = user.role === 'owner' || user.role === 'admin';
  const columnStorageSuffix = activeViewId ?? 'default';
  const { getWidth: getColumnWidth, startResize } = useResizableColumns(
    `northstack:columnWidths:company:${columnStorageSuffix}`,
  );
  const { isHidden: isColumnHidden, toggle: toggleColumn, hide: hideColumn } = useColumnVisibility(
    `northstack:hiddenColumns:company:${columnStorageSuffix}`,
  );
  const activeCompanyCustomFields = companyCustomFields.filter((field) => field.isActive);

  const fields = useMemo(
    () => buildCompanyFields(companyStatuses, companyCustomFields, companySizes),
    [companyStatuses, companyCustomFields, companySizes],
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
    loadCompanies();
    loadCompanyCustomFields();
    loadCompanyStatuses();
    loadCompanySizes();
    loadViews();
    api
      .listTenantUsers(token)
      .then(setTenantUsers)
      .catch(() => {
        // Non-critical — the account owner dropdown just falls back to empty if it fails.
      });
    api.listContacts(token).then(setContacts).catch(() => {});
    api.listOpportunities(token).then(setOpportunities).catch(() => {});
    api.listPipelines(token).then(setPipelines).catch(() => {});
    api.getCurrentTenant(token).then((tenant) => setTenantCurrency(tenant.currency)).catch(() => {});
  }, []);

  // Silent refresh (no setLoading) — a loud loadCompanies() here would flash
  // the whole table behind an open CompanyDetailModal on every field/custom
  // field/linked-record change, same class of bug found 2026-07-30 in the
  // Employee panel. Matches the pattern OpportunitiesPage.tsx already used.
  const refreshAssociatedData = () => {
    api.listCompanies(token).then(setCompanies).catch(() => {});
    api.listContacts(token).then(setContacts).catch(() => {});
    api.listOpportunities(token).then(setOpportunities).catch(() => {});
  };

  // Instant row update from a PATCH response, no round-trip (found
  // 2026-07-30: the silent-refetch fix above updated the row eventually, but
  // not fast enough). Merged onto the existing row since updateCompany's
  // response doesn't include customFieldVals the way listCompanies does.
  const patchCompanyInList = (updated: Company) => {
    setCompanies((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
  };

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

  const loadCompanyStatuses = async () => {
    try {
      const statuses = await api.listStatusDefinitions(token, 'company');
      setCompanyStatuses(statuses);
    } catch (error) {
      toast.error('Failed to load statuses: ' + (error as Error).message);
    }
  };

  const loadCompanySizes = async () => {
    try {
      const sizes = await api.listFieldCatalogDefinitions(token, 'companySize');
      setCompanySizes(sizes);
    } catch (error) {
      toast.error('Failed to load company sizes: ' + (error as Error).message);
    }
  };

  const loadViews = async () => {
    try {
      const data = await api.listViews(token, 'company');
      setViews(data);
    } catch (error) {
      toast.error('Failed to load views: ' + (error as Error).message);
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
    setCustomFieldValues({});
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
        sizeId: companyForm.sizeId || undefined,
        accountOwnerId: companyForm.accountOwnerId || undefined,
        contact: {
          firstName: companyForm.contactFirstName.trim(),
          lastName: companyForm.contactLastName.trim(),
          email: companyForm.contactEmail.trim(),
        },
      });

      const valueEntries = Object.entries(customFieldValues).filter(([, value]) => value.trim() !== '');
      for (const [customFieldDefinitionId, value] of valueEntries) {
        await api.createCompanyCustomFieldValue(token, company.id, { customFieldDefinitionId, value });
      }

      toast.success(`${company.name} added.`);
      closeSlideOver();
      refreshAssociatedData();
    } catch (error) {
      toast.error('Failed to create company: ' + (error as Error).message);
    }
  };

  const handleDeleteCompany = async () => {
    if (!deletingCompany) return;
    try {
      await api.deleteCompany(token, deletingCompany.id, { deleteLinkedOpportunities });
      toast.success(`${deletingCompany.name} deleted.`);
      setDeletingCompany(null);
      setDeleteLinkedOpportunities(false);
      refreshAssociatedData();
    } catch (error) {
      toast.error('Failed to delete company: ' + (error as Error).message);
      setDeletingCompany(null);
      setDeleteLinkedOpportunities(false);
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

  const viewFilteredCompanies = applyFilters(searchFilteredCompanies, fields, viewFilters);
  const sortedCompanies = applySort(viewFilteredCompanies, fields, viewSort);

  const pageCount = Math.max(1, Math.ceil(sortedCompanies.length / PAGE_SIZE));
  const pagedCompanies = paginate(sortedCompanies, page, PAGE_SIZE);

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

  const handleKanbanMove = async (company: Company, newValue: string) => {
    const groupField = activeView?.groupByField;
    if (!groupField) return;
    if (groupField === 'status') {
      toast.error("A Company's status is derived automatically from deal outcomes — it can't be set by hand.");
      return;
    }
    if (!groupField.startsWith('cf:')) return;
    try {
      const definitionId = groupField.slice(3);
      const existing = company.customFieldVals?.find((v) => v.customFieldDefinitionId === definitionId);
      if (existing) {
        await api.updateCompanyCustomFieldValue(token, company.id, existing.id, newValue);
      } else {
        await api.createCompanyCustomFieldValue(token, company.id, { customFieldDefinitionId: definitionId, value: newValue });
      }
      loadCompanies();
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
      const view = await api.createView(token, { entityType: 'company', ...input });
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
        entityType: 'company',
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
      render: (company: Company) => (
        <div className="name-cell">
          <Avatar firstName={company.name} lastName="" />
          <button type="button" className="name-link" onClick={() => setViewingCompanyId(company.id)}>
            {company.name}
          </button>
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
    { key: 'size', label: 'Size', render: (company: Company) => company.sizeDefn?.name || '—' },
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
    `northstack:columnOrder:company:${columnStorageSuffix}`,
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

  const groupFieldForKanban = activeView?.groupByField ? findField(fields, activeView.groupByField) : undefined;
  const groupByBroken = (viewType === 'kanban' || viewType === 'list') && !groupFieldForKanban;
  const noResultsInGridOrList = viewType !== 'kanban' && sortedCompanies.length === 0;
  const showAddFallback = canEditCompanies && companies.length > 0 && (groupByBroken || noResultsInGridOrList);

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
        const byValue = new Map<string, Company[]>();
        for (const opt of groupFieldForKanban.selectOptions ?? []) byValue.set(opt.value, []);
        for (const company of sortedCompanies) {
          const value = groupFieldForKanban.getValue(company);
          if (!byValue.has(value)) byValue.set(value, []);
          byValue.get(value)!.push(company);
        }
        return Array.from(byValue.entries()).map(([value, items]) => ({
          key: value || '(none)',
          label: value || '(none)',
          color: groupFieldForKanban.selectOptions?.find((opt) => opt.value === value)?.color ?? null,
          items,
        }));
      })()
    : [];

  const renderCompanyRow = (company: Company) => (
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
        const fieldValue = company.customFieldVals?.find((v: any) => v.customFieldDefinitionId === field.id);
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
            onClick={() => {
              setDeletingCompany(company);
              setDeleteLinkedOpportunities(false);
            }}
          >
            <span className="tip">Delete</span>
            <TrashIcon />
          </button>
        </div>
      </td>
    </tr>
  );

  const ghostAddRow = canEditCompanies && (
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
      {deletingCompany && (() => {
        const linkedContacts = contacts.filter((c) => c.companyId === deletingCompany.id);
        const linkedOpportunities = opportunities.filter((o) => o.companyId === deletingCompany.id);
        const messageParts = [`Are you sure you want to delete ${deletingCompany.name}? This can't be undone.`];
        if (linkedContacts.length > 0) {
          messageParts.push(
            `${linkedContacts.length} contact(s) (${linkedContacts.map((c) => `${c.firstName} ${c.lastName}`).join(', ')}) will be unlinked — they stay, just without a company.`,
          );
        }
        if (linkedOpportunities.length > 0) {
          messageParts.push(
            `${linkedOpportunities.length} opportunity(ies) (${linkedOpportunities.map((o) => o.name).join(', ')}) can't exist without a company and will be deleted too.`,
          );
        }
        return (
          <ConfirmDialog
            title="Delete company"
            message={messageParts.join(' ')}
            confirmLabel="Delete"
            confirmDisabled={linkedOpportunities.length > 0 && !deleteLinkedOpportunities}
            checkboxLabel={
              linkedOpportunities.length > 0
                ? `Also delete ${linkedOpportunities.length} linked opportunity(ies)`
                : undefined
            }
            checkboxChecked={deleteLinkedOpportunities}
            onCheckboxChange={setDeleteLinkedOpportunities}
            onConfirm={handleDeleteCompany}
            onCancel={() => {
              setDeletingCompany(null);
              setDeleteLinkedOpportunities(false);
            }}
          />
        );
      })()}

      <Modal
        open={slideOverMode === 'add'}
        title="Add Company"
        onClose={closeSlideOver}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeSlideOver}>
              Cancel
            </button>
            <button type="submit" form="company-form" className="btn-primary">
              Create
            </button>
          </>
        }
      >
        {slideOverMode === 'add' && (
          <form id="company-form" onSubmit={handleCreateCompany}>
            <div className="form-group">
              <label htmlFor="company-name">Name</label>
              <input
                id="company-name"
                type="text"
                value={companyForm.name}
                onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                required
              />
            </div>

            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mt-2 mb-1">
              Founding contact
            </p>
            <div className="form-group">
              <label htmlFor="company-contact-firstName">First Name</label>
              <input
                id="company-contact-firstName"
                type="text"
                value={companyForm.contactFirstName}
                onChange={(e) => setCompanyForm({ ...companyForm, contactFirstName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="company-contact-lastName">Last Name</label>
              <input
                id="company-contact-lastName"
                type="text"
                value={companyForm.contactLastName}
                onChange={(e) => setCompanyForm({ ...companyForm, contactLastName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="company-contact-email">Email</label>
              <input
                id="company-contact-email"
                type="email"
                value={companyForm.contactEmail}
                onChange={(e) => setCompanyForm({ ...companyForm, contactEmail: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="company-industry">Industry</label>
              <input
                id="company-industry"
                type="text"
                value={companyForm.industry}
                onChange={(e) => setCompanyForm({ ...companyForm, industry: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="company-website">Website</label>
              <input
                id="company-website"
                type="url"
                value={companyForm.website}
                onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })}
                placeholder="https://example.com"
              />
            </div>
            <div className="form-group">
              <label htmlFor="company-phone">Phone</label>
              <input
                id="company-phone"
                type="text"
                value={companyForm.phone}
                onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="company-billingAddress">Billing Address</label>
              <input
                id="company-billingAddress"
                type="text"
                value={companyForm.billingAddress}
                onChange={(e) => setCompanyForm({ ...companyForm, billingAddress: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="company-sizeId">Size</label>
              <select
                id="company-sizeId"
                value={companyForm.sizeId}
                onChange={(e) => setCompanyForm({ ...companyForm, sizeId: e.target.value })}
              >
                <option value="">-- none --</option>
                {companySizes
                  .filter((s) => s.isActive)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="company-accountOwnerId">Account Owner</label>
              <select
                id="company-accountOwnerId"
                value={companyForm.accountOwnerId}
                onChange={(e) => setCompanyForm({ ...companyForm, accountOwnerId: e.target.value })}
              >
                <option value="">-- none --</option>
                {tenantUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            </div>

            {activeCompanyCustomFields.map((field) => (
              <div className="form-group" key={field.id}>
                <label htmlFor={`company-cf-${field.id}`}>
                  {field.name}
                  {field.required ? ' *' : ''}
                </label>
                {renderCustomFieldInput(field, customFieldValues, setCustomFieldValues, 'company-cf')}
              </div>
            ))}
          </form>
        )}
      </Modal>

      {viewingCompanyId &&
        (() => {
          const viewingCompany = companies.find((c) => c.id === viewingCompanyId);
          if (!viewingCompany) return null;
          return (
            <CompanyDetailModal
              company={viewingCompany}
              token={token}
              tenantUsers={tenantUsers}
              contacts={contacts}
              opportunities={opportunities}
              pipelines={pipelines}
              customFields={activeCompanyCustomFields}
              companySizes={companySizes}
              tenantCurrency={tenantCurrency}
              currentUserId={user.id}
              onClose={() => setViewingCompanyId(null)}
              onChanged={refreshAssociatedData}
              onSaved={patchCompanyInList}
              onRequestDelete={() => {
                setViewingCompanyId(null);
                setDeletingCompany(viewingCompany);
                setDeleteLinkedOpportunities(false);
              }}
            />
          );
        })()}

      <ViewsBar
        allLabel="All Companies"
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
      ) : companies.length === 0 ? (
        canEditCompanies ? (
          <EmptyState
            icon={<BuildingIcon />}
            title="No companies yet"
            body="Add the companies you work with to start tracking deals and contacts."
            primaryLabel="Add company"
            onPrimary={handleOpenAdd}
          />
        ) : (
          <p className="mt-4">No companies yet.</p>
        )
      ) : viewType === 'kanban' ? (
        !groupFieldForKanban ? (
          <p className="mt-4">This view's group-by field no longer exists.</p>
        ) : (
          <KanbanBoard
            columns={groupFieldForKanban.selectOptions?.map((opt) => ({ key: opt.value, label: opt.value, color: opt.color })) ?? []}
            items={viewFilteredCompanies}
            getItemKey={(company) => company.id}
            getItemColumn={(company) => groupFieldForKanban.getValue(company)}
            onMove={canEditCompanies ? handleKanbanMove : () => {}}
            renderCard={(company) => (
              <div onClick={() => setViewingCompanyId(company.id)} style={{ cursor: 'pointer' }}>
                <div className="kc-name">{company.name}</div>
                <div className="kc-meta">{company.industry}</div>
              </div>
            )}
            renderColumnFooter={
              canEditCompanies
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
      ) : sortedCompanies.length === 0 ? (
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
            items={pagedCompanies}
            getKey={(company) => company.id}
            getInitials={(company) => getInitials(company.name, '')}
            getName={(company) => company.name}
            getMeta={(company) => company.industry || ''}
            getStatusColor={(company) => company.statusDefn?.color || '#6b7280'}
            onSelect={(company) => setViewingCompanyId(company.id)}
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
                        {col.key === 'status' && canManageCustomFields && (
                          <StatusColumnMenu
                            token={token}
                            entityType="company"
                            statuses={companyStatuses}
                            onChanged={loadCompanyStatuses}
                            onHide={() => hideColumn('status')}
                          />
                        )}
                        {col.key === 'size' && canManageCustomFields && (
                          <FieldCatalogMenu
                            token={token}
                            kind="companySize"
                            label="Size"
                            entries={companySizes}
                            onChanged={loadCompanySizes}
                            onHide={() => hideColumn('size')}
                          />
                        )}
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
                      {!collapsedListSections.has(section.key) && section.items.map(renderCompanyRow)}
                      {!collapsedListSections.has(section.key) && ghostAddRow}
                    </tbody>
                  ))
                : (
                    <tbody>
                      {pagedCompanies.map(renderCompanyRow)}
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
