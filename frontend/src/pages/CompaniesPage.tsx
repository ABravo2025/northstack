import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import CsvImportExportMenu from '../components/entity-views/CsvImportExportMenu';
import { useResizableColumns } from '../hooks/useResizableColumns';
import ColumnVisibilityMenu from '../components/entity-views/ColumnVisibilityMenu';
import MultiSelectDropdown from '../components/common/MultiSelectDropdown';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { useColumnOrder } from '../hooks/useColumnOrder';
import Avatar, { getInitials } from '../components/common/Avatar';
import StatusChip from '../components/common/StatusChip';
import CategoryChip from '../components/common/CategoryChip';
import CompanyDetailModal from '../components/crm/CompanyDetailModal';
import HorizontalScrollbar from '../components/entity-views/HorizontalScrollbar';
import Field from '../components/common/Field';
import { BuildingIcon, ChevronDownIcon, PlusIcon, SearchIcon, TrashIcon } from '../components/common/Icons';
import { applyFilters, applySort, buildCompanyFields, findField, groupableFields, parseFilters, parseSort } from '../lib/viewFields';
import { isLikelyValidEmail } from '../lib/validation';
import { useAutoCreateGuard } from '../hooks/useAutoCreateGuard';
import { usePermissions } from '../contexts/PermissionsContext';
import { usePrimaryAction } from '../contexts/PrimaryActionContext';

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
  const { t } = useTranslation('crm');
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [deleteLinkedOpportunities, setDeleteLinkedOpportunities] = useState(false);
  const [cascadeToChildCompanies, setCascadeToChildCompanies] = useState(false);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [companyCustomFields, setCompanyCustomFields] = useState<any[]>([]);
  const [companyStatuses, setCompanyStatuses] = useState<any[]>([]);
  const [companySizes, setCompanySizes] = useState<any[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [companyForm, setCompanyForm] = useState(emptyCompanyForm);
  const autoCreateGuard = useAutoCreateGuard();
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(null);
  const sentCompanyCustomFieldIds = useRef<Set<string>>(new Set());
  const [draggedColKey, setDraggedColKey] = useState<string | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);
  const [collapsedListSections, setCollapsedListSections] = useState<Set<string>>(new Set());

  const [views, setViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY),
  );
  const [viewFilters, setViewFilters] = useState<ViewFilter[]>([]);
  const [viewSort, setViewSort] = useState<ViewSort | null>(null);

  // Custom Roles Fase J — migrated off `user.role === 'owner'/'admin'`. Real backend gates:
  // canManageCustomFields -> manage_custom_fields (status/size catalog menus, shared views);
  // canEditCompanies -> manage_company (add/edit/delete records, kanban move); export/import CSV
  // split further below since the backend gates them by 2 different permissions
  // (view_company/manage_company), unlike Employee's single manage_payroll gate.
  const permissions = usePermissions();
  const canManageCustomFields = permissions.has('manage_custom_fields');
  const canEditCompanies = permissions.has('manage_company');
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

  // Deep-link from another page (Payments overview's "open detail" link, spec-payments-v1.md
  // Unit 3) — read once and clear, same pattern as IntegrationsSettingsPage's
  // googleCalendarConnected query param. Doesn't wait for `companies` to load: setting the id
  // now just means the detail modal renders once the list arrives, same as any other navigation.
  useEffect(() => {
    const openId = searchParams.get('open');
    if (openId) {
      setViewingCompanyId(openId);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      toast.error(t('companies.toasts.loadFailed', { error: (error as Error).message }));
    } finally {
      setLoading(false);
    }
  };

  const loadCompanyStatuses = async () => {
    try {
      const statuses = await api.listStatusDefinitions(token, 'company');
      setCompanyStatuses(statuses);
    } catch (error) {
      toast.error(t('companies.toasts.statusesLoadFailed', { error: (error as Error).message }));
    }
  };

  const loadCompanySizes = async () => {
    try {
      const sizes = await api.listFieldCatalogDefinitions(token, 'companySize');
      setCompanySizes(sizes);
    } catch (error) {
      toast.error(t('companies.toasts.sizesLoadFailed', { error: (error as Error).message }));
    }
  };

  const loadViews = async () => {
    try {
      const data = await api.listViews(token, 'company');
      setViews(data);
    } catch (error) {
      toast.error(t('companies.toasts.viewsLoadFailed', { error: (error as Error).message }));
    }
  };

  const loadCompanyCustomFields = async () => {
    try {
      const defs = await api.listCustomFieldDefinitions(token, 'company');
      setCompanyCustomFields(defs);
    } catch (error) {
      toast.error(t('companies.toasts.customFieldsLoadFailed', { error: (error as Error).message }));
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
      toast.success(t('companies.toasts.fieldAdded', { name: input.name }));
      loadCompanyCustomFields();
    } catch (error) {
      toast.error(t('companies.toasts.fieldAddFailed', { error: (error as Error).message }));
    }
  };

  const handleUpdateCustomFieldColumn = async (
    id: string,
    data: { name?: string; required?: boolean; options?: string },
  ) => {
    try {
      await api.updateCustomFieldDefinition(token, id, data);
      toast.success(t('companies.toasts.fieldUpdated'));
      loadCompanyCustomFields();
    } catch (error) {
      toast.error(t('companies.toasts.fieldUpdateFailed', { error: (error as Error).message }));
    }
  };

  const handleDeactivateCustomFieldColumn = async (id: string) => {
    try {
      await api.updateCustomFieldDefinition(token, id, { isActive: false });
      toast.success(t('companies.toasts.fieldDeleted'));
      loadCompanyCustomFields();
    } catch (error) {
      toast.error(t('companies.toasts.fieldDeleteFailed', { error: (error as Error).message }));
    }
  };

  const closeSlideOver = () => {
    setSlideOverMode(null);
    setCustomFieldValues({});
    autoCreateGuard.reset();
    setCreatedCompanyId(null);
    sentCompanyCustomFieldIds.current = new Set();
  };

  const handleOpenAdd = () => {
    setCompanyForm(emptyCompanyForm);
    setCustomFieldValues({});
    autoCreateGuard.reset();
    setCreatedCompanyId(null);
    sentCompanyCustomFieldIds.current = new Set();
    setSlideOverMode('add');
  };

  usePrimaryAction({ label: t('companies.primaryAction'), onClick: handleOpenAdd });

  // Ready once Name + the founding contact's 3 fields (a Company can't be
  // created without one — see emptyCompanyForm above) + any required custom
  // field are filled/valid.
  const isCompanyAddReady = (cfValues: Record<string, string> = customFieldValues) => {
    if (!companyForm.name.trim()) return false;
    if (!companyForm.contactFirstName.trim() || !companyForm.contactLastName.trim()) return false;
    if (!isLikelyValidEmail(companyForm.contactEmail)) return false;
    for (const field of activeCompanyCustomFields) {
      if (field.required && !(cfValues[field.id] || '').trim()) return false;
    }
    return true;
  };

  // Mirrors EmployeesPage's jumpToEmployeePage — a newly created company can
  // land on any page once merged into the current search/filter/sort.
  const jumpToCompanyPage = (list: Company[], companyId: string) => {
    const query = search.trim().toLowerCase();
    const searchFiltered = list.filter((company) => {
      if (!query) return true;
      return (
        company.name.toLowerCase().includes(query) ||
        (company.industry ?? '').toLowerCase().includes(query) ||
        (company.website ?? '').toLowerCase().includes(query)
      );
    });
    const tagFiltered =
      selectedTagFilter.length === 0
        ? searchFiltered
        : searchFiltered.filter((company: any) => (company.tags || []).some((t: any) => selectedTagFilter.includes(t.name)));
    const filtered = applyFilters(tagFiltered, fields, viewFilters);
    const sorted = applySort(filtered, fields, viewSort);
    const index = sorted.findIndex((c) => c.id === companyId);
    if (index !== -1) setPage(Math.floor(index / PAGE_SIZE) + 1);
  };

  // Fires in the background as soon as the required fields are ready —
  // a safety net against losing the form's work, not the point where the
  // user is "done". Does NOT close the Add form or navigate anywhere; the
  // user keeps filling in the rest of the fields, and finishCompany (the
  // real "Create" button) is what closes the form once they're actually done
  // (backlog QA, 2026-08-27 — see useAutoCreateGuard.ts).
  const createCompanyRecord = async (cfValues: Record<string, string> = customFieldValues) => {
    const company = await api.createCompany(token, {
      name: companyForm.name.trim(),
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

    const valueEntries = Object.entries(cfValues).filter(([, value]) => value.trim() !== '');
    for (const [customFieldDefinitionId, value] of valueEntries) {
      await api.createCompanyCustomFieldValue(token, company.id, { customFieldDefinitionId, value });
      sentCompanyCustomFieldIds.current.add(customFieldDefinitionId);
    }

    // The founding contact was just created server-side alongside the
    // company (createCompany's `contact` payload) — refresh contacts too, or
    // CompanyDetailModal's "Contacts" section would show it as empty until
    // some later, unrelated refresh happened to run.
    api.listContacts(token).then(setContacts).catch(() => {});
    setCreatedCompanyId(company.id);
    return company;
  };

  // PATCHes the record createCompanyRecord already persisted, with whatever
  // the user filled in afterward. Custom field values only get a create call
  // for definitions not already sent at auto-create time (changing a value
  // already sent isn't handled here — same accepted gap as Opportunity's).
  const updateCompanyRecord = async (companyId: string, cfValues: Record<string, string>) => {
    await api.updateCompany(token, companyId, {
      name: companyForm.name.trim(),
      industry: companyForm.industry || undefined,
      website: companyForm.website || undefined,
      phone: companyForm.phone || undefined,
      billingAddress: companyForm.billingAddress || undefined,
      sizeId: companyForm.sizeId || undefined,
      accountOwnerId: companyForm.accountOwnerId || undefined,
    });
    const newEntries = Object.entries(cfValues).filter(
      ([id, value]) => value.trim() !== '' && !sentCompanyCustomFieldIds.current.has(id),
    );
    for (const [customFieldDefinitionId, value] of newEntries) {
      await api.createCompanyCustomFieldValue(token, companyId, { customFieldDefinitionId, value });
      sentCompanyCustomFieldIds.current.add(customFieldDefinitionId);
    }
  };

  const attemptAutoCreateCompany = (cfValues: Record<string, string> = customFieldValues) => {
    autoCreateGuard.attempt(isCompanyAddReady(cfValues), async () => {
      try {
        await createCompanyRecord(cfValues);
      } catch (error) {
        toast.error(t('companies.toasts.companyCreateFailed', { error: (error as Error).message }));
        throw error;
      }
    });
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let id = createdCompanyId;
      if (id) {
        await updateCompanyRecord(id, customFieldValues);
      } else {
        const company = await createCompanyRecord(customFieldValues);
        id = company.id;
      }
      toast.success(t('companies.toasts.companyAdded'));
      const [freshList] = await Promise.all([
        api.listCompanies(token),
        api.listContacts(token).then(setContacts).catch(() => {}),
      ]);
      setCompanies(freshList);
      jumpToCompanyPage(freshList, id);
      setSlideOverMode(null);
      setCreatedCompanyId(null);
      setCustomFieldValues({});
      setViewingCompanyId(id);
    } catch (error) {
      toast.error(t('companies.toasts.companyCreateFailed', { error: (error as Error).message }));
    }
  };

  const handleDeleteCompany = async () => {
    if (!deletingCompany) return;
    try {
      await api.deleteCompany(token, deletingCompany.id, { deleteLinkedOpportunities, cascadeToChildCompanies });
      toast.success(t('companies.toasts.companyDeleted', { name: deletingCompany.name }));
      setDeletingCompany(null);
      setDeleteLinkedOpportunities(false);
      setCascadeToChildCompanies(false);
      refreshAssociatedData();
    } catch (error) {
      toast.error(t('companies.toasts.companyDeleteFailed', { error: (error as Error).message }));
      setDeletingCompany(null);
      setDeleteLinkedOpportunities(false);
      setCascadeToChildCompanies(false);
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
          <option value="">{t('common.selectPlaceholder')}</option>
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

  const searchFilteredCompanies = companies.filter((company) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      company.name.toLowerCase().includes(query) ||
      (company.industry ?? '').toLowerCase().includes(query) ||
      (company.website ?? '').toLowerCase().includes(query)
    );
  });

  const tagFilteredCompanies =
    selectedTagFilter.length === 0
      ? searchFilteredCompanies
      : searchFilteredCompanies.filter((company: any) => (company.tags || []).some((t: any) => selectedTagFilter.includes(t.name)));

  const viewFilteredCompanies = applyFilters(tagFilteredCompanies, fields, viewFilters);
  const sortedCompanies = applySort(viewFilteredCompanies, fields, viewSort);

  const pageCount = Math.max(1, Math.ceil(sortedCompanies.length / PAGE_SIZE));
  const pagedCompanies = paginate(sortedCompanies, page, PAGE_SIZE);

  const allTagOptions = useMemo(
    () =>
      Array.from(new Set(companies.flatMap((company: any) => (company.tags || []).map((t: any) => t.name))))
        .sort()
        .map((name) => ({ value: name, label: name })),
    [companies],
  );

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
      toast.error(t('companies.kanbanStatusError'));
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
      toast.error(t('companies.toasts.moveFailed', { error: (error as Error).message }));
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
      toast.success(t('companies.toasts.viewCreated', { name: view.name }));
    } catch (error) {
      toast.error(t('companies.toasts.viewCreateFailed', { error: (error as Error).message }));
    }
  };

  const handleRenameView = async (id: string, name: string) => {
    try {
      const updated = await api.updateView(token, id, { name });
      setViews((current) => current.map((v) => (v.id === id ? updated : v)));
    } catch (error) {
      toast.error(t('companies.toasts.viewRenameFailed', { error: (error as Error).message }));
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
      toast.success(t('companies.toasts.viewDuplicated', { name: created.name }));
    } catch (error) {
      toast.error(t('companies.toasts.viewDuplicateFailed', { error: (error as Error).message }));
    }
  };

  const handleDeleteView = async (id: string) => {
    try {
      await api.deleteView(token, id);
      setViews((current) => current.filter((v) => v.id !== id));
      if (activeViewId === id) setActiveViewId(null);
      toast.success(t('companies.toasts.viewDeleted'));
    } catch (error) {
      toast.error(t('companies.toasts.viewDeleteFailed', { error: (error as Error).message }));
    }
  };

  const columns = [
    {
      key: 'name',
      label: t('companies.columns.name'),
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
      label: t('companies.columns.status'),
      render: (company: Company) =>
        company.statusDefn && <StatusChip color={company.statusDefn.color || '#6b7280'} label={company.statusDefn.name} />,
    },
    { key: 'industry', label: t('companies.columns.industry'), render: (company: Company) => company.industry || '—' },
    {
      key: 'website',
      label: t('companies.columns.website'),
      render: (company: Company) =>
        company.website ? (
          <a href={company.website} target="_blank" rel="noopener noreferrer" className="table-link">
            {company.website}
          </a>
        ) : (
          '—'
        ),
    },
    { key: 'phone', label: t('companies.columns.phone'), render: (company: Company) => company.phone || '—' },
    { key: 'size', label: t('companies.columns.size'), render: (company: Company) => company.sizeDefn?.name || '—' },
    {
      key: 'accountOwner',
      label: t('companies.columns.accountOwner'),
      render: (company: Company) =>
        company.accountOwner ? `${company.accountOwner.firstName} ${company.accountOwner.lastName}` : '—',
    },
    {
      key: 'tags',
      label: t('companies.columns.tags'),
      render: (company: any) =>
        company.tags && company.tags.length > 0 ? (
          <div className="flex flex-wrap items-center">
            {company.tags.map((tag: any) => (
              <span key={tag.tagAssignmentId} className="time-off-policy-chip">
                {tag.name}
              </span>
            ))}
          </div>
        ) : (
          '—'
        ),
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
            <span className="tip">{t('companies.deleteTooltip')}</span>
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
          {t('common.add')}
        </span>
      </td>
    </tr>
  );

  return (
    <div className="page-full">
      {deletingCompany && (() => {
        const linkedContacts = contacts.filter((c) => c.companyId === deletingCompany.id);
        const linkedOpportunities = opportunities.filter((o) => o.companyId === deletingCompany.id);
        const childCompanies = companies.filter((c) => c.parentCompanyId === deletingCompany.id);
        const messageParts = [t('companies.confirmDelete.message', { name: deletingCompany.name })];
        if (linkedContacts.length > 0) {
          messageParts.push(
            t('companies.confirmDelete.linkedContactsNote', {
              count: linkedContacts.length,
              names: linkedContacts.map((c) => `${c.firstName} ${c.lastName}`).join(', '),
            }),
          );
        }
        if (linkedOpportunities.length > 0) {
          messageParts.push(
            t('companies.confirmDelete.linkedOpportunitiesNote', {
              count: linkedOpportunities.length,
              names: linkedOpportunities.map((o) => o.name).join(', '),
            }),
          );
        }
        if (childCompanies.length > 0) {
          messageParts.push(
            t('companies.confirmDelete.childCompaniesNote', {
              count: childCompanies.length,
              names: childCompanies.map((c) => c.name).join(', '),
            }),
          );
        }
        const checkboxes = [
          linkedOpportunities.length > 0 && {
            label: t('companies.confirmDelete.alsoDeleteOpportunities', { count: linkedOpportunities.length }),
            checked: deleteLinkedOpportunities,
            onChange: setDeleteLinkedOpportunities,
          },
          childCompanies.length > 0 && {
            label: t('companies.confirmDelete.applySameDeleteChildCompanies', { count: childCompanies.length }),
            checked: cascadeToChildCompanies,
            onChange: setCascadeToChildCompanies,
          },
        ].filter(Boolean) as { label: string; checked: boolean; onChange: (checked: boolean) => void }[];
        return (
          <ConfirmDialog
            title={t('companies.confirmDelete.title')}
            message={messageParts.join(' ')}
            confirmLabel={t('common.delete')}
            confirmDisabled={linkedOpportunities.length > 0 && !deleteLinkedOpportunities}
            checkboxes={checkboxes.length > 0 ? checkboxes : undefined}
            onConfirm={handleDeleteCompany}
            onCancel={() => {
              setDeletingCompany(null);
              setDeleteLinkedOpportunities(false);
              setCascadeToChildCompanies(false);
            }}
          />
        );
      })()}

      <Modal
        open={slideOverMode === 'add'}
        title={t('companies.modal.addTitle')}
        onClose={closeSlideOver}
        wide
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeSlideOver}>
              {t('common.cancel')}
            </button>
            <button type="submit" form="company-form" className="btn-primary" disabled={autoCreateGuard.isBusy}>
              {t('common.create')}
            </button>
          </>
        }
      >
        {slideOverMode === 'add' && (
          <form id="company-form" onSubmit={handleCreateCompany}>
            <div className="field-group">
              <h4 className="field-group-title">{t('companies.groups.identity')}</h4>
              <div className="field-group-body">
                <Field label={t('companies.fields.name')} required full>
                  <input
                    id="company-name"
                    className="overview-field-input"
                    type="text"
                    value={companyForm.name}
                    onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                    onBlur={() => attemptAutoCreateCompany()}
                    required
                  />
                </Field>
                <Field label={t('companies.fields.industry')}>
                  <input
                    id="company-industry"
                    className="overview-field-input"
                    type="text"
                    value={companyForm.industry}
                    onChange={(e) => setCompanyForm({ ...companyForm, industry: e.target.value })}
                  />
                </Field>
                <Field label={t('companies.fields.website')}>
                  <input
                    id="company-website"
                    className="overview-field-input"
                    type="url"
                    value={companyForm.website}
                    onChange={(e) => setCompanyForm({ ...companyForm, website: e.target.value })}
                    placeholder="https://example.com"
                  />
                </Field>
                <Field label={t('companies.fields.phone')}>
                  <input
                    id="company-phone"
                    className="overview-field-input"
                    type="text"
                    value={companyForm.phone}
                    onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                  />
                </Field>
              </div>
            </div>

            <div className="field-group">
              <h4 className="field-group-title">{t('companies.groups.foundingContact')}</h4>
              <div className="field-group-body">
                <Field label={t('companies.fields.firstName')} required>
                  <input
                    id="company-contact-firstName"
                    className="overview-field-input"
                    type="text"
                    value={companyForm.contactFirstName}
                    onChange={(e) => setCompanyForm({ ...companyForm, contactFirstName: e.target.value })}
                    onBlur={() => attemptAutoCreateCompany()}
                    required
                  />
                </Field>
                <Field label={t('companies.fields.lastName')} required>
                  <input
                    id="company-contact-lastName"
                    className="overview-field-input"
                    type="text"
                    value={companyForm.contactLastName}
                    onChange={(e) => setCompanyForm({ ...companyForm, contactLastName: e.target.value })}
                    onBlur={() => attemptAutoCreateCompany()}
                    required
                  />
                </Field>
                <Field label={t('companies.fields.email')} required full>
                  <input
                    id="company-contact-email"
                    className="overview-field-input"
                    type="email"
                    value={companyForm.contactEmail}
                    onChange={(e) => setCompanyForm({ ...companyForm, contactEmail: e.target.value })}
                    onBlur={() => attemptAutoCreateCompany()}
                    required
                  />
                </Field>
              </div>
            </div>

            <div className="field-group">
              <h4 className="field-group-title">{t('companies.groups.address')}</h4>
              <div className="field-group-body">
                <Field label={t('companies.fields.billingAddress')} full>
                  <input
                    id="company-billingAddress"
                    className="overview-field-input"
                    type="text"
                    value={companyForm.billingAddress}
                    onChange={(e) => setCompanyForm({ ...companyForm, billingAddress: e.target.value })}
                  />
                </Field>
              </div>
            </div>

            <div className="field-group">
              <h4 className="field-group-title">{t('companies.groups.ownership')}</h4>
              <div className="field-group-body">
                <Field label={t('companies.fields.size')}>
                  <select
                    id="company-sizeId"
                    className="overview-field-input"
                    value={companyForm.sizeId}
                    onChange={(e) => setCompanyForm({ ...companyForm, sizeId: e.target.value })}
                  >
                    <option value="">{t('common.nonePlaceholder')}</option>
                    {companySizes
                      .filter((s) => s.isActive)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label={t('companies.fields.accountOwner')}>
                  <select
                    id="company-accountOwnerId"
                    className="overview-field-input"
                    value={companyForm.accountOwnerId}
                    onChange={(e) => setCompanyForm({ ...companyForm, accountOwnerId: e.target.value })}
                  >
                    <option value="">{t('common.nonePlaceholder')}</option>
                    {tenantUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            {activeCompanyCustomFields.length > 0 && (
              <div className="field-group">
                <h4 className="field-group-title">{t('companies.groups.customFields')}</h4>
                <div className="field-group-body">
                  {activeCompanyCustomFields.map((field) => (
                    <Field key={field.id} label={field.name} required={field.required}>
                      {renderCustomFieldInput(
                        field,
                        customFieldValues,
                        setCustomFieldValues,
                        'company-cf',
                        (next) => attemptAutoCreateCompany(next),
                      )}
                    </Field>
                  ))}
                </div>
              </div>
            )}
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
              canManagePayments={permissions.has('manage_payments')}
              companies={companies}
              token={token}
              tenantUsers={tenantUsers}
              contacts={contacts}
              opportunities={opportunities}
              pipelines={pipelines}
              customFields={activeCompanyCustomFields}
              companySizes={companySizes}
              tenantCurrency={tenantCurrency}
              currentUserId={user.id}
              onNavigate={(companyId) => setViewingCompanyId(companyId)}
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
        allLabel={t('companies.toolbar.allCompanies')}
        views={views}
        activeViewId={activeViewId}
        onSelectView={setActiveViewId}
        canCreateShared={canManageCustomFields}
        canDeleteShared={(view) => view.createdByUserId === user.id || permissions.isOwner}
        groupableFields={groupable}
        onCreateView={handleCreateView}
        onRenameView={handleRenameView}
        onDuplicateView={handleDuplicateView}
        onDeleteView={handleDeleteView}
      />

      <div className="page-toolbar">
        <h2>{t('companies.toolbar.heading')}</h2>
        {companies.length > 0 && (
          <div className="toolbar-search">
            <SearchIcon />
            <label htmlFor="company-search" className="sr-only">
              {t('companies.toolbar.searchLabel')}
            </label>
            <input
              id="company-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('companies.toolbar.searchPlaceholder')}
            />
          </div>
        )}
        {allTagOptions.length > 0 && (
          <MultiSelectDropdown
            id="company-tag-filter"
            options={allTagOptions}
            selected={selectedTagFilter}
            onChange={setSelectedTagFilter}
            placeholder={t('companies.toolbar.filterByTag')}
            emptyMessage={t('companies.toolbar.noTagsYet')}
          />
        )}
        {viewType !== 'kanban' && <FilterBar fields={fields} filters={viewFilters} onChange={setViewFilters} />}
        {viewType !== 'kanban' && (
          <ColumnVisibilityMenu columns={toggleableColumns} isHidden={isColumnHidden} onToggle={toggleColumn} />
        )}
        {(permissions.has('view_company') || canEditCompanies) && (
          <CsvImportExportMenu
            token={token}
            onImported={loadCompanies}
            entityLabelPlural={t('companies.toolbar.csvPlural')}
            entityLabelSingular={t('companies.toolbar.csvSingular')}
            exportCsv={api.exportCompaniesCsv}
            importCsv={api.importCompaniesCsv}
            csvTemplate={api.companiesCsvTemplate}
            // Backend gates export by view_company and import/template by manage_company
            // separately (routes/companies.ts) — not the same single permission.
            canExport={permissions.has('view_company')}
            canImport={canEditCompanies}
          />
        )}
        {showAddFallback && (
          <button className="btn-primary" onClick={handleOpenAdd}>
            <span className="inline-flex items-center gap-1.5">
              <PlusIcon className="h-4 w-4" />
              {t('common.add')}
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
            title={t('companies.emptyState.title')}
            body={t('companies.emptyState.body')}
            primaryLabel={t('companies.emptyState.primaryLabel')}
            onPrimary={handleOpenAdd}
          />
        ) : (
          <p className="mt-4">{t('companies.emptyState.plain')}</p>
        )
      ) : viewType === 'kanban' ? (
        !groupFieldForKanban ? (
          <p className="mt-4">{t('companies.groupByBroken')}</p>
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
                      {t('common.add')}
                    </div>
                  )
                : undefined
            }
          />
        )
      ) : viewType === 'list' && !groupFieldForKanban ? (
        <p className="mt-4">{t('companies.groupByBroken')}</p>
      ) : sortedCompanies.length === 0 ? (
        <EmptyState
          icon={<SearchIcon />}
          title={t('companies.noMatches.title', { search })}
          body={t('companies.noMatches.body')}
          primaryLabel={t('companies.noMatches.clearFilters')}
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
                            label={t('companies.fields.size')}
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
