import type { EntityType } from '@prisma/client';
import { canManageCustomFields } from '../modules/auth/permissionService.js';
import { createPublicForm, getTenantSlug, listPublicForms, updatePublicForm } from '../modules/hr/publicFormService.js';
import { findPipelineById } from '../modules/crm/pipelineService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const publicFormsRouter = createAsyncRouter();

publicFormsRouter.get('/api/public-forms', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const [forms, tenantSlug] = await Promise.all([
    listPublicForms(user.tenantId!),
    getTenantSlug(user.tenantId!),
  ]);
  return res.json({ tenantSlug, forms });
});

publicFormsRouter.post('/api/public-forms', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const name = (req.body.name as string)?.trim();
  const slug = (req.body.slug as string)?.trim();
  const entityType = req.body.entityType as EntityType;
  if (!name || !slug) {
    return res.status(400).json({ error: 'Name and slug are required' });
  }
  if (entityType !== 'employee' && entityType !== 'client' && entityType !== 'contact') {
    return res.status(400).json({ error: "entityType must be 'employee', 'client', or 'contact'" });
  }

  let pipelineId: string | null = null;
  if (entityType === 'contact' && req.body.pipelineId) {
    const pipeline = await findPipelineById(req.body.pipelineId);
    if (!pipeline || pipeline.tenantId !== user.tenantId!) {
      return res.status(400).json({ error: 'Pipeline not found' });
    }
    pipelineId = pipeline.id;
  }

  const result = await createPublicForm({
    tenantId: user.tenantId!,
    entityType,
    name,
    slug,
    fields: req.body.fields ?? [],
    thankYouMessage: req.body.thankYouMessage,
    accessMode: req.body.accessMode,
    pipelineId,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json(result.form);
});

publicFormsRouter.patch('/api/public-forms/:formId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (req.body.pipelineId) {
    const pipeline = await findPipelineById(req.body.pipelineId);
    if (!pipeline || pipeline.tenantId !== user.tenantId!) {
      return res.status(400).json({ error: 'Pipeline not found' });
    }
  }

  const result = await updatePublicForm(req.params.formId, user.tenantId!, {
    name: req.body.name,
    fields: req.body.fields,
    isActive: req.body.isActive,
    thankYouMessage: req.body.thankYouMessage,
    pipelineId: req.body.pipelineId !== undefined ? req.body.pipelineId : undefined,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json(result.form);
});
