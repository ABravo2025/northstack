import type { EntityType } from '@prisma/client';
import { createSavedView, deleteSavedView, listSavedViews, updateSavedView } from '../modules/hr/savedViewService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const viewsRouter = createAsyncRouter();

viewsRouter.get('/api/views', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const entityType = (req.query.entityType as EntityType) ?? 'employee';
  const views = await listSavedViews(user.tenantId!, entityType, user.id);
  return res.json(views);
});

viewsRouter.post('/api/views', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const name = req.body.name as string;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const result = await createSavedView({
    tenantId: user.tenantId!,
    createdByUserId: user.id,
    createdByRole: user.roleContext,
    entityType: req.body.entityType,
    name,
    type: req.body.type ?? 'grid',
    visibility: req.body.visibility ?? 'personal',
    filters: req.body.filters,
    sortBy: req.body.sortBy,
    groupByField: req.body.groupByField,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json(result.view);
});

viewsRouter.patch('/api/views/:viewId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const result = await updateSavedView(req.params.viewId, user.tenantId!, user.id, user.roleContext, {
    name: req.body.name,
    filters: req.body.filters,
    sortBy: req.body.sortBy,
    groupByField: req.body.groupByField,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json(result.view);
});

viewsRouter.delete('/api/views/:viewId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const result = await deleteSavedView(req.params.viewId, user.tenantId!, user.id, user.roleContext);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(204).send();
});
