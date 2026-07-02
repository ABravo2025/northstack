import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import type { EntityType, UserRole } from '@prisma/client';
import { authenticateToken, loginUser, logoutUser, registerUser } from './modules/auth/authService.js';
import { canCreateHr, canManageCustomFields, canViewHr } from './modules/auth/permissionService.js';
import { createEmployee, listEmployees } from './modules/hr/employeeService.js';
import {
  createCustomFieldDefinition,
  createCustomFieldValue,
  listCustomFieldDefinitions,
  listCustomFieldValuesForEmployee,
} from './modules/hr/customFieldService.js';
import { createTenantWithOwner } from './modules/tenant/tenantService.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(express.json());

function getBearerToken(req: express.Request): string | null {
  return req.headers.authorization?.replace('Bearer ', '') ?? null;
}

async function validateSession(req: express.Request, res: express.Response) {
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
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json({ user: result.user });
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
  const result = await createTenantWithOwner(req.body);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json({ tenant: result.tenant, user: result.user, session: result.session });
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

  const employee = await createEmployee({ ...req.body, tenantId: user.tenantId });
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

  const values = await listCustomFieldValuesForEmployee(req.params.employeeId);
  return res.json(values);
});

app.listen(port, () => {
  console.log(`Northstack server listening on port ${port}`);
});
