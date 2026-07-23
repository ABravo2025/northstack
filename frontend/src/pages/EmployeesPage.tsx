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
import FieldCatalogMenu from '../components/FieldCatalogMenu';
import ColumnResizeHandle from '../components/ColumnResizeHandle';
import { useResizableColumns } from '../hooks/useResizableColumns';
import ColumnVisibilityMenu from '../components/ColumnVisibilityMenu';
import { useColumnVisibility } from '../hooks/useColumnVisibility';
import Avatar from '../components/Avatar';
import StatusChip from '../components/StatusChip';
import { MailIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from '../components/Icons';
import {
  applyFilters,
  applySort,
  buildEmployeeFields,
  findField,
  groupableFields,
  parseFilters,
  parseSort,
} from '../lib/viewFields';

const PAGE_SIZE = 20;
const ACTIVE_VIEW_STORAGE_KEY = 'northstack:activeView:employee';

function dollarsToCents(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? undefined : Math.round(parsed * 100);
}

function centsToDollars(cents: number | null | undefined): string {
  return cents == null ? '' : (cents / 100).toFixed(2);
}

function toDateInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

interface EmployeesPageProps {
  user: any;
  token: string;
}

export default function EmployeesPage({ user, token }: EmployeesPageProps) {
  const toast = useToast();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [slideOverMode, setSlideOverMode] = useState<'add' | 'edit' | null>(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<any | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [page, setPage] = useState(1);
  const [employeeCustomFields, setEmployeeCustomFields] = useState<any[]>([]);
  const [employeeStatuses, setEmployeeStatuses] = useState<any[]>([]);
  const [employeeDepartments, setEmployeeDepartments] = useState<any[]>([]);
  const [employeeJobTitles, setEmployeeJobTitles] = useState<any[]>([]);
  const [timeOffPolicies, setTimeOffPolicies] = useState<any[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [editCustomFieldValues, setEditCustomFieldValues] = useState<Record<string, string>>({});
  const [editCustomFieldValueIds, setEditCustomFieldValueIds] = useState<Record<string, string>>({});
  const [editAssignedPolicyIds, setEditAssignedPolicyIds] = useState<string[]>([]);
  const [originalAssignedPolicyIds, setOriginalAssignedPolicyIds] = useState<string[]>([]);

  const [views, setViews] = useState<SavedView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY),
  );
  const [viewFilters, setViewFilters] = useState<ViewFilter[]>([]);
  const [viewSort, setViewSort] = useState<ViewSort | null>(null);

  const canManageCustomFields = user.role === 'owner' || user.role === 'admin';
  const canEditEmployees = user.role === 'owner' || user.role === 'admin';
  const activeEmployeeCustomFields = employeeCustomFields.filter((field) => field.isActive);
  const activeEmployeeStatuses = employeeStatuses.filter((s) => s.isActive);
  const { getWidth: getColumnWidth, startResize } = useResizableColumns('northstack:columnWidths:employee');
  const { isHidden: isColumnHidden, toggle: toggleColumn, hide: hideColumn } = useColumnVisibility(
    'northstack:hiddenColumns:employee',
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
  };

  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm);

  const [editEmployeeForm, setEditEmployeeForm] = useState({ ...emptyEmployeeForm, statusId: '' });

  useEffect(() => {
    loadEmployees();
    loadEmployeeCustomFields();
    loadEmployeeStatuses();
    loadEmployeeDepartments();
    loadEmployeeJobTitles();
    loadTimeOffPolicies();
    loadViews();
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

  const closeSlideOver = () => {
    setSlideOverMode(null);
    setEditingEmployeeId(null);
    setCustomFieldValues({});
    setEditCustomFieldValues({});
    setEditCustomFieldValueIds({});
    setEditAssignedPolicyIds([]);
    setOriginalAssignedPolicyIds([]);
  };

  const handleOpenAdd = () => {
    setEmployeeForm(emptyEmployeeForm);
    setCustomFieldValues({});
    setSlideOverMode('add');
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

  const handleStartEditEmployee = (emp: any) => {
    setEditingEmployeeId(emp.id);
    setEditEmployeeForm({
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      personalEmail: emp.personalEmail || '',
      departmentId: emp.departmentId || '',
      jobTitleId: emp.jobTitleId || '',
      statusId: emp.statusId,
      managerId: emp.managerId || '',
      startDate: toDateInputValue(emp.startDate),
      endDate: toDateInputValue(emp.endDate),
      contractUrl: emp.contractUrl || '',
      hourlyRate: centsToDollars(emp.hourlyRateCents),
      monthlyRate: centsToDollars(emp.monthlyRateCents),
    });

    const values: Record<string, string> = {};
    const valueIds: Record<string, string> = {};
    for (const fieldValue of emp.customFieldVals || []) {
      values[fieldValue.customFieldDefinitionId] = fieldValue.value;
      valueIds[fieldValue.customFieldDefinitionId] = fieldValue.id;
    }
    setEditCustomFieldValues(values);
    setEditCustomFieldValueIds(valueIds);

    const assignedIds = (emp.timeOffPolicies || []).map((a: any) => a.timeOffPolicyId);
    setEditAssignedPolicyIds(assignedIds);
    setOriginalAssignedPolicyIds(assignedIds);
    setSlideOverMode('edit');
  };

  const handleToggleTimeOffPolicy = (policyId: string) => {
    setEditAssignedPolicyIds((current) =>
      current.includes(policyId) ? current.filter((id) => id !== policyId) : [...current, policyId],
    );
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployeeId) return;
    try {
      await api.updateEmployee(token, editingEmployeeId, {
        firstName: editEmployeeForm.firstName,
        lastName: editEmployeeForm.lastName,
        email: editEmployeeForm.email,
        personalEmail: editEmployeeForm.personalEmail || undefined,
        departmentId: editEmployeeForm.departmentId || null,
        jobTitleId: editEmployeeForm.jobTitleId || null,
        statusId: editEmployeeForm.statusId,
        managerId: editEmployeeForm.managerId || null,
        startDate: editEmployeeForm.startDate || undefined,
        endDate: editEmployeeForm.endDate || undefined,
        contractUrl: editEmployeeForm.contractUrl || undefined,
        ...(user.role === 'owner'
          ? {
              hourlyRateCents: dollarsToCents(editEmployeeForm.hourlyRate) ?? null,
              monthlyRateCents: dollarsToCents(editEmployeeForm.monthlyRate) ?? null,
            }
          : {}),
      });

      for (const field of activeEmployeeCustomFields) {
        const newValue = (editCustomFieldValues[field.id] || '').trim();
        const existingValueId = editCustomFieldValueIds[field.id];

        if (newValue === '' && existingValueId) {
          await api.deleteEmployeeCustomFieldValue(token, editingEmployeeId, existingValueId);
        } else if (newValue !== '' && existingValueId) {
          await api.updateEmployeeCustomFieldValue(token, editingEmployeeId, existingValueId, newValue);
        } else if (newValue !== '' && !existingValueId) {
          await api.createEmployeeCustomFieldValue(token, editingEmployeeId, {
            customFieldDefinitionId: field.id,
            value: newValue,
          });
        }
      }

      const policiesToAssign = editAssignedPolicyIds.filter((id) => !originalAssignedPolicyIds.includes(id));
      const policiesToUnassign = originalAssignedPolicyIds.filter((id) => !editAssignedPolicyIds.includes(id));
      for (const policyId of policiesToAssign) {
        await api.assignTimeOffPolicyToEmployee(token, editingEmployeeId, policyId);
      }
      for (const policyId of policiesToUnassign) {
        await api.unassignTimeOffPolicyFromEmployee(token, editingEmployeeId, policyId);
      }

      toast.success('Employee updated.');
      closeSlideOver();
      loadEmployees();
    } catch (error) {
      toast.error('Failed to update employee: ' + (error as Error).message);
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
    type: 'grid' | 'kanban';
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
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Business Email' },
    { key: 'personalEmail', label: 'Personal Email' },
    { key: 'department', label: 'Department' },
    { key: 'jobTitle', label: 'Job Title' },
    { key: 'status', label: 'Status' },
    { key: 'startDate', label: 'Start Date' },
    { key: 'endDate', label: 'End Date' },
    { key: 'contractUrl', label: 'Contract URL' },
    ...(user.role === 'owner'
      ? [
          { key: 'hourlyRate', label: 'Hourly Rate' },
          { key: 'monthlyRate', label: 'Monthly Rate' },
        ]
      : []),
  ];

  const toggleableColumns = [
    ...columns,
    { key: 'managerName', label: 'Reports To' },
    { key: 'timeOffPolicies', label: 'Time Off Policies' },
    ...activeEmployeeCustomFields.map((field) => ({ key: `cf:${field.id}`, label: field.name })),
  ];
  const visibleColumns = columns.filter((col) => !isColumnHidden(col.key));
  const showManagerColumn = !isColumnHidden('managerName');
  const showTimeOffPoliciesColumn = !isColumnHidden('timeOffPolicies');
  const visibleCustomFields = activeEmployeeCustomFields.filter((field) => !isColumnHidden(`cf:${field.id}`));

  const groupFieldForKanban = activeView?.groupByField ? findField(fields, activeView.groupByField) : undefined;

  return (
    <div>
      {deletingEmployee && (
        <ConfirmDialog
          title="Delete employee"
          message={`Are you sure you want to delete ${deletingEmployee.firstName} ${deletingEmployee.lastName}? This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteEmployee}
          onCancel={() => setDeletingEmployee(null)}
        />
      )}

      <SlideOver
        open={slideOverMode !== null}
        title={slideOverMode === 'edit' ? 'Edit Employee' : 'Add Employee'}
        onClose={closeSlideOver}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={closeSlideOver}>
              Cancel
            </button>
            <button type="submit" form="employee-form" className="btn-primary">
              {slideOverMode === 'edit' ? 'Save' : 'Create'}
            </button>
          </>
        }
      >
        {slideOverMode === 'add' && (
          <form id="employee-form" onSubmit={handleCreateEmployee}>
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
            {user.role === 'owner' && (
              <>
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
              </>
            )}

            {activeEmployeeCustomFields.map((field) => (
              <div className="form-group" key={field.id}>
                <label htmlFor={`emp-cf-${field.id}`}>
                  {field.name}
                  {field.required ? ' *' : ''}
                </label>
                {renderCustomFieldInput(field, customFieldValues, setCustomFieldValues, 'emp-cf')}
              </div>
            ))}
          </form>
        )}

        {slideOverMode === 'edit' && (
          <form id="employee-form" onSubmit={handleUpdateEmployee}>
            <div className="form-group">
              <label htmlFor="edit-emp-firstName">First Name</label>
              <input
                id="edit-emp-firstName"
                type="text"
                value={editEmployeeForm.firstName}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, firstName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-emp-lastName">Last Name</label>
              <input
                id="edit-emp-lastName"
                type="text"
                value={editEmployeeForm.lastName}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, lastName: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-emp-email">Business Email</label>
              <input
                id="edit-emp-email"
                type="email"
                value={editEmployeeForm.email}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-emp-personalEmail">Personal Email</label>
              <input
                id="edit-emp-personalEmail"
                type="email"
                value={editEmployeeForm.personalEmail}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, personalEmail: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-emp-departmentId">Department</label>
              <select
                id="edit-emp-departmentId"
                value={editEmployeeForm.departmentId}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, departmentId: e.target.value })}
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
              <label htmlFor="edit-emp-jobTitleId">Job Title</label>
              <select
                id="edit-emp-jobTitleId"
                value={editEmployeeForm.jobTitleId}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, jobTitleId: e.target.value })}
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
              <label htmlFor="edit-emp-statusId">Status</label>
              <select
                id="edit-emp-statusId"
                value={editEmployeeForm.statusId}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, statusId: e.target.value })}
              >
                {activeEmployeeStatuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="edit-emp-managerId">Reports To</label>
              <select
                id="edit-emp-managerId"
                value={editEmployeeForm.managerId}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, managerId: e.target.value })}
              >
                <option value="">-- No manager --</option>
                {employees
                  .filter((emp) => emp.id !== editingEmployeeId)
                  .map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName}
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="edit-emp-startDate">Start Date</label>
              <input
                id="edit-emp-startDate"
                type="date"
                value={editEmployeeForm.startDate}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, startDate: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-emp-endDate">End Date</label>
              <input
                id="edit-emp-endDate"
                type="date"
                value={editEmployeeForm.endDate}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, endDate: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-emp-contractUrl">Contract URL</label>
              <input
                id="edit-emp-contractUrl"
                type="url"
                value={editEmployeeForm.contractUrl}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, contractUrl: e.target.value })}
                placeholder="https://drive.google.com/..."
              />
            </div>
            {user.role === 'owner' && (
              <>
                <div className="form-group">
                  <label htmlFor="edit-emp-hourlyRate">Hourly Rate</label>
                  <input
                    id="edit-emp-hourlyRate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editEmployeeForm.hourlyRate}
                    onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, hourlyRate: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="edit-emp-monthlyRate">Monthly Rate</label>
                  <input
                    id="edit-emp-monthlyRate"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editEmployeeForm.monthlyRate}
                    onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, monthlyRate: e.target.value })}
                  />
                </div>
              </>
            )}

            {timeOffPolicies.length > 0 && (
              <div className="form-group">
                <span>Time Off Policies</span>
                {timeOffPolicies.map((policy) => (
                  <label
                    key={policy.id}
                    htmlFor={`edit-emp-time-off-${policy.id}`}
                    className="mr-3 inline-flex items-center gap-1.5 text-sm font-normal"
                  >
                    <input
                      id={`edit-emp-time-off-${policy.id}`}
                      type="checkbox"
                      checked={editAssignedPolicyIds.includes(policy.id)}
                      onChange={() => handleToggleTimeOffPolicy(policy.id)}
                    />
                    {policy.name}
                  </label>
                ))}
              </div>
            )}

            {activeEmployeeCustomFields.map((field) => (
              <div className="form-group" key={field.id}>
                <label htmlFor={`edit-emp-cf-${field.id}`}>
                  {field.name}
                  {field.required ? ' *' : ''}
                </label>
                {renderCustomFieldInput(field, editCustomFieldValues, setEditCustomFieldValues, 'edit-emp-cf')}
              </div>
            ))}
          </form>
        )}
      </SlideOver>

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
        {viewType === 'grid' && <FilterBar fields={fields} filters={viewFilters} onChange={setViewFilters} />}
        {viewType === 'grid' && (
          <ColumnVisibilityMenu columns={toggleableColumns} isHidden={isColumnHidden} onToggle={toggleColumn} />
        )}
        <button className="btn-primary btn-toolbar-size" onClick={handleOpenAdd}>
          <span className="inline-flex items-center gap-1.5">
            <PlusIcon className="h-4 w-4" />
            Add Employee
          </span>
        </button>
      </div>

      {loading ? (
        <p className="mt-4">Loading...</p>
      ) : employees.length === 0 ? (
        <div className="empty-state">
          <p>No employees yet.</p>
          <button className="btn btn-success" onClick={handleOpenAdd}>
            Add your first employee
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
            items={viewFilteredEmployees}
            getItemKey={(emp) => emp.id}
            getItemColumn={(emp) => groupFieldForKanban.getValue(emp)}
            onMove={canEditEmployees ? handleKanbanMove : () => {}}
            renderCard={(emp) => (
              <>
                <div className="kc-name">
                  {emp.firstName} {emp.lastName}
                </div>
                <div className="kc-meta">{emp.departmentDefn?.name}</div>
              </>
            )}
          />
        )
      ) : sortedEmployees.length === 0 ? (
        <p className="mt-4">No employees match your search or filters.</p>
      ) : (
        <>
          <div className="full-table-wrap">
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
                  {visibleColumns.map((col) => (
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
                  ))}
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
              <tbody>
                {pagedEmployees.map((emp) => (
                  <tr key={emp.id}>
                    {!isColumnHidden('name') && (
                      <td>
                        <div className="name-cell">
                          <Avatar firstName={emp.firstName} lastName={emp.lastName} />
                          {emp.firstName} {emp.lastName}
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
                      </td>
                    )}
                    {!isColumnHidden('email') && <td>{emp.email}</td>}
                    {!isColumnHidden('personalEmail') && <td>{emp.personalEmail || '—'}</td>}
                    {!isColumnHidden('department') && <td>{emp.departmentDefn?.name || '—'}</td>}
                    {!isColumnHidden('jobTitle') && <td>{emp.jobTitleDefn?.name || '—'}</td>}
                    {!isColumnHidden('status') && (
                      <td>
                        {emp.statusDefn && <StatusChip color={emp.statusDefn.color || '#6b7280'} label={emp.statusDefn.name} />}
                      </td>
                    )}
                    {!isColumnHidden('startDate') && (
                      <td>{emp.startDate ? new Date(emp.startDate).toLocaleDateString() : '—'}</td>
                    )}
                    {!isColumnHidden('endDate') && (
                      <td>{emp.endDate ? new Date(emp.endDate).toLocaleDateString() : '—'}</td>
                    )}
                    {!isColumnHidden('contractUrl') && (
                      <td>
                        {emp.contractUrl ? (
                          <a href={emp.contractUrl} target="_blank" rel="noopener noreferrer" className="table-link">
                            View
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    {user.role === 'owner' && !isColumnHidden('hourlyRate') && (
                      <td>{emp.hourlyRateCents != null ? `$${centsToDollars(emp.hourlyRateCents)}` : '—'}</td>
                    )}
                    {user.role === 'owner' && !isColumnHidden('monthlyRate') && (
                      <td>{emp.monthlyRateCents != null ? `$${centsToDollars(emp.monthlyRateCents)}` : '—'}</td>
                    )}
                    {showManagerColumn && (
                      <td>{emp.manager ? `${emp.manager.firstName} ${emp.manager.lastName}` : '—'}</td>
                    )}
                    {showTimeOffPoliciesColumn && (
                      <td>
                        {emp.timeOffPolicies && emp.timeOffPolicies.length > 0
                          ? emp.timeOffPolicies.map((a: any) => a.timeOffPolicy.name).join(', ')
                          : '—'}
                      </td>
                    )}
                    {visibleCustomFields.map((field) => {
                      const fieldValue = emp.customFieldVals?.find(
                        (v: any) => v.customFieldDefinitionId === field.id,
                      );
                      return <td key={field.id}>{fieldValue?.value || '—'}</td>;
                    })}
                    {canManageCustomFields && <td></td>}
                    <td>
                      <div className="icon-actions">
                        <button className="icon-btn" onClick={() => handleStartEditEmployee(emp)}>
                          <span className="tip">Edit</span>
                          <PencilIcon />
                        </button>
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
