import {
  assignTag,
  findEntityTenantId,
  findTagAssignmentById,
  isSupportedTagEntityType,
  listTagDefinitions,
  listTagsForEntity,
  removeTagAssignment,
} from '../modules/crossModule/tagService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const tagsRouter = createAsyncRouter();

// Permissions: open to any authenticated tenant member, same criterion
// already used for Tasks/Notes on these same 4 entity types (backlog QA,
// 2026-08-27) — revisit once custom roles exist.

// All tag names ever used in this tenant, for the add-tag input's
// autocomplete — not entity-scoped.
tagsRouter.get('/api/tags', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  const definitions = await listTagDefinitions(user.tenantId!);
  return res.json(definitions);
});

tagsRouter.get('/api/tags/:entityType/:entityId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const { entityType, entityId } = req.params;
  if (!isSupportedTagEntityType(entityType)) {
    return res.status(400).json({ error: 'Unsupported entityType' });
  }

  const entityTenantId = await findEntityTenantId(entityType, entityId);
  if (!entityTenantId || entityTenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  const tags = await listTagsForEntity(user.tenantId!, entityType, entityId);
  return res.json(tags);
});

tagsRouter.post('/api/tags/:entityType/:entityId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const { entityType, entityId } = req.params;
  if (!isSupportedTagEntityType(entityType)) {
    return res.status(400).json({ error: 'Unsupported entityType' });
  }
  const name = (req.body.name as string | undefined)?.trim();
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const entityTenantId = await findEntityTenantId(entityType, entityId);
  if (!entityTenantId || entityTenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  const assignment = await assignTag(user.tenantId!, entityType, entityId, name);
  return res.status(201).json(assignment);
});

tagsRouter.delete('/api/tags/assignments/:tagAssignmentId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const assignment = await findTagAssignmentById(req.params.tagAssignmentId);
  if (!assignment || assignment.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Tag assignment not found' });
  }

  await removeTagAssignment(req.params.tagAssignmentId);
  return res.status(204).end();
});
