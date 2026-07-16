import { useEffect, useMemo, useState } from 'react';
import { api, type SavedView, type ViewFilter, type ViewSort } from '../api';
import { useToast } from '../components/ToastProvider';
import ConfirmDialog from '../components/ConfirmDialog';
import Pagination, { paginate } from '../components/Pagination';
import SlideOver from '../components/SlideOver';
import ViewsBar from '../components/ViewsBar';
import FilterBar from '../components/FilterBar';
import KanbanBoard from '../components/KanbanBoard';
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
  const [ptoPolicies, setPtoPolicies] = useState<any[]>([]);
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

  const fields = useMemo(
    () => buildEmployeeFields(employeeStatuses, employeeCustomFields),
    [employeeStatuses, employeeCustomFields],
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
      emp.department.toLowerCase().includes(query)
    );
  });

  const viewFilteredEmployees = applyFilters(searchFilteredEmployees, fields, viewFilters);
  const sortedEmployees = applySort(viewFilteredEmployees, fields, viewSort);

  const pageCount = Math.max(1, Math.ceil(sortedEmployees.length / PAGE_SIZE));
  const pagedEmployees = paginate(sortedEmployees, page, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [employeeSearch, activeViewId]);

  const [employeeForm, setEmployeeForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    department: '',
    managerId: '',
  });

  const [editEmployeeForm, setEditEmployeeForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    department: '',
    statusId: '',
    managerId: '',
  });

  useEffect(() => {
    loadEmployees();
    loadEmployeeCustomFields();
    loadEmployeeStatuses();
    loadPtoPolicies();
    loadViews();
  }, []);

  const loadViews = async () => {
    try {
      const data = await api.listViews(token, 'employee');
      setViews(data);
    } catch (error) {
      toast.error('Failed to load views: ' + (error as Error).message);
    }
  };

  const loadPtoPolicies = async () => {
    try {
      const policies = await api.listPtoPolicies(token);
      setPtoPolicies(policies.filter((p) => p.isActive));
    } catch (error) {
      toast.error('Failed to load PTO policies: ' + (error as Error).message);
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

  const loadEmployeeStatuses = async () => {
    try {
      const statuses = await api.listStatusDefinitions(token, 'employee');
      setEmployeeStatuses(statuses.filter((s) => s.isActive));
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
    setEmployeeForm({ firstName: '', lastName: '', email: '', department: '', managerId: '' });
    setCustomFieldValues({});
    setSlideOverMode('add');
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const employee = await api.createEmployee(token, {
        ...employeeForm,
        managerId: employeeForm.managerId || null,
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
      department: emp.department,
      statusId: emp.statusId,
      managerId: emp.managerId || '',
    });

    const values: Record<string, string> = {};
    const valueIds: Record<string, string> = {};
    for (const fieldValue of emp.customFieldVals || []) {
      values[fieldValue.customFieldDefinitionId] = fieldValue.value;
      valueIds[fieldValue.customFieldDefinitionId] = fieldValue.id;
    }
    setEditCustomFieldValues(values);
    setEditCustomFieldValueIds(valueIds);

    const assignedIds = (emp.ptoPolicies || []).map((a: any) => a.ptoPolicyId);
    setEditAssignedPolicyIds(assignedIds);
    setOriginalAssignedPolicyIds(assignedIds);
    setSlideOverMode('edit');
  };

  const handleTogglePtoPolicy = (policyId: string) => {
    setEditAssignedPolicyIds((current) =>
      current.includes(policyId) ? current.filter((id) => id !== policyId) : [...current, policyId],
    );
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployeeId) return;
    try {
      await api.updateEmployee(token, editingEmployeeId, {
        ...editEmployeeForm,
        managerId: editEmployeeForm.managerId || null,
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
        await api.assignPtoPolicyToEmployee(token, editingEmployeeId, policyId);
      }
      for (const policyId of policiesToUnassign) {
        await api.unassignPtoPolicyFromEmployee(token, editingEmployeeId, policyId);
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
    { key: 'email', label: 'Email' },
    { key: 'department', label: 'Department' },
    { key: 'status', label: 'Status' },
  ];

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
              <label htmlFor="emp-email">Email</label>
              <input
                id="emp-email"
                type="email"
                value={employeeForm.email}
                onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="emp-department">Department</label>
              <input
                id="emp-department"
                type="text"
                value={employeeForm.department}
                onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })}
                required
              />
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
              <label htmlFor="edit-emp-email">Email</label>
              <input
                id="edit-emp-email"
                type="email"
                value={editEmployeeForm.email}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-emp-department">Department</label>
              <input
                id="edit-emp-department"
                type="text"
                value={editEmployeeForm.department}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, department: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-emp-statusId">Status</label>
              <select
                id="edit-emp-statusId"
                value={editEmployeeForm.statusId}
                onChange={(e) => setEditEmployeeForm({ ...editEmployeeForm, statusId: e.target.value })}
              >
                {employeeStatuses.map((status) => (
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

            {ptoPolicies.length > 0 && (
              <div className="form-group">
                <span>PTO Policies</span>
                {ptoPolicies.map((policy) => (
                  <label
                    key={policy.id}
                    htmlFor={`edit-emp-pto-${policy.id}`}
                    className="mr-3 inline-flex items-center gap-1.5 text-sm font-normal"
                  >
                    <input
                      id={`edit-emp-pto-${policy.id}`}
                      type="checkbox"
                      checked={editAssignedPolicyIds.includes(policy.id)}
                      onChange={() => handleTogglePtoPolicy(policy.id)}
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
        <button className="btn-primary" onClick={handleOpenAdd}>
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
                <div className="kc-meta">{emp.department}</div>
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
                    </th>
                  ))}
                  <th>Reports To</th>
                  <th>PTO Policies</th>
                  {activeEmployeeCustomFields.map((field) => (
                    <th
                      key={field.id}
                      className={`sortable ${viewSort?.field === `cf:${field.id}` ? 'sorted' : ''}`}
                      onClick={() => handleSort(`cf:${field.id}`)}
                    >
                      {field.name}
                      <span className="sort-arrow">
                        {viewSort?.field === `cf:${field.id}` && viewSort.direction === 'desc' ? '▴' : '▾'}
                      </span>
                    </th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagedEmployees.map((emp) => (
                  <tr key={emp.id}>
                    <td>
                      {emp.firstName} {emp.lastName}
                      {emp.activePtoTag && (
                        <span
                          className="pto-active-tag"
                          style={{ background: emp.activePtoTag.color || '#9ca3af' }}
                          title={`On ${emp.activePtoTag.policyName} today`}
                        >
                          {emp.activePtoTag.policyName}
                        </span>
                      )}
                    </td>
                    <td>{emp.email}</td>
                    <td>{emp.department}</td>
                    <td>{emp.statusDefn?.name}</td>
                    <td>{emp.manager ? `${emp.manager.firstName} ${emp.manager.lastName}` : '—'}</td>
                    <td>
                      {emp.ptoPolicies && emp.ptoPolicies.length > 0
                        ? emp.ptoPolicies.map((a: any) => a.ptoPolicy.name).join(', ')
                        : '—'}
                    </td>
                    {activeEmployeeCustomFields.map((field) => {
                      const fieldValue = emp.customFieldVals?.find(
                        (v: any) => v.customFieldDefinitionId === field.id,
                      );
                      return <td key={field.id}>{fieldValue?.value || '—'}</td>;
                    })}
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
