import { useEffect, useState } from 'react';
import { api, type Role } from '../api';
import { useToast } from '../components/common/ToastProvider';
import TableSkeleton from '../components/common/TableSkeleton';
import { LockIcon } from '../components/common/Icons';

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

function labelFor(key: string): string {
  for (const group of GROUPS) {
    const row = group.rows.find((r) => r.key === key);
    if (row) return row.label;
  }
  return key;
}

// Owner-only page (gated here and, for real, server-side by every /api/roles* route) — changing
// what Admin/Member can do is an ownership-level decision, same bar as transferring ownership
// itself (see settingsSections.tsx for the nav entry, also owner-only).
export default function RolesPermissionsPage({ token, user }: RolesPermissionsPageProps) {
  const isOwner = user.role === 'owner';
  const toast = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

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

  // Seeded order is always Owner, Admin, Member (roleManagementService.ts's listRolesForTenant
  // sorts isOwner first, then by creation order) — safe to assume exactly these 2 editable
  // columns until Fase H lets a tenant add roles beyond the 3 seed ones, at which point this
  // needs a dynamic column list instead of the hardcoded "Admin"/"Member" headers below.
  const editableRoles = roles.filter((role) => !role.isOwner);

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

  return (
    <div>
      <div className="page-toolbar no-border">
        <h2>Roles &amp; Permissions</h2>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-ink-muted dark:text-dark-ink-muted">
        Control what Admin and Member can see and do. Owner always has full access and can&apos;t be limited — this keeps
        someone able to fix things, transfer ownership, or manage billing no matter how the other roles are set up.
      </p>

      {GROUPS.map((group) => (
        <section key={group.title} className="card mb-4 overflow-hidden p-0">
          <div className="grid grid-cols-[1fr_74px_74px_74px] items-center gap-3 border-b border-line bg-surface-0 px-5 py-3 dark:border-dark-line dark:bg-dark-raised">
            <span className="text-xs font-bold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">{group.title}</span>
            <span className="text-center text-xs font-bold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">Owner</span>
            <span className="text-center text-xs font-bold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">Admin</span>
            <span className="text-center text-xs font-bold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">Member</span>
          </div>
          {group.rows.map((row) => (
            <div
              key={row.key}
              data-permission-row={row.key}
              className="grid grid-cols-[1fr_74px_74px_74px] items-center gap-3 border-b border-line-soft px-5 py-3.5 last:border-b-0 dark:border-dark-line-soft"
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
    </div>
  );
}
