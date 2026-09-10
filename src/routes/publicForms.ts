import type { EntityType } from '@prisma/client';
import { canManageCustomFields } from '../modules/auth/permissionService.js';
import { createPublicForm, getTenantSlug, listPublicForms, updatePublicForm } from '../modules/hr/publicFormService.js';
import { findPipelineById } from '../modules/crm/pipelineService.js';
import { findCustomFieldDefinitionById } from '../modules/hr/customFieldService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const publicFormsRouter = createAsyncRouter();

// A form's `fields` config can reference a CustomFieldDefinition via a `cf:<id>` key — unlike
// pipelineId (validated below), nothing previously checked that id actually belongs to the tenant
// creating/editing the form. Without this, a tenant could point a public, unauthenticated form at
// another tenant's CustomFieldDefinition row and leak its name/type/options through
// GET /api/public/:tenantSlug/:formSlug (security audit, 2026-09-10).
async function findInvalidCustomFieldKey(
  fields: { key: string }[],
  tenantId: string,
): Promise<string | null> {
  const customFieldIds = fields.filter((f) => f.key?.startsWith('cf:')).map((f) => f.key.slice(3));
  for (const id of customFieldIds) {
    const definition = await findCustomFieldDefinitionById(id);
    if (!definition || definition.tenantId !== tenantId) {
      return id;
    }
  }
  return null;
}

publicFormsRouter.get('/api/public-forms', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
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

  if (!canManageCustomFields(user.roleContext)) {
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

  const invalidFieldId = await findInvalidCustomFieldKey(req.body.fields ?? [], user.tenantId!);
  if (invalidFieldId) {
    return res.status(400).json({ error: `Custom field not found: ${invalidFieldId}` });
  }

  const result = await createPublicForm(
    {
      tenantId: user.tenantId!,
      entityType,
      name,
      slug,
      fields: req.body.fields ?? [],
      thankYouMessage: req.body.thankYouMessage,
      accessMode: req.body.accessMode,
      pipelineId,
    },
    user.id,
  );

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

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (req.body.pipelineId) {
    const pipeline = await findPipelineById(req.body.pipelineId);
    if (!pipeline || pipeline.tenantId !== user.tenantId!) {
      return res.status(400).json({ error: 'Pipeline not found' });
    }
  }

  if (req.body.fields) {
    const invalidFieldId = await findInvalidCustomFieldKey(req.body.fields, user.tenantId!);
    if (invalidFieldId) {
      return res.status(400).json({ error: `Custom field not found: ${invalidFieldId}` });
    }
  }

  const result = await updatePublicForm(
    req.params.formId,
    user.tenantId!,
    {
      name: req.body.name,
      fields: req.body.fields,
      isActive: req.body.isActive,
      thankYouMessage: req.body.thankYouMessage,
      pipelineId: req.body.pipelineId !== undefined ? req.body.pipelineId : undefined,
    },
    user.id,
  );

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json(result.form);
});
