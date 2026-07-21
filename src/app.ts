import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
  findEmployeeByUserId,
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
  updateCustomFieldDefinition,
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
  findStatusDefinitionById,
  listStatusDefinitions,
  updateStatusDefinition,
} from './modules/hr/statusService.js';
import {
  createTimeOffPolicy,
  listTimeOffPolicies,
  updateTimeOffPolicy,
} from './modules/hr/timeOffPolicyService.js';
import {
  assignTimeOffPolicyToEmployee,
  listEmployeeTimeOffPolicies,
  unassignTimeOffPolicyFromEmployee,
} from './modules/hr/employeeTimeOffPolicyService.js';
import {
  cancelTimeOffRequest,
  createTimeOffRequest,
  decideTimeOffRequest,
  listAllTimeOffRequests,
  listTimeOffRequestsForCalendar,
  listMyTimeOffRequests,
  listPendingApprovals,
} from './modules/hr/timeOffRequestService.js';
import { calculateAllTimeOffBalances, calculateEmployeeTimeOffBalances } from './modules/hr/timeOffBalanceService.js';
import {
  createSavedView,
  deleteSavedView,
  listSavedViews,
  updateSavedView,
} from './modules/hr/savedViewService.js';
import {
  createPublicForm,
  findActivePublicForm,
  getTenantSlug,
  listPublicForms,
  submitPublicForm,
  updatePublicForm,
} from './modules/hr/publicFormService.js';
import { verifyTurnstileToken } from './lib/turnstile.js';
import { isRateLimited } from './lib/rateLimit.js';

dotenv.config();

const app = express();

// This is a JSON-only API, consumed cross-origin by design (the Vite dev
// server on a different port locally, and the public /apply pages always).
// Helmet's default Cross-Origin-Resource-Policy (`same-origin`) would have
// the browser block those fetches outright regardless of the cors()
// middleware below, so it's relaxed explicitly; everything else (HSTS,
// X-Content-Type-Options, frame protections, etc.) stays at Helmet's default.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
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

function getClientIp(req: express.Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
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

// Auth endpoints are prime brute-force/spam targets, so they get a tighter
// window than the general-purpose default (5 attempts per 15 minutes vs. the
// 5-per-minute default used elsewhere).
const AUTH_RATE_LIMIT = { windowMs: 15 * 60_000, maxRequests: 5 };

app.post('/api/auth/register', async (req, res) => {
  if (isRateLimited(`register:${getClientIp(req)}`, AUTH_RATE_LIMIT)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

  const result = await registerUser(req.body);

  if (!result.success) {
    return res.status(400).json({ error: result.error, field: result.field });
  }

  return res.status(201).json({ user: sanitizeUser(result.user!), session: result.session });
});

app.post('/api/tenants/register', async (req, res) => {
  if (isRateLimited(`tenant-register:${getClientIp(req)}`, AUTH_RATE_LIMIT)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

  const result = await registerTenantWithOwner({
    tenantName: req.body.tenantName,
    ownerFirstName: req.body.ownerFirstName,
    ownerLastName: req.body.ownerLastName,
    ownerEmail: req.body.ownerEmail,
    ownerPassword: req.body.ownerPassword,
    ownerPhone: req.body.ownerPhone,
    acceptedTerms: req.body.acceptedTerms,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error, field: result.field });
  }

  return res
    .status(201)
    .json({ tenant: result.tenant, user: sanitizeUser(result.user!), session: result.session });
});

app.post('/api/auth/login', async (req, res) => {
  if (isRateLimited(`login:${getClientIp(req)}`, AUTH_RATE_LIMIT)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

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

  const result = await changeOwnPassword(user.id, req.body, getBearerToken(req)!);
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

  if (req.body.statusId !== undefined) {
    const status = await findStatusDefinitionById(req.body.statusId);
    if (!status || status.tenantId !== user.tenantId) {
      return res.status(400).json({ error: 'Status not found' });
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

  const updated = await updateCustomFieldDefinition(req.params.definitionId, {
    name: req.body.name,
    required: req.body.required,
    options: req.body.options,
    isActive: req.body.isActive,
  });
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

app.get('/api/views', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const entityType = (req.query.entityType as EntityType) ?? 'employee';
  const views = await listSavedViews(user.tenantId!, entityType, user.id);
  return res.json(views);
});

app.post('/api/views', async (req, res) => {
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
    createdByRole: user.role,
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

app.patch('/api/views/:viewId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const result = await updateSavedView(req.params.viewId, user.tenantId!, user.id, user.role, {
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

app.delete('/api/views/:viewId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const result = await deleteSavedView(req.params.viewId, user.tenantId!, user.id, user.role);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(204).send();
});

app.get('/api/time-off-policies', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const policies = await listTimeOffPolicies(user.tenantId!);
  return res.json(policies);
});

app.post('/api/time-off-policies', async (req, res) => {
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

  const policy = await createTimeOffPolicy({
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

app.patch('/api/time-off-policies/:policyId', async (req, res) => {
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

  const result = await updateTimeOffPolicy(req.params.policyId, user.tenantId!, {
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

app.get('/api/hr/employees/:employeeId/time-off-policies', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const assignments = await listEmployeeTimeOffPolicies(user.tenantId!, req.params.employeeId);
  return res.json(assignments);
});

app.post('/api/hr/employees/:employeeId/time-off-policies', async (req, res) => {
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

  const result = await assignTimeOffPolicyToEmployee(user.tenantId!, req.params.employeeId, req.body.timeOffPolicyId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json(result.assignment);
});

app.delete('/api/hr/employees/:employeeId/time-off-policies/:policyId', async (req, res) => {
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

  const result = await unassignTimeOffPolicyFromEmployee(user.tenantId!, req.params.employeeId, req.params.policyId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(204).end();
});

app.post('/api/hr/time-off-requests', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const employee = await findEmployeeByUserId(user.id);
  if (!employee) {
    return res.status(400).json({ error: 'Your account is not linked to an employee record' });
  }

  const result = await createTimeOffRequest({
    tenantId: user.tenantId!,
    employeeId: employee.id,
    timeOffPolicyId: req.body.timeOffPolicyId,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    note: req.body.note,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json(result.request);
});

app.get('/api/hr/time-off-requests', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const scope = (req.query.scope as string) ?? 'mine';

  if (scope === 'calendar') {
    const requests = await listTimeOffRequestsForCalendar(user.tenantId!);
    return res.json(requests);
  }

  if (scope === 'all') {
    if (!canManageCustomFields(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const requests = await listAllTimeOffRequests(user.tenantId!);
    return res.json(requests);
  }

  const employee = await findEmployeeByUserId(user.id);
  if (!employee) {
    return res.json([]);
  }

  if (scope === 'pending-approval') {
    const requests = await listPendingApprovals(user.tenantId!, employee.id);
    return res.json(requests);
  }

  const requests = await listMyTimeOffRequests(user.tenantId!, employee.id);
  return res.json(requests);
});

app.patch('/api/hr/time-off-requests/:requestId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const decision = req.body.status;
  if (decision !== 'approved' && decision !== 'rejected') {
    return res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
  }

  const result = await decideTimeOffRequest(req.params.requestId, user.tenantId!, user, decision, req.body.decisionNote);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json(result.request);
});

app.delete('/api/hr/time-off-requests/:requestId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const employee = await findEmployeeByUserId(user.id);
  if (!employee) {
    return res.status(400).json({ error: 'Your account is not linked to an employee record' });
  }

  const result = await cancelTimeOffRequest(req.params.requestId, user.tenantId!, employee.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(204).end();
});

app.get('/api/hr/time-off-balances', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const balances = await calculateAllTimeOffBalances(user.tenantId!);
  return res.json(balances);
});

app.get('/api/hr/employees/:employeeId/time-off-balance', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const employee = await findEmployeeById(req.params.employeeId);
  if (!employee || employee.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  const isSelf = employee.userId === user.id;
  if (!isSelf && !canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const balances = await calculateEmployeeTimeOffBalances(user.tenantId!, req.params.employeeId);
  return res.json(balances);
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

  if (req.body.statusId !== undefined) {
    const status = await findStatusDefinitionById(req.body.statusId);
    if (!status || status.tenantId !== user.tenantId) {
      return res.status(400).json({ error: 'Status not found' });
    }
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

app.get('/api/public-forms', async (req, res) => {
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

app.post('/api/public-forms', async (req, res) => {
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
  if (entityType !== 'employee' && entityType !== 'client') {
    return res.status(400).json({ error: "entityType must be 'employee' or 'client'" });
  }

  const result = await createPublicForm({
    tenantId: user.tenantId!,
    entityType,
    name,
    slug,
    fields: req.body.fields ?? [],
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json(result.form);
});

app.patch('/api/public-forms/:formId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageCustomFields(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await updatePublicForm(req.params.formId, user.tenantId!, {
    name: req.body.name,
    fields: req.body.fields,
    isActive: req.body.isActive,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json(result.form);
});

// Public, unauthenticated: powers the standalone /apply/:tenantSlug/:formSlug page.
app.get('/api/public/:tenantSlug/:formSlug', async (req, res) => {
  const form = await findActivePublicForm(req.params.tenantSlug, req.params.formSlug);
  if (!form) {
    return res.status(404).json({ error: 'Form not found' });
  }

  const fields = JSON.parse(form.fieldsConfig) as { key: string; required: boolean }[];
  const customFieldIds = fields.filter((f) => f.key.startsWith('cf:')).map((f) => f.key.slice(3));
  const customFieldDefs = (await Promise.all(customFieldIds.map((id) => findCustomFieldDefinitionById(id)))).filter(
    (d): d is NonNullable<typeof d> => d !== null,
  );

  return res.json({
    id: form.id,
    name: form.name,
    entityType: form.entityType,
    fields,
    customFieldDefs,
  });
});

// Public, unauthenticated: submits the form. Turnstile + a per-IP rate limit
// are the only guards — no session, so anyone with the link can reach this.
app.post('/api/public/:tenantSlug/:formSlug/submit', async (req, res) => {
  const clientIp = getClientIp(req);
  if (isRateLimited(`public-form:${clientIp}`)) {
    return res.status(429).json({ error: 'Too many submissions. Please try again in a minute.' });
  }

  const turnstileValid = await verifyTurnstileToken(req.body.turnstileToken, clientIp);
  if (!turnstileValid) {
    return res.status(400).json({ error: 'CAPTCHA verification failed. Please try again.' });
  }

  const form = await findActivePublicForm(req.params.tenantSlug, req.params.formSlug);
  if (!form) {
    return res.status(404).json({ error: 'Form not found' });
  }

  const result = await submitPublicForm(form, {
    firstName: req.body.firstName ?? '',
    lastName: req.body.lastName ?? '',
    email: req.body.email ?? '',
    values: req.body.values ?? {},
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json({ success: true });
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
