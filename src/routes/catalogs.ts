import type { EntityType } from '@prisma/client';
import { authenticateToken } from '../modules/auth/authService.js';
import { canManageCustomFields } from '../modules/auth/permissionService.js';
import {
  createCustomFieldDefinition,
  findCustomFieldDefinitionById,
  listCustomFieldDefinitions,
  updateCustomFieldDefinition,
} from '../modules/hr/customFieldService.js';
import {
  createFieldCatalogDefinition,
  listFieldCatalogDefinitions,
  updateFieldCatalogDefinition,
} from '../modules/hr/fieldCatalogService.js';
import { createStatusDefinition, listStatusDefinitions, updateStatusDefinition } from '../modules/hr/statusService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const VALID_CATALOG_KINDS = ['department', 'jobTitle', 'leadSource', 'lossReason', 'winReason', 'companySize'];

export const catalogsRouter = createAsyncRouter();

catalogsRouter.post('/api/hr/custom-fields', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const customField = await createCustomFieldDefinition(
    {
      tenantId: user.tenantId!,
      name: req.body.name,
      entityType: req.body.entityType,
      fieldType: req.body.fieldType,
      options: req.body.options,
      required: Boolean(req.body.required),
    },
    user.id,
  );

  return res.status(201).json(customField);
});

catalogsRouter.patch('/api/hr/custom-fields/:definitionId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const definition = await findCustomFieldDefinitionById(req.params.definitionId);
  if (!definition || definition.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Custom field definition not found' });
  }

  const updated = await updateCustomFieldDefinition(
    req.params.definitionId,
    {
      name: req.body.name,
      required: req.body.required,
      options: req.body.options,
      isActive: req.body.isActive,
    },
    user.id,
  );
  return res.json(updated);
});

catalogsRouter.get('/api/hr/custom-fields', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await authenticateToken(token);

  if (!user || !user.tenantId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const entityType = (req.query.entityType as EntityType) ?? 'employee';
  const customFields = await listCustomFieldDefinitions(user.tenantId!, entityType);
  return res.json(customFields);
});

catalogsRouter.get('/api/status-definitions', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const entityType = (req.query.entityType as EntityType) ?? 'employee';
  const statuses = await listStatusDefinitions(user.tenantId!, entityType);
  return res.json(statuses);
});

catalogsRouter.post('/api/status-definitions', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const name = req.body.name as string;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const status = await createStatusDefinition(
    {
      tenantId: user.tenantId!,
      entityType: req.body.entityType,
      name: name.trim(),
      color: req.body.color,
      order: req.body.order,
      isDefault: Boolean(req.body.isDefault),
    },
    user.id,
  );

  return res.status(201).json(status);
});

catalogsRouter.patch('/api/status-definitions/:definitionId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await updateStatusDefinition(
    req.params.definitionId,
    user.tenantId!,
    {
      name: req.body.name,
      color: req.body.color,
      order: req.body.order,
      isDefault: req.body.isDefault,
      isActive: req.body.isActive,
    },
    user.id,
  );

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json(result.statusDefinition);
});

catalogsRouter.get('/api/field-catalog', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const kind = req.query.kind as string;
  if (!VALID_CATALOG_KINDS.includes(kind)) {
    return res.status(400).json({ error: `kind must be one of: ${VALID_CATALOG_KINDS.join(', ')}` });
  }

  const definitions = await listFieldCatalogDefinitions(user.tenantId!, kind as any);
  return res.json(definitions);
});

catalogsRouter.post('/api/field-catalog', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const name = req.body.name as string;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  if (!VALID_CATALOG_KINDS.includes(req.body.kind)) {
    return res.status(400).json({ error: `kind must be one of: ${VALID_CATALOG_KINDS.join(', ')}` });
  }

  const definition = await createFieldCatalogDefinition(
    {
      tenantId: user.tenantId!,
      kind: req.body.kind,
      name: name.trim(),
      order: req.body.order,
    },
    user.id,
  );

  return res.status(201).json(definition);
});

catalogsRouter.patch('/api/field-catalog/:definitionId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await updateFieldCatalogDefinition(
    req.params.definitionId,
    user.tenantId!,
    {
      name: req.body.name,
      order: req.body.order,
      isActive: req.body.isActive,
    },
    user.id,
  );

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json(result.definition);
});
