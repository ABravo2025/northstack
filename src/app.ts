import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import type { EntityType } from '@prisma/client';
import {
  authenticateToken,
  changeOwnPassword,
  loginUser,
  logoutUser,
  registerUser,
  sanitizeUser,
  updateOwnProfile,
} from './modules/auth/authService.js';
import {
  canCreateHr,
  canInviteUsers,
  canManageCustomFields,
  canManageUsers,
  canViewHr,
} from './modules/auth/permissionService.js';
import {
  createEmployee,
  deleteEmployee,
  findEmployeeById,
  listEmployees,
  updateEmployee,
  wouldCreateManagerCycle,
} from './modules/hr/employeeService.js';
import {
  createCustomFieldDefinition,
  createCustomFieldValue,
  deleteCustomFieldValue,
  findCustomFieldDefinitionById,
  findCustomFieldValueById,
  isValueValidForFieldType,
  listCustomFieldDefinitions,
  listCustomFieldValuesForEntity,
  setCustomFieldDefinitionActive,
  updateCustomFieldValue,
} from './modules/hr/customFieldService.js';
import {
  createTenantForUser,
  registerTenantWithOwner,
  createInvitation,
  acceptInvitation,
  listTenantUsers,
  listTenantInvitations,
  updateTenantUser,
  cancelInvitation,
  findInvitationByToken,
} from './modules/tenant/tenantService.js';
import {
  createClient,
  listClients,
  findClientById,
  updateClient,
  deleteClient,
} from './modules/clients/clientService.js';
import {
  createStatusDefinition,
  listStatusDefinitions,
  updateStatusDefinition,
} from './modules/hr/statusService.js';
import {
  createPtoPolicy,
  listPtoPolicies,
  updatePtoPolicy,
} from './modules/hr/ptoPolicyService.js';
import {
  assignPtoPolicyToEmployee,
  listEmployeePtoPolicies,
  unassignPtoPolicyFromEmployee,
} from './modules/hr/employeePtoPolicyService.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Express 4 doesn't catch rejected promises from async route handlers on its
// own — an unhandled rejection there crashes the whole process instead of
// producing a clean error response. Wrapping every route-registration method
// once here means no individual route needs its own try/catch.
//
// `app.get` is also (confusingly) how Express reads internal settings, e.g.
// `app.get('etag')` — a single-argument call with no handler. Only wrap
// calls that look like an actual `(path, singleHandler)` route registration
// and pass everything else straight through untouched.
const routeMethods = ['get', 'post', 'patch', 'delete', 'put'] as const;
for (const method of routeMethods) {
  const original = app[method].bind(app);
  app[method] = ((...args: unknown[]) => {
    const [path, handler] = args;
    if (args.length !== 2 || typeof path !== 'string' || typeof handler !== 'function') {
      return (original as (...args: unknown[]) => unknown)(...args);
    }
    return original(path, ((req, res, next) => {
      Promise.resolve((handler as express.RequestHandler)(req, res, next)).catch(next);
    }) as express.RequestHandler);
  }) as typeof app[typeof method];
}

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

  return res.status(201).json({ user: sanitizeUser(result.user!), session: result.session });
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

  return res
    .status(201)
    .json({ tenant: result.tenant, user: sanitizeUser(result.user!), session: result.session });
});

app.post('/api/auth/login', async (req, res) => {
  const result = await loginUser(req.body);

  if (!result.success) {
    return res.status(401).json({ error: result.error });
  }

  return res.json({ user: sanitizeUser(result.user!), session: result.session });
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

  return res.json({ user: sanitizeUser(user) });
});

app.patch('/api/users/me', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) {
    return;
  }

  const result = await updateOwnProfile(user.id, req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error, field: result.field });
  }

  return res.json({ user: sanitizeUser(result.user!) });
});

app.patch('/api/users/me/password', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) {
    return;
  }

  const result = await changeOwnPassword(user.id, req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error, field: result.field });
  }

  return res.status(204).end();
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

  return res.status(201).json({ tenant: result.tenant, user: sanitizeUser(result.user!) });
});

app.get('/api/tenants/users', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageUsers(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const users = await listTenantUsers(user.tenantId!);
  return res.json(users);
});

app.patch('/api/tenants/users/:userId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageUsers(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await updateTenantUser(user.tenantId!, req.params.userId, user, {
    role: req.body.role,
    status: req.body.status,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({ user: sanitizeUser(result.user!) });
});

app.get('/api/tenants/invitations', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageUsers(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const invitations = await listTenantInvitations(user.tenantId!);
  return res.json(invitations);
});

app.delete('/api/tenants/invitations/:invitationId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageUsers(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await cancelInvitation(user.tenantId!, req.params.invitationId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(204).end();
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

app.get('/api/invitations/:token', async (req, res) => {
  const invitation = await findInvitationByToken(req.params.token);
  if (!invitation) {
    return res.status(404).json({ error: 'Invitation not found' });
  }

  return res.json(invitation);
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

  return res.status(200).json({ tenant: result.tenant, user: sanitizeUser(result.user!) });
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

  if (req.body.managerId) {
    const manager = await findEmployeeById(req.body.managerId);
    if (!manager || manager.tenantId !== user.tenantId) {
      return res.status(400).json({ error: 'Manager not found' });
    }
  }

  const employee = await createEmployee({ ...req.body, tenantId: user.tenantId! });
  return res.status(201).json(employee);
});

app.get('/api/hr/employees/:employeeId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  return res.json(employee);
});

app.patch('/api/hr/employees/:employeeId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  if (req.body.managerId) {
    const manager = await findEmployeeById(req.body.managerId);
    if (!manager || manager.tenantId !== user.tenantId) {
      return res.status(400).json({ error: 'Manager not found' });
    }

    const wouldCycle = await wouldCreateManagerCycle(req.params.employeeId, req.body.managerId);
    if (wouldCycle) {
      return res.status(400).json({ error: 'This would create a reporting cycle' });
    }
  }

  const updated = await updateEmployee(req.params.employeeId, req.body, user.id);
  return res.json(updated);
});

app.delete('/api/hr/employees/:employeeId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  await deleteEmployee(req.params.employeeId);
  return res.status(204).end();
});

app.post('/api/hr/employees/:employeeId/invite', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canInviteUsers(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  if (employee.userId) {
    return res.status(400).json({ error: 'Employee is already linked to a user' });
  }

  const result = await createInvitation({
    tenantId: user.tenantId!,
    invitedByUserId: user.id,
    email: employee.email,
    role: 'member',
    employeeId: employee.id,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json({ invitation: result.invitation });
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
    required: Boolean(req.body.required),
  });

  return res.status(201).json(customField);
});

app.patch('/api/hr/custom-fields/:definitionId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const definition = await findCustomFieldDefinitionById(req.params.definitionId);
  if (!definition || definition.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Custom field definition not found' });
  }

  const updated = await setCustomFieldDefinitionActive(req.params.definitionId, Boolean(req.body.isActive));
  return res.json(updated);
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

app.get('/api/status-definitions', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const entityType = (req.query.entityType as EntityType) ?? 'employee';
  const statuses = await listStatusDefinitions(user.tenantId!, entityType);
  return res.json(statuses);
});

app.post('/api/status-definitions', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const name = req.body.name as string;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const status = await createStatusDefinition({
    tenantId: user.tenantId!,
    entityType: req.body.entityType,
    name: name.trim(),
    color: req.body.color,
    order: req.body.order,
    isDefault: Boolean(req.body.isDefault),
  });

  return res.status(201).json(status);
});

app.patch('/api/status-definitions/:definitionId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await updateStatusDefinition(req.params.definitionId, user.tenantId!, {
    name: req.body.name,
    color: req.body.color,
    order: req.body.order,
    isDefault: req.body.isDefault,
    isActive: req.body.isActive,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json(result.statusDefinition);
});

app.get('/api/pto-policies', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const policies = await listPtoPolicies(user.tenantId!);
  return res.json(policies);
});

app.post('/api/pto-policies', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const name = req.body.name as string;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  const daysPerYear = Number(req.body.daysPerYear);
  if (!Number.isFinite(daysPerYear) || daysPerYear < 0) {
    return res.status(400).json({ error: 'Days per year must be a non-negative number' });
  }

  const policy = await createPtoPolicy({
    tenantId: user.tenantId!,
    name: name.trim(),
    color: req.body.color,
    accrualMethod: req.body.accrualMethod,
    daysPerYear,
    isPaid: req.body.isPaid,
    requiresApproval: req.body.requiresApproval,
  });

  return res.status(201).json(policy);
});

app.patch('/api/pto-policies/:policyId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (req.body.daysPerYear !== undefined) {
    const daysPerYear = Number(req.body.daysPerYear);
    if (!Number.isFinite(daysPerYear) || daysPerYear < 0) {
      return res.status(400).json({ error: 'Days per year must be a non-negative number' });
    }
    req.body.daysPerYear = daysPerYear;
  }

  const result = await updatePtoPolicy(req.params.policyId, user.tenantId!, {
    name: req.body.name,
    color: req.body.color,
    accrualMethod: req.body.accrualMethod,
    daysPerYear: req.body.daysPerYear,
    isPaid: req.body.isPaid,
    requiresApproval: req.body.requiresApproval,
    isActive: req.body.isActive,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json(result.policy);
});

app.get('/api/hr/employees/:employeeId/pto-policies', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const assignments = await listEmployeePtoPolicies(user.tenantId!, req.params.employeeId);
  return res.json(assignments);
});

app.post('/api/hr/employees/:employeeId/pto-policies', async (req, res) => {
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

  const result = await assignPtoPolicyToEmployee(user.tenantId!, req.params.employeeId, req.body.ptoPolicyId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json(result.assignment);
});

app.delete('/api/hr/employees/:employeeId/pto-policies/:policyId', async (req, res) => {
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

  const result = await unassignPtoPolicyFromEmployee(user.tenantId!, req.params.employeeId, req.params.policyId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(204).end();
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
  if (!definition || definition.tenantId !== user.tenantId || definition.entityType !== 'employee') {
    return res.status(404).json({ error: 'Custom field definition not found' });
  }

  if (!isValueValidForFieldType(definition.fieldType, req.body.value, definition.options)) {
    return res.status(400).json({ error: `Invalid value for field type '${definition.fieldType}'` });
  }

  const customFieldValue = await createCustomFieldValue({
    tenantId: user.tenantId!,
    customFieldDefinitionId: req.body.customFieldDefinitionId,
    entityType: 'employee',
    entityId: req.params.employeeId,
    value: req.body.value,
  });

  return res.status(201).json(customFieldValue);
});

app.patch('/api/hr/employees/:employeeId/custom-fields/:valueId', async (req, res) => {
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

  const existingValue = await findCustomFieldValueById(req.params.valueId);
  if (
    !existingValue ||
    existingValue.tenantId !== user.tenantId ||
    existingValue.entityType !== 'employee' ||
    existingValue.entityId !== req.params.employeeId
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

app.delete('/api/hr/employees/:employeeId/custom-fields/:valueId', async (req, res) => {
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

  const existingValue = await findCustomFieldValueById(req.params.valueId);
  if (
    !existingValue ||
    existingValue.tenantId !== user.tenantId ||
    existingValue.entityType !== 'employee' ||
    existingValue.entityId !== req.params.employeeId
  ) {
    return res.status(404).json({ error: 'Custom field value not found' });
  }

  await deleteCustomFieldValue(req.params.valueId);
  return res.status(204).end();
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

  const values = await listCustomFieldValuesForEntity(user.tenantId!, 'employee', req.params.employeeId);
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

  const updated = await updateClient(req.params.clientId, req.body, user.id);
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

app.patch('/api/clients/:clientId/custom-fields/:valueId', async (req, res) => {
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

app.delete('/api/clients/:clientId/custom-fields/:valueId', async (req, res) => {
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

app.get('/api/clients/:clientId/custom-fields', async (req, res) => {
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

// Catches anything an async route handler throws (e.g. Neon/Prisma dropping
// the connection) so it becomes a clean JSON response instead of crashing
// the process or leaking a stack trace to the client.
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

export default app;
