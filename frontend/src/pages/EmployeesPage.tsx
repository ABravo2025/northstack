import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type SavedView, type ViewFilter, type ViewSort } from '../api';
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
import CsvImportExportMenu, { type CsvImportExportMenuHandle } from '../components/entity-views/CsvImportExportMenu';
import EmployeeOverviewPanel from '../components/hr/EmployeeOverviewPanel';
import HorizontalScrollbar from '../components/entity-views/HorizontalScrollbar';
import Avatar, { getInitials } from '../components/common/Avatar';
import StatusChip from '../components/common/StatusChip';
import CategoryChip from '../components/common/CategoryChip';
import { ChevronDownIcon, MailIcon, PeopleIcon, PlusIcon, SearchIcon, TrashIcon } from '../components/common/Icons';
import {
  applyFilters,
  applySort,
  buildEmployeeFields,
  findField,
  groupableFields,
  parseFilters,
  parseSort,
} from '../lib/viewFields';
import { formatMoney } from '../lib/currencies';

const CONTRACT_TYPE_LABELS: Record<string, string> = { part_time: 'Part Time', full_time: 'Full Time' };
const COMPENSATION_TYPE_LABELS: Record<string, string> = { hourly: 'Hourly', monthly: 'Monthly' };
const CONTRACT_TYPE_VALUE_BY_LABEL: Record<string, string> = { 'Part Time': 'part_time', 'Full Time': 'full_time' };
const COMPENSATION_TYPE_VALUE_BY_LABEL: Record<string, string> = { Hourly: 'hourly', Monthly: 'monthly' };

const PAGE_SIZE = 20;
const ACTIVE_VIEW_STORAGE_KEY = 'northstack:activeView:employee';
// Frozen columns stay pinned to the left through horizontal scroll and can't
// be dragged to reorder — everything else can.
const FROZEN_COLUMN_KEYS = ['name', 'status'];

function dollarsToCents(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : Math.round(parsed * 100);
}

interface EmployeesPageProps {
  user: any;
  token: string;
}

export default function EmployeesPage({ user, token }: EmployeesPageProps) {
  const toast = useToast();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [slideOverMode, setSlideOverMode] = useState<'add' | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<any | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [page, setPage] = useState(1);
  const [employeeCustomFields, setEmployeeCustomFields] = useState<any[]>([]);
  const [employeeStatuses, setEmployeeStatuses] = useState<any[]>([]);
  const [employeeDepartments, setEmployeeDepartments] = useState<any[]>([]);
  const [employeeJobTitles, setEmployeeJobTitles] = useState<any[]>([]);
  const [timeOffPolicies, setTimeOffPolicies] = useState<any[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  const [tenantCurrency, setTenantCurrency] = useState('USD');
  const [tenantUsers, setTenantUsers] = useState<any[]>([]);
  const [collapsedListSections, setCollapsedListSections] = useState<Set<string>>(new Set());
  const [overviewEmployeeId, setOverviewEmployeeId] = useState<string | null>(null);
  const [seedingSample, setSeedingSample] = useState(false);
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const csvMenuRef = useRef<CsvImportExportMenuHandle>(null);

  const [views, setViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY),
  );
  const [viewFilters, setViewFilters] = useState<ViewFilter[]>([]);
  const [viewSort, setViewSort] = useState<ViewSort | null>(null);
  const [draggedColKey, setDraggedColKey] = useState<string | null>(null);
  const [dragOverColKey, setDragOverColKey] = useState<string | null>(null);

  const canManageCustomFields = user.role === 'owner' || user.role === 'admin';
  const canEditEmployees = user.role === 'owner' || user.role === 'admin';
  const activeEmployeeCustomFields = employeeCustomFields.filter((field) => field.isActive);
  const activeEmployeeStatuses = employeeStatuses.filter((s) => s.isActive);
  // Column width/visibility/order are saved-view-scoped, not shared across
  // all views for this table — each SavedView (or the implicit "All
  // Employees" default, activeViewId === null) gets its own bucket.
  const columnStorageSuffix = activeViewId ?? 'default';
  const { getWidth: getColumnWidth, startResize } = useResizableColumns(
    `northstack:columnWidths:employee:${columnStorageSuffix}`,
  );
  const { isHidden: isColumnHidden, toggle: toggleColumn, hide: hideColumn } = useColumnVisibility(
    `northstack:hiddenColumns:employee:${columnStorageSuffix}`,
  );

  const fields = useMemo(
    () => buildEmployeeFields(employeeStatuses, employeeCustomFields, employeeDepartments, employeeJobTitles),
    [employeeStatuses, employeeCustomFields, employeeDepartments, employeeJobTitles],
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

  const searchFilteredEmployees = employees.filter((emp) => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query) return true;
    return (
      `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(query) ||
      emp.email.toLowerCase().includes(query) ||
      (emp.departmentDefn?.name ?? '').toLowerCase().includes(query)
    );
  });

  const viewFilteredEmployees = applyFilters(searchFilteredEmployees, fields, viewFilters);
  const sortedEmployees = applySort(viewFilteredEmployees, fields, viewSort);

  const pageCount = Math.max(1, Math.ceil(sortedEmployees.length / PAGE_SIZE));
  const pagedEmployees = paginate(sortedEmployees, page, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [employeeSearch, activeViewId]);

  const emptyEmployeeForm = {
    firstName: '',
    lastName: '',
    email: '',
    personalEmail: '',
    departmentId: '',
    jobTitleId: '',
    managerId: '',
    startDate: '',
    endDate: '',
    contractUrl: '',
    hourlyRate: '',
    monthlyRate: '',
    contractType: '',
    compensationType: '',
  };

  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm);

  useEffect(() => {
    loadEmployees();
    loadEmployeeCustomFields();
    loadEmployeeStatuses();
    loadEmployeeDepartments();
    loadEmployeeJobTitles();
    loadTimeOffPolicies();
    loadViews();
    api
      .getCurrentTenant(token)
      .then((tenant) => setTenantCurrency(tenant.currency))
      .catch(() => {
        // Non-critical for this page — falls back to USD formatting if it fails.
      });
    api
      .listTenantUsers(token)
      .then(setTenantUsers)
      .catch(() => {
        // Non-critical — the Tasks assignee dropdown just falls back to empty if it fails.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEmployeeDepartments = async () => {
    try {
      const defs = await api.listFieldCatalogDefinitions(token, 'department');
      setEmployeeDepartments(defs);
    } catch (error) {
      toast.error('Failed to load departments: ' + (error as Error).message);
    }
  };

  const loadEmployeeJobTitles = async () => {
    try {
      const defs = await api.listFieldCatalogDefinitions(token, 'jobTitle');
      setEmployeeJobTitles(defs);
    } catch (error) {
      toast.error('Failed to load job titles: ' + (error as Error).message);
    }
  };

  const loadViews = async () => {
    try {
      const data = await api.listViews(token, 'employee');
      setViews(data);
    } catch (error) {
      toast.error('Failed to load views: ' + (error as Error).message);
    }
  };

  const loadTimeOffPolicies = async () => {
    try {
      const policies = await api.listTimeOffPolicies(token);
      setTimeOffPolicies(policies.filter((p) => p.isActive));
    } catch (error) {
      toast.error('Failed to load time off policies: ' + (error as Error).message);
    }
  };

  const loadEmployeeCustomFields = async () => {
    try {
      const defs = await api.listCustomFieldDefinitions(token, 'employee');
      setEmployeeCustomFields(defs);
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
      await api.createCustomFieldDefinition(token, { ...input, entityType: 'employee' });
      toast.success(`Field "${input.name}" added.`);
      loadEmployeeCustomFields();
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
      loadEmployeeCustomFields();
    } catch (error) {
      toast.error('Failed to update field: ' + (error as Error).message);
    }
  };

  const handleDeactivateCustomFieldColumn = async (id: string) => {
    try {
      await api.updateCustomFieldDefinition(token, id, { isActive: false });
      toast.success('Field deleted.');
      loadEmployeeCustomFields();
    } catch (error) {
      toast.error('Failed to delete field: ' + (error as Error).message);
    }
  };

  const loadEmployeeStatuses = async () => {
    try {
      const statuses = await api.listStatusDefinitions(token, 'employee');
      setEmployeeStatuses(statuses);
    } catch (error) {
      toast.error('Failed to load statuses: ' + (error as Error).message);
    }
  };

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const data = await api.listEmployees(token);
      setEmployees(data);
    } catch (error) {
      toast.error('Failed to load employees: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Silent refresh — used as the Overview panel's onChanged, fired on every
  // autosave field/custom field/time-off-policy change while the panel stays
  // open. Unlike loadEmployees(), this doesn't toggle the page-level loading
  // state, which would otherwise flash the whole table behind the modal on
  // every single field edit (found 2026-07-30 testing the autosave panel).
  const refreshEmployeesSilently = () => {
    api.listEmployees(token).then(setEmployees).catch(() => {});
  };

  // Instant row update from a PATCH response — no network round-trip like
  // refreshEmployeesSilently above (found 2026-07-30: the silent-refetch fix
  // updated the row eventually, but not fast enough). Merged onto the
  // existing row rather than replacing it outright, since updateEmployee's
  // response doesn't include customFieldVals/timeOffPolicies the way
  // listEmployees does — those stay as they were, everything else updates.
  const patchEmployeeInList = (updated: any) => {
    setEmployees((prev) => prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)));
  };

  const closeSlideOver = () => {
    setSlideOverMode(null);
    setCustomFieldValues({});
  };

  const handleOpenAdd = () => {
    setEmployeeForm(emptyEmployeeForm);
    setCustomFieldValues({});
    setSlideOverMode('add');
  };

  const handleLoadSampleData = async () => {
    setSeedingSample(true);
    try {
      const result = await api.seedSampleData(token);
      toast.success(`Added ${result.employees} sample employees and ${result.clients} sample clients.`);
      await loadEmployees();
    } catch (error) {
      toast.error('Failed to load sample data: ' + (error as Error).message);
    } finally {
      setSeedingSample(false);
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const employee = await api.createEmployee(token, {
        firstName: employeeForm.firstName,
        lastName: employeeForm.lastName,
        email: employeeForm.email,
        personalEmail: employeeForm.personalEmail || undefined,
        departmentId: employeeForm.departmentId || null,
        jobTitleId: employeeForm.jobTitleId || null,
        managerId: employeeForm.managerId || null,
        startDate: employeeForm.startDate || undefined,
        endDate: employeeForm.endDate || undefined,
        contractUrl: employeeForm.contractUrl || undefined,
        hourlyRateCents: dollarsToCents(employeeForm.hourlyRate),
        monthlyRateCents: dollarsToCents(employeeForm.monthlyRate),
        contractType: (employeeForm.contractType || null) as 'part_time' | 'full_time' | null,
        compensationType: (employeeForm.compensationType || null) as 'hourly' | 'monthly' | null,
      });

      const valueEntries = Object.entries(customFieldValues).filter(([, value]) => value.trim() !== '');
      for (const [customFieldDefinitionId, value] of valueEntries) {
        await api.createEmployeeCustomFieldValue(token, employee.id, {
          customFieldDefinitionId,
          value,
        });
      }

      toast.success(`${employee.firstName} ${employee.lastName} added.`);
      closeSlideOver();
      loadEmployees();
    } catch (error) {
      toast.error('Failed to create employee: ' + (error as Error).message);
    }
  };

  const handleInviteEmployee = async (employeeId: string) => {
    try {
      const { invitation } = await api.inviteEmployee(token, employeeId);
      const link = `${window.location.origin}/accept-invite/${invitation.token}`;
      await navigator.clipboard.writeText(link);
      toast.success('Invite link copied to clipboard.');
      loadEmployees();
    } catch (error) {
      toast.error('Failed to invite employee: ' + (error as Error).message);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!deletingEmployee) return;
    try {
      await api.deleteEmployee(token, deletingEmployee.id);
      toast.success(`${deletingEmployee.firstName} ${deletingEmployee.lastName} deleted.`);
      setDeletingEmployee(null);
      loadEmployees();
    } catch (error) {
      toast.error('Failed to delete employee: ' + (error as Error).message);
      setDeletingEmployee(null);
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

  const handleKanbanMove = async (emp: any, newValue: string) => {
    const groupField = activeView?.groupByField;
    if (!groupField) return;
    try {
      if (groupField === 'status') {
        const status = employeeStatuses.find((s) => s.name === newValue);
        if (!status) return;
        await api.updateEmployee(token, emp.id, { statusId: status.id });
      } else if (groupField === 'contractType') {
        const value = CONTRACT_TYPE_VALUE_BY_LABEL[newValue];
        if (!value) return;
        await api.updateEmployee(token, emp.id, { contractType: value as 'part_time' | 'full_time' });
      } else if (groupField === 'compensationType') {
        const value = COMPENSATION_TYPE_VALUE_BY_LABEL[newValue];
        if (!value) return;
        await api.updateEmployee(token, emp.id, { compensationType: value as 'hourly' | 'monthly' });
      } else if (groupField.startsWith('cf:')) {
        const definitionId = groupField.slice(3);
        const existing = emp.customFieldVals?.find((v: any) => v.customFieldDefinitionId === definitionId);
        if (existing) {
          await api.updateEmployeeCustomFieldValue(token, emp.id, existing.id, newValue);
        } else {
          await api.createEmployeeCustomFieldValue(token, emp.id, {
            customFieldDefinitionId: definitionId,
            value: newValue,
          });
        }
      }
      loadEmployees();
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
      const view = await api.createView(token, {
        entityType: 'employee',
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
        entityType: 'employee',
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
    {
      key: 'name',
      label: 'Name',
      render: (emp: any) => (
        <div className="name-cell">
          <Avatar firstName={emp.firstName} lastName={emp.lastName} />
          <button type="button" className="name-link" onClick={() => setOverviewEmployeeId(emp.id)}>
            {emp.firstName} {emp.lastName}
          </button>
          {emp.activeTimeOffTag && (
            <span
              className="time-off-active-tag"
              style={{ background: emp.activeTimeOffTag.color || '#9ca3af' }}
              title={`On ${emp.activeTimeOffTag.policyName} today`}
            >
              {emp.activeTimeOffTag.policyName}
            </span>
          )}
        </div>
      ),
    },
    { key: 'email', label: 'Business Email', render: (emp: any) => emp.email },
    { key: 'personalEmail', label: 'Personal Email', render: (emp: any) => emp.personalEmail || '—' },
    {
      key: 'department',
      label: 'Department',
      render: (emp: any) =>
        emp.departmentDefn ? (
          <CategoryChip label={emp.departmentDefn.name} seed={emp.departmentDefn.id} />
        ) : (
          '—'
        ),
    },
    {
      key: 'jobTitle',
      label: 'Job Title',
      render: (emp: any) =>
        emp.jobTitleDefn ? <CategoryChip label={emp.jobTitleDefn.name} seed={emp.jobTitleDefn.id} /> : '—',
    },
    {
      key: 'status',
      label: 'Status',
      render: (emp: any) =>
        emp.statusDefn && <StatusChip color={emp.statusDefn.color || '#6b7280'} label={emp.statusDefn.name} />,
    },
    {
      key: 'startDate',
      label: 'Start Date',
      render: (emp: any) => (emp.startDate ? new Date(emp.startDate).toLocaleDateString() : '—'),
    },
    {
      key: 'endDate',
      label: 'End Date',
      render: (emp: any) => (emp.endDate ? new Date(emp.endDate).toLocaleDateString() : '—'),
    },
    {
      key: 'contractUrl',
      label: 'Contract URL',
      render: (emp: any) =>
        emp.contractUrl ? (
          <a href={emp.contractUrl} target="_blank" rel="noopener noreferrer" className="table-link">
            View
          </a>
        ) : (
          '—'
        ),
    },
    {
      key: 'contractType',
      label: 'Contract Type',
      render: (emp: any) => (emp.contractType ? CONTRACT_TYPE_LABELS[emp.contractType] : '—'),
    },
    {
      key: 'compensationType',
      label: 'Compensation Type',
      render: (emp: any) => (emp.compensationType ? COMPENSATION_TYPE_LABELS[emp.compensationType] : '—'),
    },
    ...(user.role === 'owner'
      ? [
          {
            key: 'hourlyRate',
            label: 'Hourly Rate',
            render: (emp: any) =>
              emp.hourlyRateCents != null ? formatMoney(emp.hourlyRateCents, tenantCurrency) : '—',
          },
          {
            key: 'monthlyRate',
            label: 'Monthly Rate',
            render: (emp: any) =>
              emp.monthlyRateCents != null ? formatMoney(emp.monthlyRateCents, tenantCurrency) : '—',
          },
        ]
      : []),
  ];

  const toggleableColumns = [
    ...columns,
    { key: 'managerName', label: 'Reports To' },
    { key: 'timeOffPolicies', label: 'Time Off Policies' },
    ...activeEmployeeCustomFields.map((field) => ({ key: `cf:${field.id}`, label: field.name })),
  ];
  const movableColumnKeys = columns.map((col) => col.key).filter((key) => !FROZEN_COLUMN_KEYS.includes(key));
  const { orderedKeys: columnOrder, reorder: reorderColumns } = useColumnOrder(
    `northstack:columnOrder:employee:${columnStorageSuffix}`,
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
  const showManagerColumn = !isColumnHidden('managerName');
  const showTimeOffPoliciesColumn = !isColumnHidden('timeOffPolicies');
  const visibleCustomFields = activeEmployeeCustomFields.filter((field) => !isColumnHidden(`cf:${field.id}`));

  const groupFieldForKanban = activeView?.groupByField ? findField(fields, activeView.groupByField) : undefined;

  // The ghost "Add" row/card only exists inside the rendered table/Kanban
  // body — these are the states where that body never renders, so the add
  // affordance would otherwise disappear entirely. Restored as a toolbar
  // fallback only in these cases; the normal ghost-row-only UX is unchanged.
  const groupByBroken = (viewType === 'kanban' || viewType === 'list') && !groupFieldForKanban;
  const noResultsInGridOrList = viewType !== 'kanban' && sortedEmployees.length === 0;
  const showAddFallback = canEditEmployees && employees.length > 0 && (groupByBroken || noResultsInGridOrList);

  const totalColumnCount =
    visibleColumns.length +
    (showManagerColumn ? 1 : 0) +
    (showTimeOffPoliciesColumn ? 1 : 0) +
    visibleCustomFields.length +
    (canManageCustomFields ? 1 : 0) +
    1;

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
        const byValue = new Map<string, any[]>();
        for (const opt of groupFieldForKanban.selectOptions ?? []) byValue.set(opt.value, []);
        for (const emp of sortedEmployees) {
          const value = groupFieldForKanban.getValue(emp);
          if (!byValue.has(value)) byValue.set(value, []);
          byValue.get(value)!.push(emp);
        }
        return Array.from(byValue.entries()).map(([value, items]) => ({
          key: value || '(none)',
          label: value || '(none)',
          color: groupFieldForKanban.selectOptions?.find((opt) => opt.value === value)?.color ?? null,
          items,
        }));
      })()
    : [];

  const renderEmployeeRow = (emp: any) => (
    <tr key={emp.id}>
      {visibleColumns.map((col) => {
        const isFrozen = FROZEN_COLUMN_KEYS.includes(col.key);
        const isLastFrozen = isFrozen && frozenColumns[frozenColumns.length - 1]?.key === col.key;
        return (
          <td
            key={col.key}
            className={`${isFrozen ? 'col-frozen' : ''} ${isLastFrozen ? 'col-frozen-edge' : ''}`}
            style={isFrozen ? { left: getFrozenLeft(col.key), zIndex: 1 } : undefined}
          >
            {col.render(emp)}
          </td>
        );
      })}
      {showManagerColumn && <td>{emp.manager ? `${emp.manager.firstName} ${emp.manager.lastName}` : '—'}</td>}
      {showTimeOffPoliciesColumn && (
        <td>
          {emp.timeOffPolicies && emp.timeOffPolicies.length > 0
            ? emp.timeOffPolicies.map((a: any) => a.timeOffPolicy.name).join(', ')
            : '—'}
        </td>
      )}
      {visibleCustomFields.map((field) => {
        const fieldValue = emp.customFieldVals?.find((v: any) => v.customFieldDefinitionId === field.id);
        const value = fieldValue?.value;
        return (
          <td key={field.id}>
            {value ? field.fieldType === 'select' ? <CategoryChip label={value} seed={`${field.id}:${value}`} /> : value : '—'}
          </td>
        );
      })}
      {canManageCustomFields && <td></td>}
      <td>
        <div className="icon-actions">
          <button className="icon-btn danger" onClick={() => setDeletingEmployee(emp)}>
            <span className="tip">Delete</span>
            <TrashIcon />
          </button>
          {canManageCustomFields &&
            (emp.userId ? (
              <span className="chip-linked">Linked</span>
            ) : (
              <button className="icon-btn" onClick={() => handleInviteEmployee(emp.id)}>
                <span className="tip">Invite</span>
                <MailIcon />
              </button>
            ))}
        </div>
      </td>
    </tr>
  );

  const ghostAddRow = canEditEmployees && (
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
      {deletingEmployee && (
        <ConfirmDialog
          title="Delete employee"
          message={`Are you sure you want to delete ${deletingEmployee.firstName} ${deletingEmployee.lastName}? This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteEmployee}
          onCancel={() => setDeletingEmployee(null)}
        />
      )}

      <Modal
        open={slideOverMode !== null}
        title="Add Employee"
        onClose={closeSlideOver}
        wide
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeSlideOver}>
              Cancel
            </button>
            <button type="submit" form="employee-form" className="btn-primary">
              Create
            </button>
          </>
        }
      >
        {slideOverMode === 'add' && (
          <form id="employee-form" onSubmit={handleCreateEmployee}>
            <div className="field-group">
              <h4 className="field-group-title">Identity</h4>
              <div className="field-group-body">
                <div className="form-group">
                  <label htmlFor="emp-firstName">First Name</label>
                  <input
                    id="emp-firstName"
                    type="text"
                    value={employeeForm.firstName}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, firstName: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="emp-lastName">Last Name</label>
                  <input
                    id="emp-lastName"
                    type="text"
                    value={employeeForm.lastName}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, lastName: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="emp-email">Business Email</label>
                  <input
                    id="emp-email"
                    type="email"
                    value={employeeForm.email}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="emp-personalEmail">Personal Email</label>
                  <input
                    id="emp-personalEmail"
                    type="email"
                    value={employeeForm.personalEmail}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, personalEmail: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="field-group">
              <h4 className="field-group-title">Role</h4>
              <div className="field-group-body">
                <div className="form-group">
                  <label htmlFor="emp-departmentId">Department</label>
                  <select
                    id="emp-departmentId"
                    value={employeeForm.departmentId}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, departmentId: e.target.value })}
                  >
                    <option value="">-- none --</option>
                    {employeeDepartments
                      .filter((d) => d.isActive)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="emp-jobTitleId">Job Title</label>
                  <select
                    id="emp-jobTitleId"
                    value={employeeForm.jobTitleId}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, jobTitleId: e.target.value })}
                  >
                    <option value="">-- none --</option>
                    {employeeJobTitles
                      .filter((j) => j.isActive)
                      .map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="emp-managerId">Reports To</label>
                  <select
                    id="emp-managerId"
                    value={employeeForm.managerId}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, managerId: e.target.value })}
                  >
                    <option value="">-- No manager --</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="field-group">
              <h4 className="field-group-title">Contract &amp; compensation</h4>
              <div className="field-group-body">
                <div className="form-group">
                  <label htmlFor="emp-startDate">Start Date</label>
                  <input
                    id="emp-startDate"
                    type="date"
                    value={employeeForm.startDate}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, startDate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="emp-contractUrl">Contract URL</label>
                  <input
                    id="emp-contractUrl"
                    type="url"
                    value={employeeForm.contractUrl}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, contractUrl: e.target.value })}
                    placeholder="https://drive.google.com/..."
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="emp-contractType">Contract Type</label>
                  <select
                    id="emp-contractType"
                    value={employeeForm.contractType}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, contractType: e.target.value })}
                  >
                    <option value="">-- select --</option>
                    <option value="part_time">Part Time</option>
                    <option value="full_time">Full Time</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="emp-compensationType">Compensation Type</label>
                  <select
                    id="emp-compensationType"
                    value={employeeForm.compensationType}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEmployeeForm({
                        ...employeeForm,
                        compensationType: value,
                        hourlyRate: value === 'monthly' ? '' : employeeForm.hourlyRate,
                        monthlyRate: value === 'hourly' ? '' : employeeForm.monthlyRate,
                      });
                    }}
                  >
                    <option value="">-- select --</option>
                    <option value="hourly">Hourly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                {user.role === 'owner' && employeeForm.compensationType !== 'monthly' && (
                  <div className="form-group">
                    <label htmlFor="emp-hourlyRate">Hourly Rate</label>
                    <input
                      id="emp-hourlyRate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={employeeForm.hourlyRate}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, hourlyRate: e.target.value })}
                    />
                  </div>
                )}
                {user.role === 'owner' && employeeForm.compensationType !== 'hourly' && (
                  <div className="form-group">
                    <label htmlFor="emp-monthlyRate">Monthly Rate</label>
                    <input
                      id="emp-monthlyRate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={employeeForm.monthlyRate}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, monthlyRate: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>

            {activeEmployeeCustomFields.length > 0 && (
              <div className="field-group">
                <h4 className="field-group-title">Custom fields</h4>
                <div className="field-group-body">
                  {activeEmployeeCustomFields.map((field) => (
                    <div className="form-group" key={field.id}>
                      <label htmlFor={`emp-cf-${field.id}`}>
                        {field.name}
                        {field.required ? ' *' : ''}
                      </label>
                      {renderCustomFieldInput(field, customFieldValues, setCustomFieldValues, 'emp-cf')}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>
        )}

      </Modal>

      <ViewsBar
        allLabel="All Employees"
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
        <h2>Employees</h2>
        {employees.length > 0 && (
          <div className="toolbar-search">
            <SearchIcon />
            <label htmlFor="employee-search" className="sr-only">
              Search employees
            </label>
            <input
              id="employee-search"
              type="text"
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              placeholder="Search by name, email or department..."
            />
          </div>
        )}
        {viewType !== 'kanban' && <FilterBar fields={fields} filters={viewFilters} onChange={setViewFilters} />}
        {viewType !== 'kanban' && (
          <ColumnVisibilityMenu columns={toggleableColumns} isHidden={isColumnHidden} onToggle={toggleColumn} />
        )}
        {canEditEmployees && <CsvImportExportMenu ref={csvMenuRef} token={token} onImported={loadEmployees} />}
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
      ) : employees.length === 0 ? (
        <EmptyState
          icon={<PeopleIcon />}
          title="No employees yet"
          body="Add your team one by one, import a CSV, or load sample data."
          primaryLabel="Add employee"
          onPrimary={handleOpenAdd}
          secondaryLabel={canEditEmployees ? 'Import CSV' : undefined}
          onSecondary={canEditEmployees ? () => csvMenuRef.current?.openImport() : undefined}
        >
          <button type="button" className="btn-ghost btn-md" onClick={handleLoadSampleData} disabled={seedingSample}>
            {seedingSample ? 'Loading…' : 'Load sample data'}
          </button>
        </EmptyState>
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
            items={viewFilteredEmployees}
            getItemKey={(emp) => emp.id}
            getItemColumn={(emp) => groupFieldForKanban.getValue(emp)}
            onMove={canEditEmployees ? handleKanbanMove : () => {}}
            renderCard={(emp) => (
              <>
                <div className="kc-name">
                  {emp.firstName} {emp.lastName}
                </div>
                <div className="kc-meta">{emp.jobTitleDefn?.name}</div>
                {emp.manager && (
                  <div className="kcard-foot">
                    <span className="kc-owner">{getInitials(emp.manager.firstName, emp.manager.lastName)}</span>
                  </div>
                )}
              </>
            )}
            renderColumnFooter={
              canEditEmployees
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
      ) : sortedEmployees.length === 0 ? (
        <EmptyState
          icon={<SearchIcon />}
          title={`No matches for "${employeeSearch}"`}
          body="Try a different term, or clear the filters."
          primaryLabel="Clear filters"
          primaryVariant="secondary"
          onPrimary={() => {
            setEmployeeSearch('');
            setViewFilters([]);
          }}
        />
      ) : (
        <>
          <EntityCardList
            items={pagedEmployees}
            getKey={(emp) => emp.id}
            getInitials={(emp) => getInitials(emp.firstName, emp.lastName)}
            getName={(emp) => `${emp.firstName} ${emp.lastName}`}
            getMeta={(emp) => [emp.jobTitleDefn?.name, emp.departmentDefn?.name].filter(Boolean).join(' · ')}
            getStatusColor={(emp) => emp.statusDefn?.color || '#6b7280'}
            onSelect={(emp) => setOverviewEmployeeId(emp.id)}
          />
          <div className="full-table-wrap has-mobile-cards" ref={tableWrapRef}>
            <table className="table full-table">
              <colgroup>
                {visibleColumns.map((col) => (
                  <col key={col.key} style={{ width: getColumnWidth(col.key) }} />
                ))}
                {showManagerColumn && <col style={{ width: getColumnWidth('managerName') }} />}
                {showTimeOffPoliciesColumn && <col style={{ width: getColumnWidth('timeOffPolicies') }} />}
                {visibleCustomFields.map((field) => (
                  <col key={field.id} style={{ width: getColumnWidth(`cf:${field.id}`) }} />
                ))}
                {canManageCustomFields && <col style={{ width: 40 }} />}
                <col style={{ width: 110 }} />
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
                          entityType="employee"
                          statuses={employeeStatuses}
                          onChanged={loadEmployeeStatuses}
                          onHide={() => hideColumn('status')}
                        />
                      )}
                      {col.key === 'department' && canManageCustomFields && (
                        <FieldCatalogMenu
                          token={token}
                          kind="department"
                          label="Department"
                          entries={employeeDepartments}
                          onChanged={loadEmployeeDepartments}
                          onHide={() => hideColumn('department')}
                        />
                      )}
                      {col.key === 'jobTitle' && canManageCustomFields && (
                        <FieldCatalogMenu
                          token={token}
                          kind="jobTitle"
                          label="Job Title"
                          entries={employeeJobTitles}
                          onChanged={loadEmployeeJobTitles}
                          onHide={() => hideColumn('jobTitle')}
                        />
                      )}
                      <ColumnResizeHandle onMouseDown={(e) => startResize(col.key, e)} />
                    </th>
                    );
                  })}
                  {showManagerColumn && (
                    <th>
                      Reports To
                      <ColumnResizeHandle onMouseDown={(e) => startResize('managerName', e)} />
                    </th>
                  )}
                  {showTimeOffPoliciesColumn && (
                    <th>
                      Time Off Policies
                      <ColumnResizeHandle onMouseDown={(e) => startResize('timeOffPolicies', e)} />
                    </th>
                  )}
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
                        <td
                          colSpan={totalColumnCount}
                          className="list-section-header"
                          onClick={() => toggleListSection(section.key)}
                        >
                          <ChevronDownIcon
                            className={`list-chevron ${collapsedListSections.has(section.key) ? '' : 'list-chevron-open'}`}
                          />
                          {section.color && <span className="dot" style={{ background: section.color }} />}
                          <span className="list-section-label">{section.label}</span>
                          <span className="cnt">{section.items.length}</span>
                        </td>
                      </tr>
                      {!collapsedListSections.has(section.key) && section.items.map(renderEmployeeRow)}
                      {!collapsedListSections.has(section.key) && ghostAddRow}
                    </tbody>
                  ))
                : (
                    <tbody>
                      {pagedEmployees.map(renderEmployeeRow)}
                      {ghostAddRow}
                    </tbody>
                  )}
            </table>
          </div>
          <HorizontalScrollbar targetRef={tableWrapRef} />
          {viewType !== 'list' && <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />}
        </>
      )}
      {overviewEmployeeId && (() => {
        const overviewEmployee = employees.find((e) => e.id === overviewEmployeeId);
        if (!overviewEmployee) return null;
        return (
          <EmployeeOverviewPanel
            employee={overviewEmployee}
            employees={employees}
            tenantCurrency={tenantCurrency}
            isOwner={user.role === 'owner'}
            token={token}
            tenantUsers={tenantUsers}
            currentUserId={user.id}
            customFields={activeEmployeeCustomFields}
            statuses={activeEmployeeStatuses}
            departments={employeeDepartments}
            jobTitles={employeeJobTitles}
            timeOffPolicies={timeOffPolicies}
            canManageEmployees={canManageCustomFields}
            onClose={() => setOverviewEmployeeId(null)}
            onChanged={refreshEmployeesSilently}
            onSaved={patchEmployeeInList}
            onRequestDelete={() => {
              setOverviewEmployeeId(null);
              setDeletingEmployee(overviewEmployee);
            }}
            onInvite={() => handleInviteEmployee(overviewEmployee.id)}
          />
        );
      })()}
    </div>
  );
}
