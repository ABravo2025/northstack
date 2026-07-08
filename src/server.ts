import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import type { EntityType } from '@prisma/client';
import { authenticateToken, loginUser, logoutUser, registerUser } from './modules/auth/authService.js';
import { canCreateHr, canInviteUsers, canManageCustomFields, canViewHr } from './modules/auth/permissionService.js';
import { createEmployee, findEmployeeById, listEmployees } from './modules/hr/employeeService.js';
import {
  createCustomFieldDefinition,
  createCustomFieldValue,
  findCustomFieldDefinitionById,
  listCustomFieldDefinitions,
  listCustomFieldValuesForEmployee,
  listCustomFieldValuesForClient,
} from './modules/hr/customFieldService.js';
import {
  createTenantForUser,
  registerTenantWithOwner,
  createInvitation,
  acceptInvitation,
} from './modules/tenant/tenantService.js';
import {
  createClient,
  listClients,
  findClientById,
  updateClient,
  deleteClient,
} from './modules/clients/clientService.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());

function getBearerToken(req: express.Request): string | null {
  return req.headers.authorization?.replace('Bearer ', '') ?? null;
}

async function authenticateUser(req: express.Request, res: express.Response) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  const user = await authenticateToken(token);
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }

  return user;
}

async function validateSession(req: express.Request, res: express.Response) {
  const user = await authenticateUser(req, res);
  if (!user) {
    return null;
  }

  if (!user.tenantId) {
    res.status(403).json({ error: 'Tenant access required' });
    return null;
  }

  return user;
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/register', async (req, res) => {
  const result = await registerUser(req.body);

  if (!result.success) {
    return res.status(400).json({ error: result.error, field: result.field });
  }

  return res.status(201).json({ user: result.user, session: result.session });
});

app.post('/api/tenants/register', async (req, res) => {
  const result = await registerTenantWithOwner({
    tenantName: req.body.tenantName,
    ownerFirstName: req.body.ownerFirstName,
    ownerLastName: req.body.ownerLastName,
    ownerEmail: req.body.ownerEmail,
    ownerPassword: req.body.ownerPassword,
    ownerPhone: req.body.ownerPhone,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error, field: result.field });
  }

  return res.status(201).json({ tenant: result.tenant, user: result.user, session: result.session });
});

app.post('/api/auth/login', async (req, res) => {
  const result = await loginUser(req.body);

  if (!result.success) {
    return res.status(401).json({ error: result.error });
  }

  return res.json({ user: result.user, session: result.session });
});

app.post('/api/auth/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const success = await logoutUser(token);
  if (!success) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  return res.status(204).end();
});

app.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await authenticateToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  return res.json({ user });
});

app.post('/api/tenants', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) {
    return;
  }

  const name = req.body.name as string;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tenant name is required' });
  }

  const result = await createTenantForUser({
    userId: user.id,
    name: name.trim(),
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json({ tenant: result.tenant, user: result.user });
});

app.post('/api/tenants/invitations', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canInviteUsers(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const email = req.body.email as string;
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const result = await createInvitation({
    tenantId: user.tenantId!,
    invitedByUserId: user.id,
    email: email.trim(),
    role: req.body.role,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json({ invitation: result.invitation });
});

app.post('/api/invitations/:token/accept', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) {
    return;
  }

  const result = await acceptInvitation({
    token: req.params.token,
    userId: user.id,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(200).json({ tenant: result.tenant, user: result.user });
});

app.get('/api/hr/employees', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employees = await listEmployees(user.tenantId);
  return res.json(employees);
});

app.post('/api/hr/employees', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await createEmployee({ ...req.body, tenantId: user.tenantId! });
  return res.status(201).json(employee);
});

app.post('/api/hr/custom-fields', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const customField = await createCustomFieldDefinition({
    tenantId: user.tenantId!,
    name: req.body.name,
    entityType: req.body.entityType,
    fieldType: req.body.fieldType,
    options: req.body.options,
  });

  return res.status(201).json(customField);
});

app.get('/api/hr/custom-fields', async (req, res) => {
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

app.post('/api/hr/employees/:employeeId/custom-fields', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const definition = await findCustomFieldDefinitionById(req.body.customFieldDefinitionId);
  if (!definition || definition.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Custom field definition not found' });
  }

  const customFieldValue = await createCustomFieldValue({
    customFieldDefinitionId: req.body.customFieldDefinitionId,
    employeeId: req.params.employeeId,
    value: req.body.value,
  });

  return res.status(201).json(customFieldValue);
});

app.get('/api/hr/employees/:employeeId/custom-fields', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const values = await listCustomFieldValuesForEmployee(req.params.employeeId);
  return res.json(values);
});

// Clients endpoints
app.get('/api/clients', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const clients = await listClients(user.tenantId!);
  return res.json(clients);
});

app.post('/api/clients', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const client = await createClient({ ...req.body, tenantId: user.tenantId! });
  return res.status(201).json(client);
});

app.get('/api/clients/:clientId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const client = await findClientById(req.params.clientId);
  if (!client || client.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Client not found' });
  }

  return res.json(client);
});

app.patch('/api/clients/:clientId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const client = await findClientById(req.params.clientId);
  if (!client || client.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const updated = await updateClient(req.params.clientId, req.body);
  return res.json(updated);
});

app.delete('/api/clients/:clientId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const client = await findClientById(req.params.clientId);
  if (!client || client.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Client not found' });
  }

  await deleteClient(req.params.clientId);
  return res.status(204).end();
});

app.post('/api/clients/:clientId/custom-fields', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const client = await findClientById(req.params.clientId);
  if (!client || client.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const definition = await findCustomFieldDefinitionById(req.body.customFieldDefinitionId);
  if (!definition || definition.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Custom field definition not found' });
  }

  const customFieldValue = await createCustomFieldValue({
    customFieldDefinitionId: req.body.customFieldDefinitionId,
    clientId: req.params.clientId,
    value: req.body.value,
  });

  return res.status(201).json(customFieldValue);
});

app.get('/api/clients/:clientId/custom-fields', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const client = await findClientById(req.params.clientId);
  if (!client || client.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const values = await listCustomFieldValuesForClient(req.params.clientId);
  return res.json(values);
});

app.listen(port, () => {
  console.log(`Northstack server listening on port ${port}`);
});
