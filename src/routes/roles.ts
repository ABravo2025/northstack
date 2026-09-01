import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { listRolesForTenant, setRolePermission } from '../modules/auth/roleManagementService.js';

export const rolesRouter = createAsyncRouter();

// Settings → Roles & Permissions — owner-only (a direct isOwner check, not a named permission:
// reconfiguring what Admin/Member can do is an ownership-level decision, same bar as transferring
// ownership itself; a role should never be able to expand its own authority through a permission
// that lets it edit permissions).
rolesRouter.get('/api/roles', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!user.roleContext.isOwner) {
    return res.status(403).json({ error: 'Only the owner can view roles and permissions' });
  }

  const roles = await listRolesForTenant(user.tenantId!);
  return res.json(roles);
});

rolesRouter.patch('/api/roles/:roleId/permissions', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!user.roleContext.isOwner) {
    return res.status(403).json({ error: 'Only the owner can change roles and permissions' });
  }

  const { permission, granted } = req.body ?? {};
  if (typeof permission !== 'string' || typeof granted !== 'boolean') {
    return res.status(400).json({ error: 'permission (string) and granted (boolean) are required' });
  }

  const result = await setRolePermission(user.tenantId!, req.params.roleId, permission, granted);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({ permissions: result.permissions });
});
