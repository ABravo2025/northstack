import prismaExternal from '../../lib/prismaExternal.js';
import { findSeedRoleId } from '../auth/roleService.js';

// An AI assistant may invite an employee to Northstack, but never into a sensitive role
// (Alejandro, 2026-10-20): Admin, or any role that touches salaries or payments. A prompt-injected
// assistant could otherwise change someone's e-mail and invite it with a powerful role. Decided by
// the role's PERMISSIONS, not its name, so renaming a role doesn't get around it — plus the name
// "Admin" itself, in case that role was trimmed but people still read it as admin. The default role
// of an invitation without roleId (the seed Member) is checked too: a tenant may have widened it.

export const AI_SENSITIVE_ROLE_PERMISSIONS = [
  // Admin-level: people, roles, workspace settings, credentials
  'manage_users',
  'manage_tenant_settings',
  'manage_api_access',
  // Salaries and payments
  'manage_payroll',
  'manage_payments',
  'manage_billing',
] as const;

// null when the assistant may invite into this role; otherwise why not (shown to the user).
export async function aiInviteBlockReason(tenantId: string, roleId: string | undefined): Promise<string | null> {
  const resolvedRoleId = roleId ?? (await findSeedRoleId(tenantId, 'member'));
  if (!resolvedRoleId) return null; // the invitation itself will fail on a missing role
  const role = await prismaExternal.role.findUnique({
    where: { id: resolvedRoleId },
    select: { tenantId: true, name: true, isOwner: true, modulePermissions: { select: { permission: true } } },
  });
  if (!role || role.tenantId !== tenantId) return null; // createInvitation answers "Role not found"
  const sensitive = role.modulePermissions.map((p) => p.permission).filter((p) => (AI_SENSITIVE_ROLE_PERMISSIONS as readonly string[]).includes(p));
  if (role.isOwner || role.name.trim().toLowerCase() === 'admin' || sensitive.length > 0) {
    return `An AI assistant can't invite someone with the role "${role.name}": admin roles and roles with access to salaries or payments are granted only from the app.`;
  }
  return null;
}
