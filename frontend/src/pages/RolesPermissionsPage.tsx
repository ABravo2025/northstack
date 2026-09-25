import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { api, type RestrictableField, type Role } from '../api';
import { useToast } from '../components/common/ToastProvider';
import TableSkeleton from '../components/common/TableSkeleton';
import Modal from '../components/common/Modal';
import RoleColumnMenu from '../components/settings/RoleColumnMenu';
import HorizontalScrollbar from '../components/entity-views/HorizontalScrollbar';
import { ChevronRightIcon, LockIcon, PlusIcon } from '../components/common/Icons';
import { usePermissions } from '../contexts/PermissionsContext';

function getEntityLabels(t: TFunction): Record<string, string> {
  return {
    employee: t('roles.entityLabels.employee'),
    company: t('roles.entityLabels.company'),
    contact: t('roles.entityLabels.contact'),
    opportunity: t('roles.entityLabels.opportunity'),
  };
}

interface RolesPermissionsPageProps {
  token: string;
}

interface PermissionRow {
  key: string;
  label: string;
  description: string;
  hint?: string;
}

interface PermissionGroup {
  title: string;
  rows: PermissionRow[];
}

// The boolean-toggle permissions (docs/tareas/backlog.md "Sistema de roles custom") — deliberately
// excludes Employee scope (self/reports/department/all): a role holds at most one of those 4
// mutually-exclusive keys, so it doesn't fit a checkbox row and gets its own selector control
// below (the "Employee visibility scope" section) plus a dedicated endpoint (setEmployeeScope,
// PATCH /api/roles/:roleId/employee-scope) instead of living in this list. Server-side,
// roleManagementService.ts's TOGGLEABLE_PERMISSION_KEYS is the matching allowlist for everything
// that IS here — keep both in sync if either changes.
//
// A function (not a module-level const) so the labels/descriptions/hints re-resolve on every
// render against the active language — same reason settingsSections.tsx/dashboardsSections.tsx
// are functions, not static arrays (docs/general/spec-i18n.md).
function getGroups(t: TFunction): PermissionGroup[] {
  return [
    {
      title: t('roles.groups.people.title'),
      rows: [
        { key: 'view_employee', label: t('roles.groups.people.view_employee.label'), description: t('roles.groups.people.view_employee.description') },
        { key: 'manage_employee', label: t('roles.groups.people.manage_employee.label'), description: t('roles.groups.people.manage_employee.description') },
        {
          key: 'view_employee_custom_fields',
          label: t('roles.groups.people.view_employee_custom_fields.label'),
          description: t('roles.groups.people.view_employee_custom_fields.description'),
          hint: t('roles.groups.people.view_employee_custom_fields.hint'),
        },
        {
          key: 'edit_employee_custom_fields',
          label: t('roles.groups.people.edit_employee_custom_fields.label'),
          description: t('roles.groups.people.edit_employee_custom_fields.description'),
          hint: t('roles.groups.people.edit_employee_custom_fields.hint'),
        },
      ],
    },
    {
      title: t('roles.groups.sales.title'),
      rows: [
        { key: 'view_company', label: t('roles.groups.sales.view_company.label'), description: t('roles.groups.sales.view_company.description') },
        { key: 'manage_company', label: t('roles.groups.sales.manage_company.label'), description: t('roles.groups.sales.manage_company.description') },
        { key: 'view_contact', label: t('roles.groups.sales.view_contact.label'), description: t('roles.groups.sales.view_contact.description') },
        { key: 'manage_contact', label: t('roles.groups.sales.manage_contact.label'), description: t('roles.groups.sales.manage_contact.description') },
        {
          key: 'manage_opportunity',
          label: t('roles.groups.sales.manage_opportunity.label'),
          description: t('roles.groups.sales.manage_opportunity.description'),
          hint: t('roles.groups.sales.manage_opportunity.hint'),
        },
      ],
    },
    {
      title: t('roles.groups.configuration.title'),
      rows: [
        {
          key: 'manage_custom_fields',
          label: t('roles.groups.configuration.manage_custom_fields.label'),
          description: t('roles.groups.configuration.manage_custom_fields.description'),
        },
      ],
    },
    {
      title: t('roles.groups.team.title'),
      rows: [
        { key: 'invite_users', label: t('roles.groups.team.invite_users.label'), description: t('roles.groups.team.invite_users.description') },
        { key: 'manage_users', label: t('roles.groups.team.manage_users.label'), description: t('roles.groups.team.manage_users.description') },
      ],
    },
    {
      title: t('roles.groups.money.title'),
      rows: [
        { key: 'manage_payroll', label: t('roles.groups.money.manage_payroll.label'), description: t('roles.groups.money.manage_payroll.description') },
        { key: 'manage_billing', label: t('roles.groups.money.manage_billing.label'), description: t('roles.groups.money.manage_billing.description') },
        { key: 'manage_payments', label: t('roles.groups.money.manage_payments.label'), description: t('roles.groups.money.manage_payments.description') },
        { key: 'manage_api_access', label: t('roles.groups.money.manage_api_access.label'), description: t('roles.groups.money.manage_api_access.description') },
      ],
    },
    {
      title: t('roles.groups.reporting.title'),
      rows: [
        {
          key: 'view_sales_leaderboard',
          label: t('roles.groups.reporting.view_sales_leaderboard.label'),
          description: t('roles.groups.reporting.view_sales_leaderboard.description'),
        },
        {
          key: 'view_activity_log',
          label: t('roles.groups.reporting.view_activity_log.label'),
          description: t('roles.groups.reporting.view_activity_log.description'),
        },
        {
          key: 'view_dashboards',
          label: t('roles.groups.reporting.view_dashboards.label'),
          description: t('roles.groups.reporting.view_dashboards.description'),
        },
      ],
    },
    {
      title: t('roles.groups.workspace.title'),
      rows: [
        {
          key: 'manage_tenant_settings',
          label: t('roles.groups.workspace.manage_tenant_settings.label'),
          description: t('roles.groups.workspace.manage_tenant_settings.description'),
        },
        {
          key: 'manage_shared_views',
          label: t('roles.groups.workspace.manage_shared_views.label'),
          description: t('roles.groups.workspace.manage_shared_views.description'),
        },
      ],
    },
    {
      title: t('roles.groups.timeOff.title'),
      rows: [
        {
          key: 'decide_time_off',
          label: t('roles.groups.timeOff.decide_time_off.label'),
          description: t('roles.groups.timeOff.decide_time_off.description'),
          hint: t('roles.groups.timeOff.decide_time_off.hint'),
        },
      ],
    },
  ];
}

// Mirrors roleService.ts's EmployeeScope/EMPLOYEE_SCOPE_* — duplicated here the same way every
// other permission key string in this file already is (no shared BE/FE constants module exists
// today). Order matters for both the <select> (broadest last, matching how someone would naturally
// think "self, then wider, then wider") and deriveEmployeeScope's priority (broadest wins, mirrors
// roleService.ts's getEmployeeScope exactly).
type EmployeeScopeValue = 'none' | 'self' | 'reports' | 'department' | 'all';

function getEmployeeScopeOptions(t: TFunction): { value: EmployeeScopeValue; label: string; hint: string }[] {
  return [
    { value: 'none', label: t('roles.employeeScopeOptions.none.label'), hint: t('roles.employeeScopeOptions.none.hint') },
    { value: 'self', label: t('roles.employeeScopeOptions.self.label'), hint: t('roles.employeeScopeOptions.self.hint') },
    { value: 'reports', label: t('roles.employeeScopeOptions.reports.label'), hint: t('roles.employeeScopeOptions.reports.hint') },
    { value: 'department', label: t('roles.employeeScopeOptions.department.label'), hint: t('roles.employeeScopeOptions.department.hint') },
    { value: 'all', label: t('roles.employeeScopeOptions.all.label'), hint: t('roles.employeeScopeOptions.all.hint') },
  ];
}

function deriveEmployeeScope(permissions: string[]): EmployeeScopeValue {
  if (permissions.includes('view_employee_scope:all')) return 'all';
  if (permissions.includes('view_employee_scope:department')) return 'department';
  if (permissions.includes('view_employee_scope:reports')) return 'reports';
  if (permissions.includes('view_employee_scope:self')) return 'self';
  return 'none';
}

// Mirrors roleService.ts's PERMISSION_PREREQUISITES: granting requires the listed prerequisites
// already present on that same role. Server-side is the real enforcement (roleManagementService.ts
// rejects the request otherwise, and its revoke cascade walks this same chain transitively) — this
// is just so the UI can explain why upfront instead of round-tripping to find out.
const DEPENDENCIES: Record<string, string[]> = {
  manage_opportunity: ['view_company', 'view_contact'],
  view_employee_custom_fields: ['view_employee'],
  edit_employee_custom_fields: ['view_employee_custom_fields', 'manage_employee'],
};

const COLUMN_WIDTH = 88;

function labelFor(groups: PermissionGroup[], key: string): string {
  for (const group of groups) {
    const row = group.rows.find((r) => r.key === key);
    if (row) return row.label;
  }
  return key;
}

// .full-table-wrap only hides its native scrollbar assuming a <HorizontalScrollbar> replaces it
// (see App.css) — this matrix has as many columns as roles, so on narrow screens it needs one.
// Own component (rather than a ref created inline inside GROUPS.map) because a ref requires its
// own hook, and hooks can't be called from a .map() callback.
function PermissionGroupSection({
  group,
  ownerColumnLabel,
  ownerAlwaysHasThis,
  gridTemplateColumns,
  editableRoles,
  hasPermission,
  savingKey,
  permissionAriaLabel,
  onTogglePermission,
  onRenameRole,
  onDeleteRole,
}: {
  group: PermissionGroup;
  ownerColumnLabel: string;
  ownerAlwaysHasThis: string;
  gridTemplateColumns: string;
  editableRoles: Role[];
  hasPermission: (role: Role, key: string) => boolean;
  savingKey: string | null;
  permissionAriaLabel: (label: string, roleName: string) => string;
  onTogglePermission: (role: Role, permissionKey: string, next: boolean) => void;
  onRenameRole: (roleId: string, name: string) => Promise<void>;
  onDeleteRole: (roleId: string) => Promise<void>;
}) {
  const wrapRef = useRef<HTMLElement>(null);
  return (
    <>
      <section ref={wrapRef} className="card full-table-wrap mb-4 p-0">
        <div
          className="grid items-center gap-3 border-b border-line bg-surface-0 px-5 py-3 dark:border-dark-line dark:bg-dark-raised"
          style={{ gridTemplateColumns }}
        >
          <span className="text-xs font-bold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">{group.title}</span>
          <span className="text-center text-xs font-bold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">{ownerColumnLabel}</span>
          {editableRoles.map((role) => (
            <div key={role.id} className="flex items-center justify-center gap-0.5 overflow-hidden">
              <span
                className="truncate text-center text-xs font-bold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
                title={role.name}
              >
                {role.name}
              </span>
              <RoleColumnMenu role={role} onRename={onRenameRole} onDelete={onDeleteRole} />
            </div>
          ))}
        </div>
        {group.rows.map((row) => (
          <div
            key={row.key}
            data-permission-row={row.key}
            className="grid items-center gap-3 border-b border-line-soft px-5 py-3.5 last:border-b-0 dark:border-dark-line-soft"
            style={{ gridTemplateColumns }}
          >
            <div>
              <div className="text-sm font-medium text-ink dark:text-dark-ink">{row.label}</div>
              <div className="mt-0.5 text-xs text-ink-muted dark:text-dark-ink-muted">{row.description}</div>
              {row.hint && <div className="mt-1 text-xs font-medium text-ink-faint dark:text-dark-ink-faint">{row.hint}</div>}
            </div>
            <div className="flex justify-center">
              <span
                className="flex h-[19px] w-[34px] items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                title={ownerAlwaysHasThis}
              >
                <LockIcon className="h-[11px] w-[11px]" />
              </span>
            </div>
            {editableRoles.map((role) => (
              <div key={role.id} className="flex justify-center">
                <input
                  type="checkbox"
                  checked={hasPermission(role, row.key)}
                  disabled={savingKey === role.id + row.key}
                  onChange={(e) => onTogglePermission(role, row.key, e.target.checked)}
                  aria-label={permissionAriaLabel(row.label, role.name)}
                />
              </div>
            ))}
          </div>
        ))}
      </section>
      <HorizontalScrollbar targetRef={wrapRef} />
    </>
  );
}

// The scope counterpart to PermissionGroupSection above — same layout, but a <select> per role
// column instead of a checkbox, since HR scope is a mutually-exclusive 4-way choice, not a
// boolean. See EMPLOYEE_SCOPE_OPTIONS/deriveEmployeeScope above and roleManagementService.ts's
// setEmployeeScope for why this needed its own control and endpoint rather than joining GROUPS.
function EmployeeScopeSection({
  gridTemplateColumns,
  editableRoles,
  savingKey,
  onChangeScope,
  t,
}: {
  gridTemplateColumns: string;
  editableRoles: Role[];
  savingKey: string | null;
  onChangeScope: (role: Role, next: EmployeeScopeValue) => void;
  t: TFunction;
}) {
  const wrapRef = useRef<HTMLElement>(null);
  const employeeScopeOptions = getEmployeeScopeOptions(t);
  return (
    <>
      <section ref={wrapRef} className="card full-table-wrap mb-4 p-0">
        <div
          className="grid items-center gap-3 border-b border-line bg-surface-0 px-5 py-3 dark:border-dark-line dark:bg-dark-raised"
          style={{ gridTemplateColumns }}
        >
          <span className="text-xs font-bold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">{t('roles.employeeScopeTitle')}</span>
          <span className="text-center text-xs font-bold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">{t('roles.ownerColumn')}</span>
          {editableRoles.map((role) => (
            <span
              key={role.id}
              className="truncate text-center text-xs font-bold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
              title={role.name}
            >
              {role.name}
            </span>
          ))}
        </div>
        <div
          className="grid items-center gap-3 border-b border-line-soft px-5 py-3.5 last:border-b-0 dark:border-dark-line-soft"
          style={{ gridTemplateColumns }}
        >
          <div>
            <div className="text-sm font-medium text-ink dark:text-dark-ink">{t('roles.whichEmployeesTitle')}</div>
            <div className="mt-0.5 text-xs text-ink-muted dark:text-dark-ink-muted">{t('roles.whichEmployeesDesc')}</div>
          </div>
          <div className="flex justify-center">
            <span
              className="flex h-[19px] w-[34px] items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              title={t('roles.ownerAlwaysSeesEveryone')}
            >
              <LockIcon className="h-[11px] w-[11px]" />
            </span>
          </div>
          {editableRoles.map((role) => (
            <div key={role.id} className="flex justify-center">
              <select
                value={deriveEmployeeScope(role.permissions)}
                disabled={savingKey === role.id + 'employee-scope'}
                onChange={(e) => onChangeScope(role, e.target.value as EmployeeScopeValue)}
                aria-label={t('roles.employeeScopeAriaLabel', { roleName: role.name })}
                className="w-full rounded border border-line bg-surface-0 px-1 py-1 text-xs dark:border-dark-line dark:bg-dark-raised"
              >
                {employeeScopeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} title={opt.hint}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>
      <HorizontalScrollbar targetRef={wrapRef} />
    </>
  );
}

function FieldVisibilitySection({
  entityType,
  entityLabel,
  fields,
  gridTemplateColumns,
  editableRoles,
  savingFieldKey,
  isFieldHidden,
  onToggleFieldVisibility,
  ownerColumnLabel,
  ownerAlwaysSeesThis,
  fieldVisibleAriaLabel,
}: {
  entityType: string;
  entityLabel: string;
  fields: RestrictableField[];
  gridTemplateColumns: string;
  editableRoles: Role[];
  savingFieldKey: string | null;
  isFieldHidden: (role: Role, entityType: string, fieldKey: string) => boolean;
  onToggleFieldVisibility: (role: Role, entityType: string, fieldKey: string, nextVisible: boolean) => void;
  ownerColumnLabel: string;
  ownerAlwaysSeesThis: string;
  fieldVisibleAriaLabel: (fieldLabel: string, roleName: string) => string;
}) {
  const wrapRef = useRef<HTMLDetailsElement>(null);
  return (
    <>
      <details ref={wrapRef} className="card full-table-wrap mb-4 p-0">
        <summary className="flex cursor-pointer list-none items-center gap-2 bg-surface-0 px-5 py-3 text-sm font-semibold text-ink select-none dark:bg-dark-raised dark:text-dark-ink">
          <ChevronRightIcon className="h-3.5 w-3.5 text-ink-faint dark:text-dark-ink-faint" />
          {entityLabel}
          <span className="text-xs font-normal text-ink-faint dark:text-dark-ink-faint">({fields.length})</span>
        </summary>
        <div
          className="grid items-center gap-3 border-b border-t border-line bg-surface-0 px-5 py-2 dark:border-dark-line dark:bg-dark-raised"
          style={{ gridTemplateColumns }}
        >
          <span />
          <span className="text-center text-xs font-bold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">{ownerColumnLabel}</span>
          {editableRoles.map((role) => (
            <span
              key={role.id}
              className="truncate text-center text-xs font-bold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
              title={role.name}
            >
              {role.name}
            </span>
          ))}
        </div>
        {fields.map((field) => (
          <div
            key={field.key}
            data-field-row={`${entityType}:${field.key}`}
            className="grid items-center gap-3 border-b border-line-soft px-5 py-3 last:border-b-0 dark:border-dark-line-soft"
            style={{ gridTemplateColumns }}
          >
            <div className="text-sm text-ink dark:text-dark-ink">{field.label}</div>
            <div className="flex justify-center">
              <span
                className="flex h-[19px] w-[34px] items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                title={ownerAlwaysSeesThis}
              >
                <LockIcon className="h-[11px] w-[11px]" />
              </span>
            </div>
            {editableRoles.map((role) => (
              <div key={role.id} className="flex justify-center">
                <input
                  type="checkbox"
                  checked={!isFieldHidden(role, entityType, field.key)}
                  disabled={savingFieldKey === `${role.id}:${entityType}:${field.key}`}
                  onChange={(e) => onToggleFieldVisibility(role, entityType, field.key, e.target.checked)}
                  aria-label={fieldVisibleAriaLabel(field.label, role.name)}
                />
              </div>
            ))}
          </div>
        ))}
      </details>
      <HorizontalScrollbar targetRef={wrapRef} />
    </>
  );
}

// Owner-only page (gated here and, for real, server-side by every /api/roles* route) — changing
// what other roles can do, or creating/renaming/deleting a role outright, is an ownership-level
// decision, same bar as transferring ownership itself (see settingsSections.tsx for the nav entry,
// also owner-only).
export default function RolesPermissionsPage({ token }: RolesPermissionsPageProps) {
  const { t } = useTranslation('settingsPages');
  // Custom Roles Fase J — migrated off `user.role === 'owner'` to PermissionsContext's isOwner
  // (same underlying fact, read from the resolved RoleContext instead of the legacy enum).
  const isOwner = usePermissions().isOwner;
  const toast = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [fieldCatalog, setFieldCatalog] = useState<Record<string, RestrictableField[]>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savingFieldKey, setSavingFieldKey] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [duplicateFrom, setDuplicateFrom] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isOwner) {
      setLoading(false);
      return;
    }
    Promise.all([api.listRoles(token), api.getFieldCatalog(token)])
      .then(([rolesResult, catalogResult]) => {
        setRoles(rolesResult);
        setFieldCatalog(catalogResult);
      })
      .catch((error) => toast.error(t('roles.loadFailed', { message: (error as Error).message })))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isOwner]);

  if (!isOwner) {
    return (
      <div>
        <div className="page-toolbar no-border">
          <h2>{t('roles.title')}</h2>
        </div>
        <p className="text-sm text-ink-muted dark:text-dark-ink-muted">{t('roles.ownerOnly')}</p>
      </div>
    );
  }

  if (loading) {
    return <TableSkeleton rows={8} columns={4} />;
  }

  const groups = getGroups(t);
  const entityLabels = getEntityLabels(t);

  // Owner is always first (listRolesForTenant sorts isOwner first) — everything after it is a
  // real column in the matrix, however many a tenant has created.
  const editableRoles = roles.filter((role) => !role.isOwner);
  const gridTemplateColumns = `1fr repeat(${1 + editableRoles.length}, ${COLUMN_WIDTH}px)`;

  function hasPermission(role: Role, key: string): boolean {
    return role.permissions.includes(key);
  }

  async function togglePermission(role: Role, permissionKey: string, next: boolean) {
    const prerequisites = DEPENDENCIES[permissionKey];
    if (next && prerequisites && !prerequisites.every((p) => hasPermission(role, p))) {
      toast.error(t('roles.grantFirst', { items: prerequisites.map((p) => labelFor(groups, p)).join(t('roles.and')) }));
      return;
    }

    setSavingKey(role.id + permissionKey);
    try {
      const { permissions } = await api.setRolePermission(token, role.id, permissionKey, next);
      setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, permissions } : r)));
      toast.success(
        t(next ? 'roles.granted' : 'roles.revoked', { permission: labelFor(groups, permissionKey), roleName: role.name }),
      );
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingKey(null);
    }
  }

  async function changeEmployeeScope(role: Role, next: EmployeeScopeValue) {
    const savingId = role.id + 'employee-scope';
    setSavingKey(savingId);
    try {
      const { permissions } = await api.setEmployeeScope(token, role.id, next);
      setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, permissions } : r)));
      const hint = getEmployeeScopeOptions(t).find((o) => o.value === next)?.hint ?? next;
      toast.success(t('roles.scopeUpdated', { roleName: role.name, hint }));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingKey(null);
    }
  }

  function isFieldHidden(role: Role, entityType: string, fieldKey: string): boolean {
    return role.hiddenFields[entityType]?.includes(fieldKey) ?? false;
  }

  async function toggleFieldVisibility(role: Role, entityType: string, fieldKey: string, nextVisible: boolean) {
    const savingId = `${role.id}:${entityType}:${fieldKey}`;
    setSavingFieldKey(savingId);
    try {
      await api.setRoleFieldRestriction(token, role.id, entityType, fieldKey, !nextVisible);
      setRoles((prev) =>
        prev.map((r) => {
          if (r.id !== role.id) return r;
          const current = new Set(r.hiddenFields[entityType] ?? []);
          if (nextVisible) current.delete(fieldKey);
          else current.add(fieldKey);
          return { ...r, hiddenFields: { ...r.hiddenFields, [entityType]: Array.from(current) } };
        }),
      );
      const fieldLabel = fieldCatalog[entityType]?.find((f) => f.key === fieldKey)?.label ?? fieldKey;
      toast.success(t(nextVisible ? 'roles.showing' : 'roles.hiding', { fieldLabel, roleName: role.name }));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingFieldKey(null);
    }
  }

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setCreating(true);
    try {
      const role = await api.createRole(token, newRoleName.trim(), duplicateFrom || undefined);
      setRoles((prev) => [...prev, role]);
      toast.success(t('roles.createdRole', { roleName: role.name }));
      setShowCreateModal(false);
      setNewRoleName('');
      setDuplicateFrom('');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleRenameRole(roleId: string, name: string) {
    try {
      await api.renameRole(token, roleId, name);
      setRoles((prev) => prev.map((r) => (r.id === roleId ? { ...r, name } : r)));
      toast.success(t('roles.renamedTo', { name }));
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function handleDeleteRole(roleId: string) {
    const role = roles.find((r) => r.id === roleId);
    try {
      await api.deleteRole(token, roleId);
      setRoles((prev) => prev.filter((r) => r.id !== roleId));
      toast.success(t('roles.deletedRole', { roleName: role?.name ?? '' }));
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div>
      <div className="page-toolbar">
        <h2>{t('roles.title')}</h2>
        <button type="button" className="btn-primary" onClick={() => setShowCreateModal(true)}>
          <PlusIcon className="h-4 w-4" />
          {t('roles.newRole')}
        </button>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-ink-muted dark:text-dark-ink-muted">{t('roles.intro')}</p>

      {groups.map((group) => (
        <PermissionGroupSection
          key={group.title}
          group={group}
          ownerColumnLabel={t('roles.ownerColumn')}
          ownerAlwaysHasThis={t('roles.ownerAlwaysHasThis')}
          gridTemplateColumns={gridTemplateColumns}
          editableRoles={editableRoles}
          hasPermission={hasPermission}
          savingKey={savingKey}
          permissionAriaLabel={(label, roleName) => t('roles.permissionAriaLabel', { permissionLabel: label, roleName })}
          onTogglePermission={togglePermission}
          onRenameRole={handleRenameRole}
          onDeleteRole={handleDeleteRole}
        />
      ))}

      <EmployeeScopeSection
        gridTemplateColumns={gridTemplateColumns}
        editableRoles={editableRoles}
        savingKey={savingKey}
        onChangeScope={changeEmployeeScope}
        t={t}
      />

      <h3 className="mb-2 text-base font-bold text-ink dark:text-dark-ink">{t('roles.fieldVisibilityTitle')}</h3>
      <p className="mb-4 max-w-2xl text-sm text-ink-muted dark:text-dark-ink-muted">{t('roles.fieldVisibilityIntro')}</p>

      {Object.entries(fieldCatalog).map(([entityType, fields]) => (
        <FieldVisibilitySection
          key={entityType}
          entityType={entityType}
          entityLabel={entityLabels[entityType] ?? entityType}
          fields={fields}
          gridTemplateColumns={gridTemplateColumns}
          editableRoles={editableRoles}
          savingFieldKey={savingFieldKey}
          isFieldHidden={isFieldHidden}
          onToggleFieldVisibility={toggleFieldVisibility}
          ownerColumnLabel={t('roles.ownerColumn')}
          ownerAlwaysSeesThis={t('roles.ownerAlwaysSeesThis')}
          fieldVisibleAriaLabel={(fieldLabel, roleName) => t('roles.fieldVisibleAriaLabel', { fieldLabel, roleName })}
        />
      ))}

      <p className="mt-2 max-w-2xl text-xs text-ink-faint dark:text-dark-ink-faint">{t('roles.savesImmediately')}</p>

      <Modal open={showCreateModal} title={t('roles.newRoleModalTitle')} onClose={() => setShowCreateModal(false)}>
        <form onSubmit={handleCreateRole}>
          <div className="nv-field">
            <label htmlFor="new-role-name">{t('roles.roleNameLabel')}</label>
            <input
              id="new-role-name"
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder={t('roles.roleNamePlaceholder')}
              autoFocus
              required
            />
          </div>
          <div className="nv-field">
            <label htmlFor="new-role-duplicate-from">{t('roles.startFromLabel')}</label>
            <select id="new-role-duplicate-from" value={duplicateFrom} onChange={(e) => setDuplicateFrom(e.target.value)}>
              <option value="">{t('roles.blankOption')}</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {t('roles.sameAs', { roleName: role.name })}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary w-full text-center" disabled={creating || !newRoleName.trim()}>
            {creating ? t('roles.creating') : t('roles.createRole')}
          </button>
        </form>
      </Modal>
    </div>
  );
}
