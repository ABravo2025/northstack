import { ActivityAction, ActivityEntityType } from '@prisma/client';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { canViewActivityLog } from '../modules/auth/permissionService.js';
import { findEntityTenantId, isSupportedCrossModuleEntityType } from '../modules/crossModule/entityLookup.js';
import { listActivityFeed, listActivityForEntity, type ActivityLogEntryWithUser } from '../modules/activity/activityLogService.js';

export const activityRouter = createAsyncRouter();

const ACTIVITY_ENTITY_TYPES = new Set<string>(Object.values(ActivityEntityType));
const ACTIVITY_ACTIONS = new Set<string>(Object.values(ActivityAction));

// `changes` is stored as a JSON string column (see the schema comment on ActivityLogEntry) —
// parsed here so the frontend receives a real array, never a string it has to JSON.parse itself.
function serializeEntry(entry: ActivityLogEntryWithUser) {
  return { ...entry, changes: entry.changes ? JSON.parse(entry.changes) : null };
}

// Per-record "Activity" tab (Employee/Company/Contact/Opportunity detail modals). No permission
// gate beyond tenant membership — same convention as Tasks/Notes: if you can open the modal, you
// see its Activity (spec-activity-log.md decision #5). Only the 4 Tier-1 entity types have a
// detail modal, so this reuses the same cross-module entity type list/lookup Task/Note already
// validate against, rather than the full ActivityEntityType enum.
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

  const entries = await listActivityForEntity(user.tenantId!, entityType as ActivityEntityType, entityId);
  return res.json(entries.map(serializeEntry));
});

// Tenant-wide feed, Settings → Activity Log. owner/admin only today (canViewActivityLog), until a
// custom role can be granted this permission (spec-activity-log.md decision #4).
activityRouter.get('/api/activity/feed', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canViewActivityLog(user.role)) {
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
  return res.json({ items: page.items.map(serializeEntry), nextCursor: page.nextCursor });
});
