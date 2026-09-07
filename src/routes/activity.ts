import { ActivityAction, ActivityEntityType } from '@prisma/client';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { canViewActivityLog } from '../modules/auth/permissionService.js';
import { findEntityTenantId, isSupportedCrossModuleEntityType } from '../modules/crossModule/entityLookup.js';
import { listActivityFeed, listActivityForEntity } from '../modules/activity/activityLogService.js';
import { canAccessEntityActivity, canViewEntryModule, filterActivityEntryForRole } from '../modules/activity/activityVisibilityService.js';

export const activityRouter = createAsyncRouter();

const ACTIVITY_ENTITY_TYPES = new Set<string>(Object.values(ActivityEntityType));
const ACTIVITY_ACTIONS = new Set<string>(Object.values(ActivityAction));

// Per-record "Activity" tab (Employee/Company/Contact/Opportunity detail modals). Only the 4
// Tier-1 entity types have a detail modal, so this reuses the same cross-module entity type
// list/lookup Task/Note already validate against, rather than the full ActivityEntityType enum.
// Custom Roles Fase F added canAccessEntityActivity (module + Employee scope check, see
// activityVisibilityService.ts) — this route used to only check tenant membership.
activityRouter.get('/api/activity', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const entityType = req.query.entityType as string | undefined;
  const entityId = req.query.entityId as string | undefined;
  if (!entityType || !entityId) {
    return res.status(400).json({ error: 'entityType and entityId are required' });
  }
  if (!isSupportedCrossModuleEntityType(entityType)) {
    return res.status(400).json({ error: 'Unsupported entityType' });
  }

  const entityTenantId = await findEntityTenantId(entityType, entityId);
  if (!entityTenantId || entityTenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  const access = await canAccessEntityActivity(user, entityType as ActivityEntityType, entityId);
  if (!access.allowed) {
    return res.status(access.status).json({ error: access.status === 404 ? 'Entity not found' : 'Insufficient permissions' });
  }

  const entries = await listActivityForEntity(user.tenantId!, entityType as ActivityEntityType, entityId);
  return res.json(entries.map((entry) => filterActivityEntryForRole(entry, user.roleContext)));
});

// Tenant-wide feed, Settings → Activity Log. owner/admin only today (canViewActivityLog), until a
// custom role can be granted this permission (spec-activity-log.md decision #4). Custom Roles
// Fase F added the per-entry module gate (canViewEntryModule) — see activityVisibilityService.ts's
// doc comment for why a page can come back shorter than requested once some entries are gated out.
activityRouter.get('/api/activity/feed', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canViewActivityLog(user.roleContext)) {
    return res.status(403).json({ error: 'You do not have permission to view the Activity Log' });
  }

  const entityTypeRaw = req.query.entityType as string | undefined;
  if (entityTypeRaw && !ACTIVITY_ENTITY_TYPES.has(entityTypeRaw)) {
    return res.status(400).json({ error: 'Unsupported entityType' });
  }

  const actionRaw = req.query.action as string | undefined;
  if (actionRaw && !ACTIVITY_ACTIONS.has(actionRaw)) {
    return res.status(400).json({ error: 'Unsupported action' });
  }

  const fromRaw = req.query.from as string | undefined;
  const toRaw = req.query.to as string | undefined;
  const from = fromRaw ? new Date(fromRaw) : undefined;
  const to = toRaw ? new Date(toRaw) : undefined;
  if ((fromRaw && Number.isNaN(from?.getTime())) || (toRaw && Number.isNaN(to?.getTime()))) {
    return res.status(400).json({ error: 'Invalid from/to date' });
  }

  const page = await listActivityFeed({
    tenantId: user.tenantId!,
    entityType: entityTypeRaw as ActivityEntityType | undefined,
    userId: (req.query.userId as string | undefined) || undefined,
    action: actionRaw as ActivityAction | undefined,
    from,
    to,
    cursor: (req.query.cursor as string | undefined) || undefined,
  });

  const visibleItems = page.items.filter((item) => canViewEntryModule(user.roleContext, item.entityType));
  return res.json({ items: visibleItems.map((entry) => filterActivityEntryForRole(entry, user.roleContext)), nextCursor: page.nextCursor });
});
