import type { ActivityEntityType } from '@prisma/client';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { createRole, deleteRole, listRolesForTenant, renameRole, setRoleFieldRestriction, setRolePermission } from '../modules/auth/roleManagementService.js';
import { RESTRICTABLE_FIELDS_BY_ENTITY_TYPE } from '../modules/auth/fieldVisibilityService.js';

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

// Lets a tenant create a genuinely new role (not just reconfigure Admin/Member) — persists for
// good, same as any other Role row.
rolesRouter.post('/api/roles', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!user.roleContext.isOwner) {
    return res.status(403).json({ error: 'Only the owner can create roles' });
  }

  const { name, duplicateFromRoleId } = req.body ?? {};
  if (typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }

  const result = await createRole(user.tenantId!, name, typeof duplicateFromRoleId === 'string' ? duplicateFromRoleId : undefined);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json(result.role);
});

// Custom Roles Fase C — the field catalog the UI renders as toggles, straight from
// fieldVisibilityService.ts (itself reusing the Activity Log field-config labels) so the frontend
// never hand-maintains a second copy of "what fields does Employee have."
rolesRouter.get('/api/roles/field-catalog', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!user.roleContext.isOwner) {
    return res.status(403).json({ error: 'Only the owner can view roles and permissions' });
  }

  return res.json(RESTRICTABLE_FIELDS_BY_ENTITY_TYPE);
});

rolesRouter.patch('/api/roles/:roleId/field-restrictions', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!user.roleContext.isOwner) {
    return res.status(403).json({ error: 'Only the owner can change roles and permissions' });
  }

  const { entityType, fieldKey, hidden } = req.body ?? {};
  if (typeof entityType !== 'string' || typeof fieldKey !== 'string' || typeof hidden !== 'boolean') {
    return res.status(400).json({ error: 'entityType (string), fieldKey (string), and hidden (boolean) are required' });
  }

  const result = await setRoleFieldRestriction(user.tenantId!, req.params.roleId, entityType as ActivityEntityType, fieldKey, hidden);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({ success: true });
});

rolesRouter.patch('/api/roles/:roleId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!user.roleContext.isOwner) {
    return res.status(403).json({ error: 'Only the owner can rename roles' });
  }

  const { name } = req.body ?? {};
  if (typeof name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }

  const result = await renameRole(user.tenantId!, req.params.roleId, name);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({ success: true });
});

rolesRouter.delete('/api/roles/:roleId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!user.roleContext.isOwner) {
    return res.status(403).json({ error: 'Only the owner can delete roles' });
  }

  const result = await deleteRole(user.tenantId!, req.params.roleId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({ success: true });
});
