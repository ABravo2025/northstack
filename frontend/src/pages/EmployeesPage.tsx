import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type PayFrequency, type SavedView, type ViewFilter, type ViewSort } from '../api';
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
import MultiSelectDropdown from '../components/common/MultiSelectDropdown';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import { useColumnOrder } from '../hooks/useColumnOrder';
import CsvImportExportMenu, { type CsvImportExportMenuHandle } from '../components/entity-views/CsvImportExportMenu';
import EmployeeOverviewPanel from '../components/hr/EmployeeOverviewPanel';
import HorizontalScrollbar from '../components/entity-views/HorizontalScrollbar';
import Avatar, { getInitials } from '../components/common/Avatar';
import StatusChip from '../components/common/StatusChip';
import CategoryChip from '../components/common/CategoryChip';
import Field from '../components/common/Field';
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
import { isLikelyValidEmail } from '../lib/validation';
import { usePermissions } from '../contexts/PermissionsContext';
import { usePrimaryAction } from '../contexts/PrimaryActionContext';
import { useAutoCreateGuard } from '../hooks/useAutoCreateGuard';
import { COUNTRIES } from '../lib/countries';
import { CURRENCY_CODES, currencyLabel } from '../lib/currencies';

// Still keyed by the literal English label text on purpose — Kanban's grouped columns for
// "Contract Type" get their key/label straight from viewFields.ts's buildEmployeeFields (out of
// this unit's scope, still hardcoded English), so this reverse-lookup must keep matching those
// same literal strings regardless of the active UI language. Not translated.
const CONTRACT_TYPE_VALUE_BY_LABEL: Record<string, string> = { 'Part Time': 'part_time', 'Full Time': 'full_time' };
// Payroll Unidad 11 — 'sin_compensacion' deliberately has no entry (renders
// '—', same as Profile) since it isn't one of the 3 chip states the spec
// calls out.

const PAGE_SIZE = 20;
const ACTIVE_VIEW_STORAGE_KEY = 'northstack:activeView:employee';
// Frozen columns stay pinned to the left through horizontal scroll and can't
// be dragged to reorder — everything else can.
const FROZEN_COLUMN_KEYS = ['name', 'status'];

interface EmployeesPageProps {
  user: any;
  token: string;
}

export default function EmployeesPage({ user, token }: EmployeesPageProps) {
  const { t } = useTranslation('hr');
  const toast = useToast();
  const permissions = usePermissions();
  // Rebuilt every render (not module-level consts) so these stay translated after a language
  // switch — see CONTRACT_TYPE_VALUE_BY_LABEL above for why its own reverse-lookup twin stays
  // untouched at module scope instead.
  const CONTRACT_TYPE_LABELS: Record<string, string> = {
    part_time: t('employees.contractTypeLabels.part_time'),
    full_time: t('employees.contractTypeLabels.full_time'),
  };
  const PERSON_TYPE_LABELS: Record<string, string> = {
    profile: t('employees.personTypeLabels.profile'),
    contractor: t('employees.personTypeLabels.contractor'),
    employee: t('employees.personTypeLabels.employee'),
  };
  const CONTRACT_STATUS_CHIPS = {
    confirmado: { color: '#059669', label: t('employees.contractStatusChips.confirmed') },
    pendiente: { color: '#9ca3af', label: t('employees.contractStatusChips.pending') },
    vencido: { color: '#dc2626', label: t('employees.contractStatusChips.expired') },
  };
  const [employees, setEmployees] = useState<any[]>([]);
  // Custom Roles Fase E — unscoped roster (name/department/jobTitle/manager only, no PII) for
  // pickers that must point at anyone in the company regardless of the viewer's own HR scope:
  // the "Reports To" select below and the same-shaped prop threaded into EmployeeOverviewPanel/
  // TerminateEmployeeModal. `employees` above is the real, scope-filtered list for the table.
  const [employeeDirectory, setEmployeeDirectory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [slideOverMode, setSlideOverMode] = useState<'add' | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<any | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [employeeCustomFields, setEmployeeCustomFields] = useState<any[]>([]);
  const [employeeStatuses, setEmployeeStatuses] = useState<any[]>([]);
  const [employeeDepartments, setEmployeeDepartments] = useState<any[]>([]);
  const [employeeJobTitles, setEmployeeJobTitles] = useState<any[]>([]);
  const [timeOffPolicies, setTimeOffPolicies] = useState<any[]>([]);
  const [payFrequencies, setPayFrequencies] = useState<PayFrequency[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  const [tenantUsers, setTenantUsers] = useState<any[]>([]);
  const [collapsedListSections, setCollapsedListSections] = useState<Set<string>>(new Set());
  const [overviewEmployeeId, setOverviewEmployeeId] = useState<string | null>(null);
  const [seedingSample, setSeedingSample] = useState(false);
  // "Invite to app" (EmployeeOverviewPanel's Actions menu) used to fire straight off with no role
  // choice, always landing the invitee on the seed Member role — this lets the inviter pick any
  // tenant role first, same as CompanyUsersPage.tsx's "Invite Someone" modal.
  const [assignableRoles, setAssignableRoles] = useState<{ id: string; name: string }[]>([]);
  const [invitingEmployee, setInvitingEmployee] = useState<any | null>(null);
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviting, setInviting] = useState(false);
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

  // Custom Roles Fase G — migrated off the legacy `user.role === 'owner'/'admin'` inline checks to
  // the real permission system (PermissionsContext). This uncovered 2 latent bugs, fixed alongside
  // the migration rather than left in place with a "real" permission bolted onto the same wrong
  // wiring: (1) the CSV import/export menu below was gated by canEditEmployees (manage_employee),
  // but the backend has required manage_payroll for CSV since Fase B decision 4 — an Admin without
  // manage_payroll would see a working-looking Import/Export UI that 403s on click; (2)
  // EmployeeOverviewPanel's `canManageEmployees` prop was fed canManageCustomFields, not
  // canEditEmployees — harmless only because both flags happened to be identical
  // (owner||admin) before this migration.
  const canManageCustomFields = permissions.has('manage_custom_fields');
  const canEditEmployees = permissions.has('manage_employee');
  const canManagePayroll = permissions.has('manage_payroll');
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

  // Tags are multi-valued per row, outside the generic single-value
  // viewFields/applyFilters engine (same reason search above isn't routed
  // through it either) — OR match: any row carrying at least one of the
  // selected tags. `tags` comes embedded on each employee from listEmployees
  // (backlog QA, 2026-08-27).
  const tagFilteredEmployees =
    selectedTagFilter.length === 0
      ? searchFilteredEmployees
      : searchFilteredEmployees.filter((emp) => (emp.tags || []).some((t: any) => selectedTagFilter.includes(t.name)));

  const viewFilteredEmployees = applyFilters(tagFilteredEmployees, fields, viewFilters);
  const sortedEmployees = applySort(viewFilteredEmployees, fields, viewSort);

  const allTagOptions = useMemo(
    () =>
      Array.from(new Set(employees.flatMap((emp: any) => (emp.tags || []).map((t: any) => t.name))))
        .sort()
        .map((name) => ({ value: name, label: name })),
    [employees],
  );

  const pageCount = Math.max(1, Math.ceil(sortedEmployees.length / PAGE_SIZE));
  const pagedEmployees = paginate(sortedEmployees, page, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [employeeSearch, activeViewId]);

  const getEmptyEmployeeForm = () => ({
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
    contractType: '',
    personType: '',
    nationality: '',
    // Initial contract (Payroll Unidad 5) — only used/required when personType
    // is contractor/employee.
    compensationType: '',
    rateAmount: '',
    currency: 'USD',
    payFrequencyId: '',
    contractJobTitle: '',
    contractDescription: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    contractNote: '',
    timeOffPolicyIds: [] as string[],
  });

  const [employeeForm, setEmployeeForm] = useState(getEmptyEmployeeForm);
  const autoCreateGuard = useAutoCreateGuard();
  const [createdEmployeeId, setCreatedEmployeeId] = useState<string | null>(null);
  const sentEmployeeCustomFieldIds = useRef<Set<string>>(new Set());
  const assignedTimeOffPolicyIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadEmployees();
    loadEmployeeDirectory();
    loadEmployeeCustomFields();
    loadEmployeeStatuses();
    loadEmployeeDepartments();
    loadEmployeeJobTitles();
    loadTimeOffPolicies();
    loadPayFrequencies();
    loadViews();
    api
      .listTenantUsers(token)
      .then(setTenantUsers)
      .catch(() => {
        // Non-critical — the Tasks assignee dropdown just falls back to empty if it fails.
      });
    api
      .listAssignableRoles(token)
      .then(setAssignableRoles)
      .catch(() => {
        // Non-critical — the "Invite to app" role picker just falls back to the server's default
        // (Member) if this fails to load.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEmployeeDepartments = async () => {
    try {
      const defs = await api.listFieldCatalogDefinitions(token, 'department');
      setEmployeeDepartments(defs);
    } catch (error) {
      toast.error(t('employees.toasts.departmentsLoadFailed', { error: (error as Error).message }));
    }
  };

  const loadEmployeeJobTitles = async () => {
    try {
      const defs = await api.listFieldCatalogDefinitions(token, 'jobTitle');
      setEmployeeJobTitles(defs);
    } catch (error) {
      toast.error(t('employees.toasts.jobTitlesLoadFailed', { error: (error as Error).message }));
    }
  };

  const loadViews = async () => {
    try {
      const data = await api.listViews(token, 'employee');
      setViews(data);
    } catch (error) {
      toast.error(t('employees.toasts.viewsLoadFailed', { error: (error as Error).message }));
    }
  };

  const loadTimeOffPolicies = async () => {
    try {
      const policies = await api.listTimeOffPolicies(token);
      setTimeOffPolicies(policies.filter((p) => p.isActive));
    } catch (error) {
      toast.error(t('employees.toasts.timeOffPoliciesLoadFailed', { error: (error as Error).message }));
    }
  };

  const loadPayFrequencies = async () => {
    try {
      const frequencies = await api.listPayFrequencies(token);
      setPayFrequencies(frequencies.filter((f) => f.isActive));
    } catch (error) {
      toast.error(t('employees.toasts.payFrequenciesLoadFailed', { error: (error as Error).message }));
    }
  };

  const loadEmployeeCustomFields = async () => {
    try {
      const defs = await api.listCustomFieldDefinitions(token, 'employee');
      setEmployeeCustomFields(defs);
    } catch (error) {
      toast.error(t('employees.toasts.customFieldsLoadFailed', { error: (error as Error).message }));
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
      toast.success(t('employees.toasts.fieldAdded', { name: input.name }));
      loadEmployeeCustomFields();
    } catch (error) {
      toast.error(t('employees.toasts.fieldAddFailed', { error: (error as Error).message }));
    }
  };

  const handleUpdateCustomFieldColumn = async (
    id: string,
    data: { name?: string; required?: boolean; options?: string },
  ) => {
    try {
      await api.updateCustomFieldDefinition(token, id, data);
      toast.success(t('employees.toasts.fieldUpdated'));
      loadEmployeeCustomFields();
    } catch (error) {
      toast.error(t('employees.toasts.fieldUpdateFailed', { error: (error as Error).message }));
    }
  };

  const handleDeactivateCustomFieldColumn = async (id: string) => {
    try {
      await api.updateCustomFieldDefinition(token, id, { isActive: false });
      toast.success(t('employees.toasts.fieldDeleted'));
      loadEmployeeCustomFields();
    } catch (error) {
      toast.error(t('employees.toasts.fieldDeleteFailed', { error: (error as Error).message }));
    }
  };

  const loadEmployeeStatuses = async () => {
    try {
      const statuses = await api.listStatusDefinitions(token, 'employee');
      setEmployeeStatuses(statuses);
    } catch (error) {
      toast.error(t('employees.toasts.statusesLoadFailed', { error: (error as Error).message }));
    }
  };

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const data = await api.listEmployees(token);
      setEmployees(data);
    } catch (error) {
      toast.error(t('employees.toasts.loadFailed', { error: (error as Error).message }));
    } finally {
      setLoading(false);
    }
  };

  const loadEmployeeDirectory = async () => {
    try {
      const data = await api.listEmployeeDirectory(token);
      setEmployeeDirectory(data);
    } catch (error) {
      toast.error(t('employees.toasts.directoryLoadFailed', { error: (error as Error).message }));
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
    autoCreateGuard.reset();
    setCreatedEmployeeId(null);
    sentEmployeeCustomFieldIds.current = new Set();
    assignedTimeOffPolicyIds.current = new Set();
  };

  const handleOpenAdd = () => {
    setEmployeeForm(getEmptyEmployeeForm());
    setCustomFieldValues({});
    autoCreateGuard.reset();
    setCreatedEmployeeId(null);
    sentEmployeeCustomFieldIds.current = new Set();
    assignedTimeOffPolicyIds.current = new Set();
    setSlideOverMode('add');
  };

  usePrimaryAction({ label: t('employees.primaryAction'), onClick: handleOpenAdd });

  const handleLoadSampleData = async () => {
    setSeedingSample(true);
    try {
      const result = await api.seedSampleData(token);
      toast.success(t('employees.toasts.sampleDataAdded', { employees: result.employees, companies: result.companies }));
      await loadEmployees();
      await loadEmployeeDirectory();
    } catch (error) {
      toast.error(t('employees.toasts.sampleDataFailed', { error: (error as Error).message }));
    } finally {
      setSeedingSample(false);
    }
  };

  // Ready once every required field (the 3 fixed ones + any required custom
  // field) is filled and shaped like a valid value — gates the auto-create
  // effect below so it doesn't fire on an obviously unfinished form. Accepts
  // an explicit custom-field-values override for the one commit path
  // (a required custom field of type "select") whose onChange needs to check
  // readiness against a value that hasn't reached state yet — see
  // useAutoCreateGuard.ts for why blur-triggered checks don't need this.
  const isEmployeeAddReady = (cfValues: Record<string, string> = customFieldValues) => {
    if (!employeeForm.personType) return false;
    if (!employeeForm.firstName.trim() || !employeeForm.lastName.trim()) return false;
    if (!isLikelyValidEmail(employeeForm.email)) return false;
    if (!employeeForm.departmentId) return false;
    if (!employeeForm.managerId) return false;
    if (!employeeForm.startDate) return false;
    if (!employeeForm.contractType) return false;
    // Contractor/Employee can't be saved without a complete initial contract
    // (docs/spec-payroll.md Unidad 4/5) — Profile never shows or needs this.
    if (employeeForm.personType === 'contractor' || employeeForm.personType === 'employee') {
      if (!employeeForm.compensationType) return false;
      if (!employeeForm.rateAmount.trim() || Number.isNaN(Number.parseFloat(employeeForm.rateAmount))) return false;
      if (!employeeForm.currency.trim()) return false;
      if (!employeeForm.payFrequencyId) return false;
      if (!employeeForm.contractJobTitle.trim()) return false;
      if (!employeeForm.contractDescription.trim()) return false;
      if (!employeeForm.effectiveFrom) return false;
    }
    for (const field of activeEmployeeCustomFields) {
      if (field.required && !(cfValues[field.id] || '').trim()) return false;
    }
    return true;
  };

  // A newly created employee can land on any page once merged into the
  // current search/filter/sort (the list has no guaranteed backend order,
  // and an active sort can put it anywhere) — without this, closing the
  // detail panel after an auto-create could leave the user staring at a
  // table that looks unchanged because the new row is a page or two away.
  // Recomputes the same search -> filter -> sort pipeline the render body
  // uses, against the fresh list, and jumps to whichever page contains it.
  const jumpToEmployeePage = (list: any[], employeeId: string) => {
    const query = employeeSearch.trim().toLowerCase();
    const searchFiltered = list.filter((emp) => {
      if (!query) return true;
      return (
        `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(query) ||
        emp.email.toLowerCase().includes(query) ||
        (emp.departmentDefn?.name ?? '').toLowerCase().includes(query)
      );
    });
    const tagFiltered =
      selectedTagFilter.length === 0
        ? searchFiltered
        : searchFiltered.filter((emp) => (emp.tags || []).some((t: any) => selectedTagFilter.includes(t.name)));
    const filtered = applyFilters(tagFiltered, fields, viewFilters);
    const sorted = applySort(filtered, fields, viewSort);
    const index = sorted.findIndex((e) => e.id === employeeId);
    if (index !== -1) setPage(Math.floor(index / PAGE_SIZE) + 1);
  };

  // The actual creation + hand-off, shared by the manual "Create" button and
  // the auto-create-on-required-complete path below — both go through
  // autoCreateGuard so only one of them ever actually fires. On success, the
  // Add form is replaced by the real EmployeeOverviewPanel for the new
  // employee — same component used for an already-created profile, not a
  // visual copy of it (2026-08, see docs/tareas-desarrollo.md).
  // Fires in the background as soon as the required fields are ready — a
  // safety net, not the point where the user is "done". Does NOT close the
  // Add form or navigate; handleCreateEmployee (the real "Create" button)
  // does that once the user is actually finished (backlog QA, 2026-08-27 —
  // see useAutoCreateGuard.ts).
  const createEmployeeRecord = async (cfValues: Record<string, string> = customFieldValues) => {
    const employee = await api.createEmployee(token, {
      firstName: employeeForm.firstName.trim(),
      lastName: employeeForm.lastName.trim(),
      email: employeeForm.email.trim(),
      personalEmail: employeeForm.personalEmail || undefined,
      departmentId: employeeForm.departmentId || null,
      jobTitleId: employeeForm.jobTitleId || null,
      managerId: employeeForm.managerId && employeeForm.managerId !== 'none' ? employeeForm.managerId : null,
      startDate: employeeForm.startDate || undefined,
      endDate: employeeForm.endDate || undefined,
      contractUrl: employeeForm.contractUrl || undefined,
      contractType: (employeeForm.contractType || null) as 'part_time' | 'full_time' | null,
      personType: (employeeForm.personType || null) as 'profile' | 'contractor' | 'employee' | null,
      nationality: employeeForm.nationality || undefined,
    });

    if (employeeForm.personType === 'contractor' || employeeForm.personType === 'employee') {
      await api.createCompensation(token, {
        employeeId: employee.id,
        compensationType: employeeForm.compensationType as 'hourly' | 'fixed',
        rateCents: Math.round(Number.parseFloat(employeeForm.rateAmount) * 100),
        currency: employeeForm.currency.trim().toUpperCase(),
        payFrequencyId: employeeForm.payFrequencyId,
        jobTitle: employeeForm.contractJobTitle.trim(),
        description: employeeForm.contractDescription.trim(),
        effectiveFrom: employeeForm.effectiveFrom,
        note: employeeForm.contractNote || undefined,
      });
    }

    const valueEntries = Object.entries(cfValues).filter(([, value]) => value.trim() !== '');
    for (const [customFieldDefinitionId, value] of valueEntries) {
      await api.createEmployeeCustomFieldValue(token, employee.id, {
        customFieldDefinitionId,
        value,
      });
      sentEmployeeCustomFieldIds.current.add(customFieldDefinitionId);
    }

    for (const timeOffPolicyId of employeeForm.timeOffPolicyIds) {
      await api.assignTimeOffPolicyToEmployee(token, employee.id, timeOffPolicyId);
      assignedTimeOffPolicyIds.current.add(timeOffPolicyId);
    }

    setCreatedEmployeeId(employee.id);
    return employee;
  };

  // PATCHes the record createEmployeeRecord already persisted, with whatever
  // the user filled in afterward. Custom field values and Time Off policy
  // assignments only get sent for entries not already sent at auto-create
  // time. Compensation (rate/currency/pay frequency) isn't re-synced here —
  // those fields are already required for auto-create readiness, so they're
  // set once at creation; changing them afterward isn't handled by this
  // form (same accepted-gap pattern as Opportunity/Company/Contact).
  const updateEmployeeRecord = async (employeeId: string, cfValues: Record<string, string>) => {
    await api.updateEmployee(token, employeeId, {
      firstName: employeeForm.firstName.trim(),
      lastName: employeeForm.lastName.trim(),
      email: employeeForm.email.trim(),
      personalEmail: employeeForm.personalEmail || undefined,
      departmentId: employeeForm.departmentId || null,
      jobTitleId: employeeForm.jobTitleId || null,
      managerId: employeeForm.managerId && employeeForm.managerId !== 'none' ? employeeForm.managerId : null,
      startDate: employeeForm.startDate || undefined,
      endDate: employeeForm.endDate || undefined,
      contractUrl: employeeForm.contractUrl || undefined,
      contractType: (employeeForm.contractType || null) as 'part_time' | 'full_time' | null,
      nationality: employeeForm.nationality || undefined,
    } as any);

    const newCfEntries = Object.entries(cfValues).filter(
      ([id, value]) => value.trim() !== '' && !sentEmployeeCustomFieldIds.current.has(id),
    );
    for (const [customFieldDefinitionId, value] of newCfEntries) {
      await api.createEmployeeCustomFieldValue(token, employeeId, { customFieldDefinitionId, value });
      sentEmployeeCustomFieldIds.current.add(customFieldDefinitionId);
    }

    const newPolicyIds = employeeForm.timeOffPolicyIds.filter((id) => !assignedTimeOffPolicyIds.current.has(id));
    for (const timeOffPolicyId of newPolicyIds) {
      await api.assignTimeOffPolicyToEmployee(token, employeeId, timeOffPolicyId);
      assignedTimeOffPolicyIds.current.add(timeOffPolicyId);
    }
  };

  const attemptAutoCreateEmployee = (cfValues: Record<string, string> = customFieldValues) => {
    autoCreateGuard.attempt(isEmployeeAddReady(cfValues), async () => {
      try {
        await createEmployeeRecord(cfValues);
      } catch (error) {
        toast.error(t('employees.toasts.employeeCreateFailed', { error: (error as Error).message }));
        throw error;
      }
    });
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let id = createdEmployeeId;
      if (id) {
        await updateEmployeeRecord(id, customFieldValues);
      } else {
        const employee = await createEmployeeRecord(customFieldValues);
        id = employee.id;
      }
      toast.success(t('employees.toasts.employeeAdded'));
      const freshList = await api.listEmployees(token);
      setEmployees(freshList);
      loadEmployeeDirectory();
      jumpToEmployeePage(freshList, id);
      setSlideOverMode(null);
      setCreatedEmployeeId(null);
      setCustomFieldValues({});
      setOverviewEmployeeId(id);
    } catch (error) {
      toast.error(t('employees.toasts.employeeCreateFailed', { error: (error as Error).message }));
    }
  };

  const openInviteEmployee = (employee: any) => {
    setInvitingEmployee(employee);
    setInviteRoleId(assignableRoles.find((r) => r.name === 'Member')?.id ?? assignableRoles[0]?.id ?? '');
  };

  const handleInviteEmployee = async () => {
    if (!invitingEmployee) return;
    setInviting(true);
    try {
      const { invitation } = await api.inviteEmployee(token, invitingEmployee.id, inviteRoleId || undefined);
      const link = `${window.location.origin}/accept-invite/${invitation.token}`;
      await navigator.clipboard.writeText(link);
      toast.success(t('employees.toasts.invitationSent'));
      setInvitingEmployee(null);
      loadEmployees();
    } catch (error) {
      toast.error(t('employees.toasts.invitationFailed', { error: (error as Error).message }));
    } finally {
      setInviting(false);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!deletingEmployee) return;
    try {
      await api.deleteEmployee(token, deletingEmployee.id);
      toast.success(t('employees.toasts.employeeDeleted', { name: `${deletingEmployee.firstName} ${deletingEmployee.lastName}` }));
      setDeletingEmployee(null);
      loadEmployees();
      loadEmployeeDirectory();
    } catch (error) {
      toast.error(t('employees.toasts.employeeDeleteFailed', { error: (error as Error).message }));
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
      toast.error(t('employees.toasts.moveFailed', { error: (error as Error).message }));
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
      toast.success(t('employees.toasts.viewCreated', { name: view.name }));
    } catch (error) {
      toast.error(t('employees.toasts.viewCreateFailed', { error: (error as Error).message }));
    }
  };

  const handleRenameView = async (id: string, name: string) => {
    try {
      const updated = await api.updateView(token, id, { name });
      setViews((current) => current.map((v) => (v.id === id ? updated : v)));
    } catch (error) {
      toast.error(t('employees.toasts.viewRenameFailed', { error: (error as Error).message }));
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
      toast.success(t('employees.toasts.viewDuplicated', { name: created.name }));
    } catch (error) {
      toast.error(t('employees.toasts.viewDuplicateFailed', { error: (error as Error).message }));
    }
  };

  const handleDeleteView = async (id: string) => {
    try {
      await api.deleteView(token, id);
      setViews((current) => current.filter((v) => v.id !== id));
      if (activeViewId === id) setActiveViewId(null);
      toast.success(t('employees.toasts.viewDeleted'));
    } catch (error) {
      toast.error(t('employees.toasts.viewDeleteFailed', { error: (error as Error).message }));
    }
  };

  const renderCustomFieldInput = (
    field: any,
    values: Record<string, string>,
    setValues: (values: Record<string, string>) => void,
    idPrefix: string,
    // Fired with the merged next-values object on commit (blur for text,
    // change for select — same asymmetry as AutoSaveField/AutoSaveSelect) so
    // a caller like the auto-create check below can read a value that
    // hasn't reached state yet without racing React's async setState.
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

  const columns = [
    {
      key: 'name',
      label: t('employees.columns.name'),
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
              title={t('employees.onTimeOffToday', { policyName: emp.activeTimeOffTag.policyName })}
            >
              {emp.activeTimeOffTag.policyName}
            </span>
          )}
        </div>
      ),
    },
    { key: 'email', label: t('employees.columns.email'), render: (emp: any) => emp.email },
    { key: 'personalEmail', label: t('employees.columns.personalEmail'), render: (emp: any) => emp.personalEmail || '—' },
    {
      key: 'department',
      label: t('employees.columns.department'),
      render: (emp: any) =>
        emp.departmentDefn ? (
          <CategoryChip label={emp.departmentDefn.name} seed={emp.departmentDefn.id} />
        ) : (
          '—'
        ),
    },
    {
      key: 'jobTitle',
      label: t('employees.columns.jobTitle'),
      render: (emp: any) =>
        emp.jobTitleDefn ? <CategoryChip label={emp.jobTitleDefn.name} seed={emp.jobTitleDefn.id} /> : '—',
    },
    {
      key: 'status',
      label: t('employees.columns.status'),
      render: (emp: any) =>
        emp.statusDefn && <StatusChip color={emp.statusDefn.color || '#6b7280'} label={emp.statusDefn.name} />,
    },
    {
      key: 'startDate',
      label: t('employees.columns.startDate'),
      render: (emp: any) => (emp.startDate ? new Date(emp.startDate).toLocaleDateString() : '—'),
    },
    {
      key: 'endDate',
      label: t('employees.columns.endDate'),
      render: (emp: any) => (emp.endDate ? new Date(emp.endDate).toLocaleDateString() : '—'),
    },
    {
      key: 'contractUrl',
      label: t('employees.columns.contractUrl'),
      render: (emp: any) =>
        emp.contractUrl ? (
          <a href={emp.contractUrl} target="_blank" rel="noopener noreferrer" className="table-link">
            {t('employees.columns.contractUrlView')}
          </a>
        ) : (
          '—'
        ),
    },
    {
      key: 'contractType',
      label: t('employees.columns.contractType'),
      render: (emp: any) => (emp.contractType ? CONTRACT_TYPE_LABELS[emp.contractType] : '—'),
    },
    {
      key: 'personType',
      label: t('employees.columns.personType'),
      render: (emp: any) => (emp.personType ? PERSON_TYPE_LABELS[emp.personType] : '—'),
    },
    {
      key: 'contractStatus',
      label: t('employees.columns.contractStatus'),
      // No chip at all for Profile or "never had a compensation" — Payroll
      // Unidad 11 treats those as not applicable, not as a 4th chip state.
      render: (emp: any) =>
        emp.contractStatus && CONTRACT_STATUS_CHIPS[emp.contractStatus as keyof typeof CONTRACT_STATUS_CHIPS] ? (
          <StatusChip {...CONTRACT_STATUS_CHIPS[emp.contractStatus as keyof typeof CONTRACT_STATUS_CHIPS]} />
        ) : (
          '—'
        ),
    },
    {
      key: 'payFrequencyName',
      label: t('employees.columns.payFrequency'),
      render: (emp: any) => emp.payFrequencyName || '—',
    },
  ];

  const toggleableColumns = [
    ...columns,
    { key: 'managerName', label: t('employees.columns.managerName') },
    { key: 'timeOffPolicies', label: t('employees.columns.timeOffPolicies') },
    { key: 'tags', label: t('employees.columns.tags') },
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
  const showTagsColumn = !isColumnHidden('tags');
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
    (showTagsColumn ? 1 : 0) +
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
      {showTagsColumn && (
        <td>
          {emp.tags && emp.tags.length > 0 ? (
            <div className="flex flex-wrap items-center">
              {emp.tags.map((tag: any) => (
                <span key={tag.tagAssignmentId} className="time-off-policy-chip">
                  {tag.name}
                </span>
              ))}
            </div>
          ) : (
            '—'
          )}
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
            <span className="tip">{t('employees.deleteTooltip')}</span>
            <TrashIcon />
          </button>
          {canManageCustomFields &&
            (emp.userId ? (
              <span className="chip-linked">{t('employees.linkedChip')}</span>
            ) : (
              <button className="icon-btn" onClick={() => openInviteEmployee(emp)}>
                <span className="tip">{t('employees.inviteTooltip')}</span>
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
          {t('common.add')}
        </span>
      </td>
    </tr>
  );

  return (
    <div className="page-full">
      {deletingEmployee && (
        <ConfirmDialog
          title={t('employees.confirmDelete.title')}
          message={t('employees.confirmDelete.message', {
            name: `${deletingEmployee.firstName} ${deletingEmployee.lastName}`,
          })}
          confirmLabel={t('common.delete')}
          onConfirm={handleDeleteEmployee}
          onCancel={() => setDeletingEmployee(null)}
        />
      )}

      <Modal
        open={slideOverMode !== null}
        title={t('employees.modal.addTitle')}
        onClose={closeSlideOver}
        wide
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeSlideOver}>
              {t('common.cancel')}
            </button>
            <button type="submit" form="employee-form" className="btn-primary" disabled={autoCreateGuard.isBusy}>
              {t('common.create')}
            </button>
          </>
        }
      >
        {slideOverMode === 'add' && (
          <form id="employee-form" onSubmit={handleCreateEmployee}>
            <div className="field-group">
              <h4 className="field-group-title">{t('employees.groups.type')}</h4>
              <div className="field-group-body">
                <Field label={t('employees.fields.type')} required>
                  <select
                    id="emp-personType"
                    className="overview-field-input"
                    value={employeeForm.personType}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, personType: e.target.value })}
                    required
                  >
                    <option value="">{t('common.selectPlaceholder')}</option>
                    <option value="profile">{t('employees.personTypeOptions.profile')}</option>
                    <option value="contractor">{t('employees.personTypeOptions.contractor')}</option>
                    <option value="employee">{t('employees.personTypeOptions.employee')}</option>
                  </select>
                </Field>
              </div>
            </div>

            <div className="field-group">
              <h4 className="field-group-title">{t('employees.groups.identity')}</h4>
              <div className="field-group-body">
                <Field label={t('employees.fields.firstName')} required>
                  <input
                    id="emp-firstName"
                    className="overview-field-input"
                    type="text"
                    value={employeeForm.firstName}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, firstName: e.target.value })}
                    onBlur={() => attemptAutoCreateEmployee()}
                    required
                  />
                </Field>
                <Field label={t('employees.fields.lastName')} required>
                  <input
                    id="emp-lastName"
                    className="overview-field-input"
                    type="text"
                    value={employeeForm.lastName}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, lastName: e.target.value })}
                    onBlur={() => attemptAutoCreateEmployee()}
                    required
                  />
                </Field>
                <Field label={t('employees.fields.businessEmail')} required>
                  <input
                    id="emp-email"
                    className="overview-field-input"
                    type="email"
                    value={employeeForm.email}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                    onBlur={() => attemptAutoCreateEmployee()}
                    required
                  />
                </Field>
                <Field label={t('employees.fields.personalEmail')}>
                  <input
                    id="emp-personalEmail"
                    className="overview-field-input"
                    type="email"
                    value={employeeForm.personalEmail}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, personalEmail: e.target.value })}
                  />
                </Field>
                <Field label={t('employees.fields.nationality')}>
                  <select
                    id="emp-nationality"
                    className="overview-field-input"
                    value={employeeForm.nationality}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, nationality: e.target.value })}
                  >
                    <option value="">{t('common.selectPlaceholder')}</option>
                    {COUNTRIES.map((country) => (
                      <option key={country} value={country}>
                        {country}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <div className="field-group">
              <h4 className="field-group-title">{t('employees.groups.role')}</h4>
              <div className="field-group-body">
                <Field label={t('employees.fields.department')} required>
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    <select
                      id="emp-departmentId"
                      className="overview-field-input"
                      value={employeeForm.departmentId}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, departmentId: e.target.value })}
                      required
                    >
                      <option value="">{t('common.selectPlaceholder')}</option>
                      {employeeDepartments
                        .filter((d) => d.isActive)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                    </select>
                    <FieldCatalogMenu
                      token={token}
                      kind="department"
                      label={t('employees.fields.department')}
                      entries={employeeDepartments}
                      onChanged={loadEmployeeDepartments}
                    />
                  </div>
                </Field>
                <Field label={t('employees.fields.jobTitle')}>
                  <select
                    id="emp-jobTitleId"
                    className="overview-field-input"
                    value={employeeForm.jobTitleId}
                    onChange={(e) => {
                      const jobTitleId = e.target.value;
                      const jobTitleName = employeeJobTitles.find((j) => j.id === jobTitleId)?.name ?? '';
                      // Pre-fills the contract's Job Title snapshot (Payroll
                      // Unidad 5) — a starting point, not linked afterward;
                      // typing over it in the Initial Compensation section
                      // below isn't overwritten again unless this select
                      // changes once more.
                      setEmployeeForm({ ...employeeForm, jobTitleId, contractJobTitle: jobTitleName });
                    }}
                  >
                    <option value="">{t('common.nonePlaceholder')}</option>
                    {employeeJobTitles
                      .filter((j) => j.isActive)
                      .map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label={t('employees.fields.reportsTo')} required>
                  <select
                    id="emp-managerId"
                    className="overview-field-input"
                    value={employeeForm.managerId}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, managerId: e.target.value })}
                    required
                  >
                    <option value="">{t('common.selectPlaceholder')}</option>
                    <option value="none">{t('employees.noManagerOption')}</option>
                    {employeeDirectory.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <div className="field-group">
              <h4 className="field-group-title">{t('employees.groups.contract')}</h4>
              <div className="field-group-body">
                <Field label={t('employees.fields.startDate')} required>
                  <input
                    id="emp-startDate"
                    className="overview-field-input"
                    type="date"
                    value={employeeForm.startDate}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, startDate: e.target.value })}
                    required
                  />
                </Field>
                <Field label={t('employees.fields.contractUrl')}>
                  <input
                    id="emp-contractUrl"
                    className="overview-field-input"
                    type="url"
                    value={employeeForm.contractUrl}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, contractUrl: e.target.value })}
                    placeholder="https://drive.google.com/..."
                  />
                </Field>
                <Field label={t('employees.fields.contractType')} required>
                  <select
                    id="emp-contractType"
                    className="overview-field-input"
                    value={employeeForm.contractType}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, contractType: e.target.value })}
                    required
                  >
                    <option value="">{t('common.selectPlaceholder')}</option>
                    <option value="part_time">{t('employees.contractTypeLabels.part_time')}</option>
                    <option value="full_time">{t('employees.contractTypeLabels.full_time')}</option>
                  </select>
                </Field>
              </div>
            </div>

            {(employeeForm.personType === 'contractor' || employeeForm.personType === 'employee') && (
              <div className="field-group">
                <h4 className="field-group-title">{t('employees.groups.initialCompensation')}</h4>
                <div className="field-group-body">
                  <Field label={t('employees.fields.compensationType')} required>
                    <select
                      id="emp-comp-type"
                      className="overview-field-input"
                      value={employeeForm.compensationType}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, compensationType: e.target.value })}
                      required
                    >
                      <option value="">{t('common.selectPlaceholder')}</option>
                      <option value="hourly">{t('employees.compensationTypeOptions.hourly')}</option>
                      <option value="fixed">{t('employees.compensationTypeOptions.fixed')}</option>
                    </select>
                  </Field>
                  <Field label={t('employees.fields.rate', { currency: employeeForm.currency || 'USD' })} required>
                    <input
                      id="emp-comp-rate"
                      className="overview-field-input"
                      type="number"
                      step="0.01"
                      min="0"
                      value={employeeForm.rateAmount}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, rateAmount: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label={t('employees.fields.currency')} required>
                    <select
                      id="emp-comp-currency"
                      className="overview-field-input"
                      value={employeeForm.currency}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, currency: e.target.value })}
                      required
                    >
                      <option value="">{t('common.selectPlaceholder')}</option>
                      {CURRENCY_CODES.map((code) => (
                        <option key={code} value={code}>
                          {currencyLabel(code)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('employees.fields.payFrequency')} required>
                    <select
                      id="emp-comp-payFrequencyId"
                      className="overview-field-input"
                      value={employeeForm.payFrequencyId}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, payFrequencyId: e.target.value })}
                      required
                    >
                      <option value="">{t('common.selectPlaceholder')}</option>
                      {payFrequencies.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('employees.fields.contractJobTitle')} required>
                    <input
                      id="emp-comp-jobTitle"
                      className="overview-field-input"
                      type="text"
                      value={employeeForm.contractJobTitle}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, contractJobTitle: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label={t('employees.fields.effectiveFrom')} required>
                    <input
                      id="emp-comp-effectiveFrom"
                      className="overview-field-input"
                      type="date"
                      value={employeeForm.effectiveFrom}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, effectiveFrom: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label={t('employees.fields.roleDescription')} required full>
                    <textarea
                      id="emp-comp-description"
                      className="overview-field-input"
                      value={employeeForm.contractDescription}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, contractDescription: e.target.value })}
                      required
                    />
                  </Field>
                  <Field label={t('employees.fields.note')} full>
                    <input
                      id="emp-comp-note"
                      className="overview-field-input"
                      type="text"
                      value={employeeForm.contractNote}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, contractNote: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            )}

            {(employeeForm.personType === 'contractor' || employeeForm.personType === 'employee') && (
              <div className="field-group">
                <h4 className="field-group-title">{t('employees.groups.timeOff')}</h4>
                <div className="field-group-body">
                  {timeOffPolicies.length === 0 ? (
                    <p className="text-sm text-ink-faint">{t('employees.noTimeOffPolicies')}</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {timeOffPolicies.map((policy) => (
                        <label key={policy.id} className="flex items-center gap-2 text-sm font-normal">
                          <input
                            type="checkbox"
                            checked={employeeForm.timeOffPolicyIds.includes(policy.id)}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                timeOffPolicyIds: e.target.checked
                                  ? [...employeeForm.timeOffPolicyIds, policy.id]
                                  : employeeForm.timeOffPolicyIds.filter((id) => id !== policy.id),
                              })
                            }
                          />
                          {policy.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeEmployeeCustomFields.length > 0 && (
              <div className="field-group">
                <h4 className="field-group-title">{t('employees.groups.customFields')}</h4>
                <div className="field-group-body">
                  {activeEmployeeCustomFields.map((field) => (
                    <Field key={field.id} label={field.name} required={field.required}>
                      {renderCustomFieldInput(
                        field,
                        customFieldValues,
                        setCustomFieldValues,
                        'emp-cf',
                        (next) => attemptAutoCreateEmployee(next),
                      )}
                    </Field>
                  ))}
                </div>
              </div>
            )}
          </form>
        )}

      </Modal>

      <ViewsBar
        allLabel={t('employees.toolbar.allPeople')}
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
        <h2>{t('employees.toolbar.heading')}</h2>
        {employees.length > 0 && (
          <div className="toolbar-search">
            <SearchIcon />
            <label htmlFor="employee-search" className="sr-only">
              {t('employees.toolbar.searchLabel')}
            </label>
            <input
              id="employee-search"
              type="text"
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              placeholder={t('employees.toolbar.searchPlaceholder')}
            />
          </div>
        )}
        {allTagOptions.length > 0 && (
          <MultiSelectDropdown
            id="employee-tag-filter"
            options={allTagOptions}
            selected={selectedTagFilter}
            onChange={setSelectedTagFilter}
            placeholder={t('employees.toolbar.filterByTag')}
            emptyMessage={t('employees.toolbar.noTagsYet')}
          />
        )}
        {viewType !== 'kanban' && <FilterBar fields={fields} filters={viewFilters} onChange={setViewFilters} />}
        {viewType !== 'kanban' && (
          <ColumnVisibilityMenu columns={toggleableColumns} isHidden={isColumnHidden} onToggle={toggleColumn} />
        )}
        {canManagePayroll && (
          <CsvImportExportMenu
            ref={csvMenuRef}
            token={token}
            onImported={loadEmployees}
            entityLabelPlural={t('employees.csvPlural')}
            entityLabelSingular={t('employees.csvSingular')}
            exportCsv={api.exportEmployeesCsv}
            importCsv={api.importEmployeesCsv}
            csvTemplate={api.employeesCsvTemplate}
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
      ) : employees.length === 0 ? (
        <EmptyState
          icon={<PeopleIcon />}
          title={t('employees.emptyState.title')}
          body={t('employees.emptyState.body')}
          primaryLabel={t('employees.emptyState.primaryLabel')}
          onPrimary={handleOpenAdd}
          secondaryLabel={canManagePayroll ? t('employees.emptyState.importCsv') : undefined}
          onSecondary={canManagePayroll ? () => csvMenuRef.current?.openImport() : undefined}
        >
          <button type="button" className="btn-ghost btn-md" onClick={handleLoadSampleData} disabled={seedingSample}>
            {seedingSample ? t('common.loading') : t('employees.emptyState.loadSampleData')}
          </button>
        </EmptyState>
      ) : viewType === 'kanban' ? (
        !groupFieldForKanban ? (
          <p className="mt-4">{t('employees.groupByBroken')}</p>
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
                      {t('common.add')}
                    </div>
                  )
                : undefined
            }
          />
        )
      ) : viewType === 'list' && !groupFieldForKanban ? (
        <p className="mt-4">{t('employees.groupByBroken')}</p>
      ) : sortedEmployees.length === 0 ? (
        <EmptyState
          icon={<SearchIcon />}
          title={t('employees.noMatches.title', { search: employeeSearch })}
          body={t('employees.noMatches.body')}
          primaryLabel={t('employees.noMatches.clearFilters')}
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
                {showTagsColumn && <col style={{ width: getColumnWidth('tags') }} />}
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
                          label={t('employees.fields.department')}
                          entries={employeeDepartments}
                          onChanged={loadEmployeeDepartments}
                          onHide={() => hideColumn('department')}
                        />
                      )}
                      {col.key === 'jobTitle' && canManageCustomFields && (
                        <FieldCatalogMenu
                          token={token}
                          kind="jobTitle"
                          label={t('employees.fields.jobTitle')}
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
                      {t('employees.columns.managerName')}
                      <ColumnResizeHandle onMouseDown={(e) => startResize('managerName', e)} />
                    </th>
                  )}
                  {showTimeOffPoliciesColumn && (
                    <th>
                      {t('employees.columns.timeOffPolicies')}
                      <ColumnResizeHandle onMouseDown={(e) => startResize('timeOffPolicies', e)} />
                    </th>
                  )}
                  {showTagsColumn && (
                    <th>
                      {t('employees.columns.tags')}
                      <ColumnResizeHandle onMouseDown={(e) => startResize('tags', e)} />
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
            employees={employeeDirectory}
            token={token}
            tenantUsers={tenantUsers}
            currentUserId={user.id}
            customFields={activeEmployeeCustomFields}
            statuses={activeEmployeeStatuses}
            departments={employeeDepartments}
            jobTitles={employeeJobTitles}
            timeOffPolicies={timeOffPolicies}
            canManageEmployees={canEditEmployees}
            canManagePayroll={canManagePayroll}
            onClose={() => setOverviewEmployeeId(null)}
            onChanged={refreshEmployeesSilently}
            onSaved={patchEmployeeInList}
            onRequestDelete={() => {
              setOverviewEmployeeId(null);
              setDeletingEmployee(overviewEmployee);
            }}
            onInvite={() => openInviteEmployee(overviewEmployee)}
          />
        );
      })()}

      {/* Rendered after EmployeeOverviewPanel (not near the page's other modals above) so it
          paints on top: both this Modal and the overview panel's own .detail-modal-overlay wrapper
          share the same z-50 stacking level, and among same-z-index fixed-position siblings DOM
          order decides who's on top — rendering it earlier put it behind the panel whenever it was
          opened from the panel's own Actions menu (found 2026-09-02, Alejandro's review). */}
      <Modal
        open={invitingEmployee !== null}
        title={t('employees.inviteModal.title')}
        onClose={() => setInvitingEmployee(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setInvitingEmployee(null)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn-primary" onClick={handleInviteEmployee} disabled={inviting}>
              {inviting ? t('employees.inviteModal.sending') : t('employees.inviteModal.sendInvitation')}
            </button>
          </>
        }
      >
        {invitingEmployee && (
          <div className="form-group">
            <p className="mb-3">
              {t('employees.inviteModal.description', {
                name: `${invitingEmployee.firstName} ${invitingEmployee.lastName}`,
                email: invitingEmployee.email,
              })}
            </p>
            <label htmlFor="invite-employee-role">{t('employees.inviteModal.roleLabel')}</label>
            <select id="invite-employee-role" value={inviteRoleId} onChange={(e) => setInviteRoleId(e.target.value)}>
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </Modal>
    </div>
  );
}
