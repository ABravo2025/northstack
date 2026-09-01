import { useEffect, useState } from 'react';
import { api, type Role } from '../api';
import { useToast } from '../components/common/ToastProvider';
import TableSkeleton from '../components/common/TableSkeleton';
import Modal from '../components/common/Modal';
import RoleColumnMenu from '../components/settings/RoleColumnMenu';
import { LockIcon, PlusIcon } from '../components/common/Icons';

interface RolesPermissionsPageProps {
  token: string;
  user: { role: string };
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

// Only the permissions Fase A/B actually enforce today (docs/tareas/backlog.md "Sistema de roles
// custom") — deliberately excludes Employee scope (self/department/all) and the Employee
// custom-fields bundle, since Fase D/E haven't shipped enforcement for those yet. A toggle that
// silently did nothing would be worse than not showing it. Server-side, roleManagementService.ts's
// TOGGLEABLE_PERMISSION_KEYS is the matching allowlist — keep both in sync if either changes.
const GROUPS: PermissionGroup[] = [
  {
    title: 'People',
    rows: [
      { key: 'view_employee', label: 'View employees', description: "See the employee directory and each person's profile." },
      { key: 'manage_employee', label: 'Manage employees', description: 'Add, edit, and remove employee records.' },
    ],
  },
  {
    title: 'Sales',
    rows: [
      { key: 'view_company', label: 'View companies', description: 'See company accounts and their details.' },
      { key: 'manage_company', label: 'Manage companies', description: 'Add, edit, and remove companies.' },
      { key: 'view_contact', label: 'View contacts', description: 'See contacts and their details.' },
      { key: 'manage_contact', label: 'Manage contacts', description: 'Add, edit, and remove contacts.' },
      {
        key: 'manage_opportunity',
        label: 'Manage opportunities',
        description: 'Create and move deals through the pipeline.',
        hint: 'Needs View companies + View contacts',
      },
    ],
  },
  {
    title: 'Configuration',
    rows: [
      {
        key: 'manage_custom_fields',
        label: 'Manage custom fields & catalogs',
        description: 'Custom fields, statuses, pipelines, and shared catalogs.',
      },
    ],
  },
  {
    title: 'Team',
    rows: [
      { key: 'invite_users', label: 'Invite people', description: 'Send invitations to join the workspace.' },
      { key: 'manage_users', label: 'Manage members', description: 'Change roles and status for people already in the workspace.' },
    ],
  },
  {
    title: 'Money',
    rows: [
      { key: 'manage_payroll', label: 'Manage payroll', description: 'Compensation, payroll runs, and the CSV export of employee data.' },
      { key: 'manage_billing', label: 'Manage billing', description: 'Change plan, payment method, and cancel the subscription.' },
      { key: 'manage_payments', label: 'Manage payments', description: 'Connect Stripe and view customer payment history.' },
    ],
  },
  {
    title: 'Reporting',
    rows: [
      { key: 'view_sales_leaderboard', label: 'View sales leaderboard', description: 'Per-person deal performance across the team.' },
      { key: 'view_activity_log', label: 'View activity log', description: 'The workspace-wide feed of who changed what.' },
    ],
  },
  {
    title: 'Workspace',
    rows: [
      { key: 'manage_tenant_settings', label: 'Manage workspace settings', description: 'Currency and other workspace-wide preferences.' },
      { key: 'manage_shared_views', label: 'Manage shared views', description: 'Create views that everyone in the workspace sees.' },
    ],
  },
  {
    title: 'Time off',
    rows: [
      {
        key: 'decide_time_off',
        label: 'Decide time off requests',
        description: 'Approve or reject any request in the workspace.',
        hint: "A person's assigned manager can always decide their requests",
      },
    ],
  },
];

// Mirrors permissionService.ts's canManageOpportunity: granting requires both prerequisites
// already present on that same role. Server-side is the real enforcement (roleManagementService.ts
// rejects the request otherwise) — this is just so the UI can explain why upfront instead of
// round-tripping to find out.
const DEPENDENCIES: Record<string, string[]> = { manage_opportunity: ['view_company', 'view_contact'] };

const COLUMN_WIDTH = 88;

function labelFor(key: string): string {
  for (const group of GROUPS) {
    const row = group.rows.find((r) => r.key === key);
    if (row) return row.label;
  }
  return key;
}

// Owner-only page (gated here and, for real, server-side by every /api/roles* route) — changing
// what other roles can do, or creating/renaming/deleting a role outright, is an ownership-level
// decision, same bar as transferring ownership itself (see settingsSections.tsx for the nav entry,
// also owner-only).
export default function RolesPermissionsPage({ token, user }: RolesPermissionsPageProps) {
  const isOwner = user.role === 'owner';
  const toast = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [duplicateFrom, setDuplicateFrom] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isOwner) {
      setLoading(false);
      return;
    }
    api
      .listRoles(token)
      .then(setRoles)
      .catch((error) => toast.error('Failed to load roles: ' + (error as Error).message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isOwner]);

  if (!isOwner) {
    return (
      <div>
        <div className="page-toolbar no-border">
          <h2>Roles &amp; Permissions</h2>
        </div>
        <p className="text-sm text-ink-muted dark:text-dark-ink-muted">Only the workspace owner can view and change roles and permissions.</p>
      </div>
    );
  }

  if (loading) {
    return <TableSkeleton rows={8} columns={4} />;
  }

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
      toast.error(`Grant ${prerequisites.map(labelFor).join(' and ')} first`);
      return;
    }

    setSavingKey(role.id + permissionKey);
    try {
      const { permissions } = await api.setRolePermission(token, role.id, permissionKey, next);
      setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, permissions } : r)));
      toast.success(`${next ? 'Granted' : 'Revoked'} "${labelFor(permissionKey)}" for ${role.name}`);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingKey(null);
    }
  }

  async function handleCreateRole(e: React.FormEvent) {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    setCreating(true);
    try {
      const role = await api.createRole(token, newRoleName.trim(), duplicateFrom || undefined);
      setRoles((prev) => [...prev, role]);
      toast.success(`Created role "${role.name}"`);
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
      toast.success(`Renamed to "${name}"`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  async function handleDeleteRole(roleId: string) {
    const role = roles.find((r) => r.id === roleId);
    try {
      await api.deleteRole(token, roleId);
      setRoles((prev) => prev.filter((r) => r.id !== roleId));
      toast.success(`Deleted role "${role?.name ?? ''}"`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <div>
      <div className="page-toolbar">
        <h2>Roles &amp; Permissions</h2>
        <button type="button" className="btn-primary" onClick={() => setShowCreateModal(true)}>
          <PlusIcon className="h-4 w-4" />
          New role
        </button>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-ink-muted dark:text-dark-ink-muted">
        Control what each role can see and do. Owner always has full access and can&apos;t be limited — this keeps someone
        able to fix things, transfer ownership, or manage billing no matter how the other roles are set up. Create as many
        roles as your workspace needs — they&apos;re saved for good, not just a preview.
      </p>

      {GROUPS.map((group) => (
        <section key={group.title} className="card mb-4 overflow-hidden p-0">
          <div
            className="grid items-center gap-3 border-b border-line bg-surface-0 px-5 py-3 dark:border-dark-line dark:bg-dark-raised"
            style={{ gridTemplateColumns }}
          >
            <span className="text-xs font-bold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">{group.title}</span>
            <span className="text-center text-xs font-bold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">Owner</span>
            {editableRoles.map((role) => (
              <div key={role.id} className="flex items-center justify-center gap-0.5 overflow-hidden">
                <span
                  className="truncate text-center text-xs font-bold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint"
                  title={role.name}
                >
                  {role.name}
                </span>
                <RoleColumnMenu role={role} onRename={handleRenameRole} onDelete={handleDeleteRole} />
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
                  title="Owner always has this"
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
                    onChange={(e) => togglePermission(role, row.key, e.target.checked)}
                    aria-label={`${row.label} — ${role.name}`}
                  />
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}

      <p className="mt-2 max-w-2xl text-xs text-ink-faint dark:text-dark-ink-faint">
        Changes save immediately and take effect the next time someone with that role loads the app.
      </p>

      <Modal open={showCreateModal} title="New role" onClose={() => setShowCreateModal(false)}>
        <form onSubmit={handleCreateRole}>
          <div className="nv-field">
            <label htmlFor="new-role-name">Role name</label>
            <input
              id="new-role-name"
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="e.g. Sales Manager"
              autoFocus
              required
            />
          </div>
          <div className="nv-field">
            <label htmlFor="new-role-duplicate-from">Start from</label>
            <select id="new-role-duplicate-from" value={duplicateFrom} onChange={(e) => setDuplicateFrom(e.target.value)}>
              <option value="">Blank (nothing granted yet)</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  Same as {role.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary w-full text-center" disabled={creating || !newRoleName.trim()}>
            {creating ? 'Creating…' : 'Create role'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
