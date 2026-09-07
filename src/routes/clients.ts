import { canCreateHr, canManageCustomFields, canViewHr } from '../modules/auth/permissionService.js';
import {
  createClient,
  deleteClient,
  findClientById,
  listClients,
  updateClient,
} from '../modules/clients/clientService.js';
import { exportClientsToCsv, getClientsCsvTemplate, importClientsFromCsv } from '../modules/csv/csvService.js';
import {
  createCustomFieldValue,
  deleteCustomFieldValue,
  findCustomFieldDefinitionById,
  findCustomFieldValueById,
  isValueValidForFieldType,
  listCustomFieldValuesForEntity,
  updateCustomFieldValue,
} from '../modules/hr/customFieldService.js';
import { findStatusDefinitionById } from '../modules/hr/statusService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const clientsRouter = createAsyncRouter();

clientsRouter.get('/api/clients', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewHr(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const clients = await listClients(user.tenantId!);
  return res.json(clients);
});

clientsRouter.get('/api/clients/export/csv', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewHr(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const csv = await exportClientsToCsv(user.tenantId!);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="clients.csv"');
  return res.send(csv);
});

clientsRouter.post('/api/clients/import/csv', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (typeof req.body.csv !== 'string' || !req.body.csv.trim()) {
    return res.status(400).json({ error: 'csv is required' });
  }

  const result = await importClientsFromCsv(user.tenantId!, req.body.csv);
  return res.json(result);
});

clientsRouter.get('/api/clients/template/csv', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const csv = await getClientsCsvTemplate(user.tenantId!);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="clients-import-template.csv"');
  return res.send(csv);
});

clientsRouter.post('/api/clients', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const client = await createClient({ ...req.body, tenantId: user.tenantId! });
  return res.status(201).json(client);
});

clientsRouter.get('/api/clients/:clientId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewHr(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const client = await findClientById(req.params.clientId);
  if (!client || client.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Client not found' });
  }

  return res.json(client);
});

clientsRouter.patch('/api/clients/:clientId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const client = await findClientById(req.params.clientId);
  if (!client || client.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Client not found' });
  }

  if (req.body.statusId !== undefined) {
    const status = await findStatusDefinitionById(req.body.statusId);
    if (!status || status.tenantId !== user.tenantId) {
      return res.status(400).json({ error: 'Status not found' });
    }
  }

  const updated = await updateClient(req.params.clientId, req.body, user.id);
  return res.json(updated);
});

clientsRouter.delete('/api/clients/:clientId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const client = await findClientById(req.params.clientId);
  if (!client || client.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Client not found' });
  }

  await deleteClient(req.params.clientId);
  return res.status(204).end();
});

clientsRouter.post('/api/clients/:clientId/custom-fields', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const client = await findClientById(req.params.clientId);
  if (!client || client.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const definition = await findCustomFieldDefinitionById(req.body.customFieldDefinitionId);
  if (!definition || definition.tenantId !== user.tenantId || definition.entityType !== 'client') {
    return res.status(404).json({ error: 'Custom field definition not found' });
  }

  if (!isValueValidForFieldType(definition.fieldType, req.body.value, definition.options)) {
    return res.status(400).json({ error: `Invalid value for field type '${definition.fieldType}'` });
  }

  const customFieldValue = await createCustomFieldValue({
    tenantId: user.tenantId!,
    customFieldDefinitionId: req.body.customFieldDefinitionId,
    entityType: 'client',
    entityId: req.params.clientId,
    value: req.body.value,
  });

  return res.status(201).json(customFieldValue);
});

clientsRouter.patch('/api/clients/:clientId/custom-fields/:valueId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const client = await findClientById(req.params.clientId);
  if (!client || client.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const existingValue = await findCustomFieldValueById(req.params.valueId);
  if (
    !existingValue ||
    existingValue.tenantId !== user.tenantId ||
    existingValue.entityType !== 'client' ||
    existingValue.entityId !== req.params.clientId
  ) {
    return res.status(404).json({ error: 'Custom field value not found' });
  }

  const definition = await findCustomFieldDefinitionById(existingValue.customFieldDefinitionId);
  if (!definition || !isValueValidForFieldType(definition.fieldType, req.body.value, definition.options)) {
    return res.status(400).json({ error: `Invalid value for field type '${definition?.fieldType}'` });
  }

  const updated = await updateCustomFieldValue(req.params.valueId, req.body.value);
  return res.json(updated);
});

clientsRouter.delete('/api/clients/:clientId/custom-fields/:valueId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const client = await findClientById(req.params.clientId);
  if (!client || client.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const existingValue = await findCustomFieldValueById(req.params.valueId);
  if (
    !existingValue ||
    existingValue.tenantId !== user.tenantId ||
    existingValue.entityType !== 'client' ||
    existingValue.entityId !== req.params.clientId
  ) {
    return res.status(404).json({ error: 'Custom field value not found' });
  }

  await deleteCustomFieldValue(req.params.valueId);
  return res.status(204).end();
});

clientsRouter.get('/api/clients/:clientId/custom-fields', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const client = await findClientById(req.params.clientId);
  if (!client || client.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const values = await listCustomFieldValuesForEntity(user.tenantId!, 'client', req.params.clientId);
  return res.json(values);
});
