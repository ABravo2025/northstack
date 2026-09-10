import type express from 'express';
import { z } from 'zod';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { getClientIp } from '../lib/httpAuth.js';
import { bestEffort } from '../lib/bestEffort.js';
import { isRateLimited } from '../lib/rateLimit.js';
import prismaExternal from '../lib/prismaExternal.js';
import { authenticateApiKey, hasScope, type AuthenticatedApiKey } from '../lib/externalApiAuth.js';
import { findEntityTenantId, isSupportedCrossModuleEntityType } from '../modules/crossModule/entityLookup.js';
import type { EntityType } from '@prisma/client';
import { findUserById } from '../modules/tenant/tenantService.js';
import {
  listAllTasksForTenant,
  findTaskById,
  createTask,
  updateTask,
  deleteTask,
} from '../modules/tasks/taskService.js';
import {
  listAllNotesForTenant,
  findNoteById,
  createNote,
  updateNote,
  deleteNote,
} from '../modules/notes/noteService.js';
import {
  listCompanies,
  findCompanyById,
  createCompany,
  updateCompany,
  deleteCompany,
  wouldCreateCompanyHierarchyCycle,
} from '../modules/crm/companyService.js';
import {
  listContacts,
  findContactById,
  createContact,
  updateContact,
  deactivateContact,
} from '../modules/crm/contactService.js';
import { validateContactRefs } from '../routes/contacts.js';
import {
  listOpportunities,
  findOpportunityById,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
} from '../modules/crm/opportunityService.js';
import { validateOpportunityRefs } from '../routes/opportunities.js';
import { findPipelineById, listPipelines } from '../modules/crm/pipelineService.js';
import {
  listEmployees,
  findEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  wouldCreateManagerCycle,
} from '../modules/hr/employeeService.js';
import { VALID_CONTRACT_TYPES, VALID_PERSON_TYPES } from '../routes/employees.js';
import { findFieldCatalogDefinitionById } from '../modules/hr/fieldCatalogService.js';
import { findStatusDefinitionById } from '../modules/hr/statusService.js';
import { listAllTimeOffRequests, createTimeOffRequest } from '../modules/hr/timeOffRequestService.js';
import { listRuns } from '../modules/hr/payrollRunService.js';

// Private API (spec-private-api-webhooks.md, Units 2-3) — endpoints under /api/external/v1/*.
// This router wraps the already-existing internal services (same principle the rest of the app
// follows: thin routes, logic in src/modules/*/*.ts) rather than reimplementing them; the real
// difference from /api/* for the same resource is the auth layer (ApiKey+scope vs. Session+role)
// and the error shape (stable {error, code} JSON, not a message meant for a form in the SPA).
// Unit 3 (write endpoints) attributes every create/update/delete to `apiKey.createdByUserId` —
// the user who created the key — since an ApiKey isn't a User/session and every existing service
// function's changedByUserId/createdById parameter needs a real one.

export const externalApiRouter = createAsyncRouter();

export interface ExternalApiRequest extends express.Request {
  apiKey: AuthenticatedApiKey;
}

const RATE_LIMIT = { windowMs: 60_000, maxRequests: 120 };
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

// Entry point for the whole router — authenticates the ApiKey, rate-limits by key, and attaches
// the key to `req` for every handler below. NOT wrapped by createAsyncRouter (that factory only
// wraps exact (path, singleHandler) route registrations, not router.use() middleware — see
// asyncRouter.ts), so this function catches its own errors instead of relying on that wrapper;
// an unhandled rejection here would otherwise crash the process the same way an unwrapped route
// handler would.
externalApiRouter.use('/api/external/v1', async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const apiKey = await authenticateApiKey(req, res);
    if (!apiKey) return; // authenticateApiKey already sent the 401 — never logged (spec §6: only authenticated calls are)

    if (await isRateLimited(`apikey:${apiKey.id}`, RATE_LIMIT)) {
      res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT.windowMs / 1000)));
      await respond(req, res, apiKey, 429, { error: 'Too many requests. Slow down and try again shortly.', code: 'rate_limited' });
      return;
    }

    (req as unknown as ExternalApiRequest).apiKey = apiKey;
    next();
  } catch (err) {
    console.error('externalApiRouter entry middleware failed:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'internal_error' });
    }
  }
});

// Writes the ApiRequestLog row and THEN sends the response — never the other way around. Vercel
// can freeze a serverless function immediately after the HTTP response is flushed (confirmed
// 2026-08-25 for un-awaited signup emails, see bestEffort.ts), so a `res.on('finish')` listener
// that starts the write only after the response is already out would risk silently losing log
// rows the same way. bestEffort() still swallows a write failure instead of failing the request.
async function respond(req: express.Request, res: express.Response, apiKey: AuthenticatedApiKey, status: number, body: unknown): Promise<void> {
  await bestEffort(
    prismaExternal.apiRequestLog.create({
      data: {
        tenantId: apiKey.tenantId,
        apiKeyId: apiKey.id,
        method: req.method,
        path: req.path,
        statusCode: status,
        ipAddress: getClientIp(req),
      },
    }),
    `Failed to write ApiRequestLog for ${req.method} ${req.path}`,
  );
  // 204 must never carry a body (RFC 7231) — used by every DELETE handler below.
  if (status === 204) {
    res.status(204).end();
    return;
  }
  res.status(status).json(body);
}

async function requireScopeLogged(req: express.Request, res: express.Response, apiKey: AuthenticatedApiKey, scope: string): Promise<boolean> {
  if (hasScope(apiKey, scope)) return true;
  await respond(req, res, apiKey, 403, {
    error: `This API key is missing the required scope: ${scope}`,
    code: 'missing_scope',
    required: scope,
  });
  return false;
}

interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
}

// v1 simplification: paginates an already-fetched, already-tenant-scoped array in memory instead
// of pushing cursor/limit into the DB query itself — same "fetch complete, paginate after"
// approach the rest of the app already uses for Views/Filters (frontend/src/lib/viewFields.ts)
// given today's data volumes. The cursor is opaque to the caller (a row id), so a real keyset
// query could replace this later without changing the API contract. Revisit if/when a tenant's
// list grows large enough for an in-memory sort/slice to matter.
// A cursor that doesn't match any row (stale, tampered, or from a differently-filtered request)
// throws rather than silently falling back to index 0 — an unrecognized cursor restarting
// pagination from page 1 without any signal would be a confusing, hard-to-notice bug for a
// consumer that thinks it's fetching page N+1 and quietly gets page 1 again.
export class InvalidCursorError extends Error {}

export function paginate<T extends { id: string }>(items: T[], req: express.Request): PaginatedResult<T> {
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  const limitParam = typeof req.query.limit === 'string' ? Number(req.query.limit) : NaN;
  const pageSize = Math.min(Math.max(Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  let startIndex = 0;
  if (cursor) {
    const cursorIndex = items.findIndex((item) => item.id === cursor);
    if (cursorIndex === -1) {
      throw new InvalidCursorError(`Unknown cursor: ${cursor}`);
    }
    startIndex = cursorIndex + 1;
  }

  const page = items.slice(startIndex, startIndex + pageSize);
  const nextCursor = startIndex + pageSize < items.length ? (page[page.length - 1]?.id ?? null) : null;
  return { data: page, nextCursor };
}

// Every list handler below calls this instead of paginate()+respond() directly, so the
// invalid-cursor 400 (see InvalidCursorError above) is handled in one place instead of repeated
// try/catch in all 9 handlers.
async function respondPaginated<T extends { id: string }>(req: express.Request, res: express.Response, apiKey: AuthenticatedApiKey, items: T[]): Promise<void> {
  try {
    return await respond(req, res, apiKey, 200, paginate(items, req));
  } catch (err) {
    if (err instanceof InvalidCursorError) {
      return respond(req, res, apiKey, 400, { error: err.message, code: 'invalid_cursor' });
    }
    throw err;
  }
}

// First real use of zod in this project (task 19 of the task breakdown) — every write handler
// below parses req.body through one of these instead of hand-checking fields one at a time like
// the internal /api/* routes do. On failure, sends a 400 with a field-level breakdown (so an
// integrator can fix their payload without guessing) and logs it like any other authenticated
// call; returns `null` so the caller knows to stop.
async function parseBody<T>(req: express.Request, res: express.Response, apiKey: AuthenticatedApiKey, schema: z.ZodType<T>): Promise<T | null> {
  // express.json() only populates req.body when Content-Type: application/json is set — a DELETE
  // with genuinely no options (no body, no Content-Type) leaves it `undefined`, which a schema of
  // all-optional fields would otherwise still fail on (z.object rejects undefined outright).
  const result = schema.safeParse(req.body ?? {});
  if (result.success) return result.data;

  await respond(req, res, apiKey, 400, {
    error: 'Invalid request body',
    code: 'validation_error',
    details: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  });
  return null;
}

// A datetime field accepts a full ISO 8601 string (matches how the internal /api/* routes already
// hand dueDate/completedAt straight to Prisma without parsing) or null/undefined to clear it.
const isoDateTime = z.string().datetime({ message: 'Must be an ISO 8601 datetime string' });

// Looser than isoDateTime — Time Off's startDate/endDate are calendar dates ("2026-09-10"), not a
// specific moment, and timeOffRequestService.ts's createTimeOffRequest already does its own
// `new Date(...)`/NaN check; this just rejects the obviously-wrong shape earlier with a field-level
// error instead of a generic "Invalid start or end date" from deeper in the service.
const dateString = z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), { message: 'Must be a valid date' });

// Every findXById below follows the app-wide "unscoped global lookup, then verify tenantId"
// convention documented in lib/prisma.ts's header comment (pattern 2) — the id is already
// globally unique, so the tenant check happens here rather than in the query itself.
function notFound(req: express.Request, res: express.Response, apiKey: AuthenticatedApiKey) {
  return respond(req, res, apiKey, 404, { error: 'Not found', code: 'not_found' });
}

function badRequest(req: express.Request, res: express.Response, apiKey: AuthenticatedApiKey, message: string) {
  return respond(req, res, apiKey, 400, { error: message, code: 'bad_request' });
}

// Task/Note are cross-entity (entityType/entityId) — same anti-IDOR check the internal
// routes/tasks.ts and routes/notes.ts already do before create: the referenced Employee/Company/
// Contact/Opportunity has to actually belong to this tenant, not just exist somewhere.
async function verifyCrossModuleEntity(req: express.Request, res: express.Response, apiKey: AuthenticatedApiKey, entityType: string, entityId: string): Promise<boolean> {
  if (!isSupportedCrossModuleEntityType(entityType)) {
    await badRequest(req, res, apiKey, `Unsupported entityType: ${entityType}`);
    return false;
  }
  const entityTenantId = await findEntityTenantId(entityType, entityId);
  if (!entityTenantId || entityTenantId !== apiKey.tenantId) {
    await notFound(req, res, apiKey);
    return false;
  }
  return true;
}

// ---- Tasks ----

const taskCreateSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  assigneeId: z.string().min(1),
  dueDate: isoDateTime.nullable().optional(),
});

const taskUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assigneeId: z.string().min(1).optional(),
  dueDate: isoDateTime.nullable().optional(),
  completedAt: isoDateTime.nullable().optional(),
});

externalApiRouter.get('/api/external/v1/tasks', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'tasks:read'))) return;
  const tasks = await listAllTasksForTenant(apiKey.tenantId, prismaExternal);
  return respondPaginated(req, res, apiKey, tasks);
});

externalApiRouter.get('/api/external/v1/tasks/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'tasks:read'))) return;
  const task = await findTaskById(req.params.id, prismaExternal);
  if (!task || task.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);
  return respond(req, res, apiKey, 200, task);
});

externalApiRouter.post('/api/external/v1/tasks', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'tasks:write'))) return;
  const body = await parseBody(req, res, apiKey, taskCreateSchema);
  if (!body) return;

  if (!(await verifyCrossModuleEntity(req, res, apiKey, body.entityType, body.entityId))) return;

  const assignee = await findUserById(body.assigneeId, prismaExternal);
  if (!assignee || assignee.tenantId !== apiKey.tenantId) return badRequest(req, res, apiKey, 'assigneeId not found in this tenant');

  const task = await createTask(
    {
      tenantId: apiKey.tenantId,
      // Safe cast: verifyCrossModuleEntity above already ran isSupportedCrossModuleEntityType on
      // this exact value (its own type guard just doesn't narrow body.entityType across the call).
      entityType: body.entityType as EntityType,
      entityId: body.entityId,
      title: body.title,
      description: body.description ?? null,
      assigneeId: body.assigneeId,
      dueDate: body.dueDate ?? null,
      createdById: apiKey.createdByUserId,
    },
    prismaExternal,
  );
  return respond(req, res, apiKey, 201, task);
});

externalApiRouter.patch('/api/external/v1/tasks/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'tasks:write'))) return;
  const body = await parseBody(req, res, apiKey, taskUpdateSchema);
  if (!body) return;

  const existing = await findTaskById(req.params.id, prismaExternal);
  if (!existing || existing.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);

  if (body.assigneeId !== undefined) {
    const assignee = await findUserById(body.assigneeId, prismaExternal);
    if (!assignee || assignee.tenantId !== apiKey.tenantId) return badRequest(req, res, apiKey, 'assigneeId not found in this tenant');
  }

  const updated = await updateTask(req.params.id, body, apiKey.createdByUserId, prismaExternal);
  return respond(req, res, apiKey, 200, updated);
});

externalApiRouter.delete('/api/external/v1/tasks/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'tasks:write'))) return;

  const existing = await findTaskById(req.params.id, prismaExternal);
  if (!existing || existing.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);

  await deleteTask(req.params.id, apiKey.createdByUserId, prismaExternal);
  return respond(req, res, apiKey, 204, {});
});

// ---- Notes ----

externalApiRouter.get('/api/external/v1/notes', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'notes:read'))) return;
  const notes = await listAllNotesForTenant(apiKey.tenantId, prismaExternal);
  return respondPaginated(req, res, apiKey, notes);
});

externalApiRouter.get('/api/external/v1/notes/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'notes:read'))) return;
  const note = await findNoteById(req.params.id, prismaExternal);
  if (!note || note.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);
  return respond(req, res, apiKey, 200, note);
});

const noteCreateSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
});

const noteUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

externalApiRouter.post('/api/external/v1/notes', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'notes:write'))) return;
  const body = await parseBody(req, res, apiKey, noteCreateSchema);
  if (!body) return;

  if (!(await verifyCrossModuleEntity(req, res, apiKey, body.entityType, body.entityId))) return;

  const note = await createNote(
    {
      tenantId: apiKey.tenantId,
      entityType: body.entityType as EntityType,
      entityId: body.entityId,
      title: body.title,
      description: body.description,
      createdById: apiKey.createdByUserId,
    },
    prismaExternal,
  );
  return respond(req, res, apiKey, 201, note);
});

externalApiRouter.patch('/api/external/v1/notes/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'notes:write'))) return;
  const body = await parseBody(req, res, apiKey, noteUpdateSchema);
  if (!body) return;

  const existing = await findNoteById(req.params.id, prismaExternal);
  if (!existing || existing.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);

  const updated = await updateNote(req.params.id, body, apiKey.createdByUserId, prismaExternal);
  return respond(req, res, apiKey, 200, updated);
});

externalApiRouter.delete('/api/external/v1/notes/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'notes:write'))) return;

  const existing = await findNoteById(req.params.id, prismaExternal);
  if (!existing || existing.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);

  await deleteNote(req.params.id, apiKey.createdByUserId, prismaExternal);
  return respond(req, res, apiKey, 204, {});
});

// ---- CRM: Companies ----

externalApiRouter.get('/api/external/v1/crm/companies', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'crm.companies:read'))) return;
  const companies = await listCompanies(apiKey.tenantId, prismaExternal);
  return respondPaginated(req, res, apiKey, companies);
});

externalApiRouter.get('/api/external/v1/crm/companies/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'crm.companies:read'))) return;
  const company = await findCompanyById(req.params.id, prismaExternal);
  if (!company || company.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);
  return respond(req, res, apiKey, 200, company);
});

const companyContactSchema = z.union([
  z.object({ contactId: z.string().min(1) }),
  z.object({ firstName: z.string().min(1), lastName: z.string().min(1), email: z.string().email() }),
]);

const companyCreateSchema = z.object({
  name: z.string().min(1),
  industry: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  billingAddress: z.string().nullable().optional(),
  sizeId: z.string().nullable().optional(),
  accountOwnerId: z.string().nullable().optional(),
  isPlaceholder: z.boolean().optional(),
  contact: companyContactSchema,
});

const companyUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  industry: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  billingAddress: z.string().nullable().optional(),
  sizeId: z.string().nullable().optional(),
  accountOwnerId: z.string().nullable().optional(),
  parentCompanyId: z.string().nullable().optional(),
  isPlaceholder: z.boolean().optional(),
});

const companyDeleteOptionsSchema = z.object({
  deleteLinkedOpportunities: z.boolean().optional(),
  cascadeToChildCompanies: z.boolean().optional(),
});

externalApiRouter.post('/api/external/v1/crm/companies', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'crm.companies:write'))) return;
  const body = await parseBody(req, res, apiKey, companyCreateSchema);
  if (!body) return;

  let contact: { contactId: string } | { firstName: string; lastName: string; email: string };
  if ('contactId' in body.contact) {
    const existingContact = await findContactById(body.contact.contactId, prismaExternal);
    if (!existingContact || existingContact.tenantId !== apiKey.tenantId) return badRequest(req, res, apiKey, 'contact.contactId not found in this tenant');
    contact = { contactId: body.contact.contactId };
  } else {
    contact = body.contact;
  }

  if (body.accountOwnerId) {
    const owner = await findUserById(body.accountOwnerId, prismaExternal);
    if (!owner || owner.tenantId !== apiKey.tenantId) return badRequest(req, res, apiKey, 'accountOwnerId not found in this tenant');
  }

  const company = await createCompany({ ...body, contact, tenantId: apiKey.tenantId }, apiKey.createdByUserId, prismaExternal);
  return respond(req, res, apiKey, 201, company);
});

externalApiRouter.patch('/api/external/v1/crm/companies/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'crm.companies:write'))) return;
  const body = await parseBody(req, res, apiKey, companyUpdateSchema);
  if (!body) return;

  const existing = await findCompanyById(req.params.id, prismaExternal);
  if (!existing || existing.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);

  if (body.accountOwnerId) {
    const owner = await findUserById(body.accountOwnerId, prismaExternal);
    if (!owner || owner.tenantId !== apiKey.tenantId) return badRequest(req, res, apiKey, 'accountOwnerId not found in this tenant');
  }
  if (body.parentCompanyId) {
    const parent = await findCompanyById(body.parentCompanyId, prismaExternal);
    if (!parent || parent.tenantId !== apiKey.tenantId) return badRequest(req, res, apiKey, 'parentCompanyId not found in this tenant');
    if (await wouldCreateCompanyHierarchyCycle(req.params.id, body.parentCompanyId)) {
      return badRequest(req, res, apiKey, 'This would create a company hierarchy cycle');
    }
  }

  const updated = await updateCompany(req.params.id, body, apiKey.createdByUserId, prismaExternal);
  return respond(req, res, apiKey, 200, updated);
});

externalApiRouter.delete('/api/external/v1/crm/companies/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'crm.companies:write'))) return;

  const existing = await findCompanyById(req.params.id, prismaExternal);
  if (!existing || existing.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);

  const options = await parseBody(req, res, apiKey, companyDeleteOptionsSchema);
  if (!options) return;

  const result = await deleteCompany(req.params.id, apiKey.createdByUserId, options, prismaExternal);
  if (!result.success) return badRequest(req, res, apiKey, result.error ?? 'Could not delete company');
  return respond(req, res, apiKey, 204, {});
});

// ---- CRM: Contacts ----

externalApiRouter.get('/api/external/v1/crm/contacts', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'crm.contacts:read'))) return;
  const contacts = await listContacts(apiKey.tenantId, false, prismaExternal);
  return respondPaginated(req, res, apiKey, contacts);
});

externalApiRouter.get('/api/external/v1/crm/contacts/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'crm.contacts:read'))) return;
  const contact = await findContactById(req.params.id, prismaExternal);
  if (!contact || contact.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);
  return respond(req, res, apiKey, 200, contact);
});

const contactCreateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
  leadStatus: z.string().nullable().optional(),
  leadSourceId: z.string().nullable().optional(),
});

const contactUpdateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
  leadStatus: z.string().nullable().optional(),
  leadSourceId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

externalApiRouter.post('/api/external/v1/crm/contacts', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'crm.contacts:write'))) return;
  const body = await parseBody(req, res, apiKey, contactCreateSchema);
  if (!body) return;

  const refError = await validateContactRefs(apiKey.tenantId, body);
  if (refError) return badRequest(req, res, apiKey, refError.error);

  try {
    const contact = await createContact({ ...body, tenantId: apiKey.tenantId } as any, apiKey.createdByUserId, prismaExternal);
    return respond(req, res, apiKey, 201, contact);
  } catch (error) {
    // Contact.email is unique per tenant — same P2002 handled by the internal route.
    if ((error as { code?: string }).code === 'P2002') {
      return badRequest(req, res, apiKey, `A contact with email "${body.email}" already exists`);
    }
    throw error;
  }
});

externalApiRouter.patch('/api/external/v1/crm/contacts/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'crm.contacts:write'))) return;
  const body = await parseBody(req, res, apiKey, contactUpdateSchema);
  if (!body) return;

  const existing = await findContactById(req.params.id, prismaExternal);
  if (!existing || existing.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);

  const refError = await validateContactRefs(apiKey.tenantId, body);
  if (refError) return badRequest(req, res, apiKey, refError.error);

  try {
    const updated = await updateContact(req.params.id, body as any, apiKey.createdByUserId, prismaExternal);
    return respond(req, res, apiKey, 200, updated);
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return badRequest(req, res, apiKey, `A contact with email "${body.email}" already exists`);
    }
    throw error;
  }
});

// Soft delete (deactivate), same as the internal DELETE /api/contacts/:id — never destroys, never
// blocks (contactService.ts's deactivateContact, spec §2.2).
externalApiRouter.delete('/api/external/v1/crm/contacts/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'crm.contacts:write'))) return;

  const existing = await findContactById(req.params.id, prismaExternal);
  if (!existing || existing.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);

  await deactivateContact(req.params.id, apiKey.createdByUserId, prismaExternal);
  return respond(req, res, apiKey, 204, {});
});

// ---- CRM: Opportunities ----

externalApiRouter.get('/api/external/v1/crm/opportunities', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'crm.opportunities:read'))) return;
  const opportunities = await listOpportunities(apiKey.tenantId, false, prismaExternal);
  return respondPaginated(req, res, apiKey, opportunities);
});

externalApiRouter.get('/api/external/v1/crm/opportunities/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'crm.opportunities:read'))) return;
  const opportunity = await findOpportunityById(req.params.id, prismaExternal);
  if (!opportunity || opportunity.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);
  return respond(req, res, apiKey, 200, opportunity);
});

const opportunityCreateSchema = z.object({
  companyId: z.string().min(1),
  pipelineId: z.string().min(1),
  stageId: z.string().min(1).optional(),
  name: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().min(1),
  estimatedCloseDate: isoDateTime.nullable().optional(),
  ownerId: z.string().min(1).nullable().optional(),
  lossReasonId: z.string().nullable().optional(),
  winReasonId: z.string().nullable().optional(),
  closeNote: z.string().nullable().optional(),
  nextStepDate: isoDateTime.nullable().optional(),
  nextStepNote: z.string().nullable().optional(),
});

// Stage changes go through this same generic PATCH (send `stageId` alone or alongside other
// fields) — there is NO separate stage-change endpoint. The task breakdown originally called for
// one, on the premise that the internal API already separates it; it doesn't (routes/opportunities.ts
// PATCH handles stage moves too, same as drag-and-drop Kanban reusing this exact PATCH — see
// contexto-proyecto.md's 2026-07-16 Kanban section). Building a second, narrower endpoint here
// would just duplicate validateOpportunityRefs's stage/win-loss-reason logic for no real gain.
const opportunityUpdateSchema = z.object({
  companyId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  amountCents: z.number().int().nonnegative().optional(),
  currency: z.string().min(1).optional(),
  pipelineId: z.string().min(1).optional(),
  stageId: z.string().min(1).optional(),
  estimatedCloseDate: isoDateTime.nullable().optional(),
  ownerId: z.string().min(1).nullable().optional(),
  lossReasonId: z.string().nullable().optional(),
  winReasonId: z.string().nullable().optional(),
  closeNote: z.string().nullable().optional(),
  nextStepDate: isoDateTime.nullable().optional(),
  nextStepNote: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

externalApiRouter.post('/api/external/v1/crm/opportunities', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'crm.opportunities:write'))) return;
  const body = await parseBody(req, res, apiKey, opportunityCreateSchema);
  if (!body) return;

  // Falsy (including an explicit null) means "let assignment automation decide" — same coercion
  // the internal POST /api/opportunities does before validateOpportunityRefs runs.
  const ownerId = body.ownerId || undefined;

  const targetPipeline = await findPipelineById(body.pipelineId);
  if (!targetPipeline || targetPipeline.tenantId !== apiKey.tenantId) return badRequest(req, res, apiKey, 'Pipeline not found');
  if (!ownerId && !targetPipeline.assignmentMode) return badRequest(req, res, apiKey, 'ownerId is required');

  const refError = await validateOpportunityRefs(apiKey.tenantId, { ...body, ownerId }, body.pipelineId);
  if (refError) return badRequest(req, res, apiKey, refError.error);

  const opportunity = await createOpportunity({ ...body, ownerId, tenantId: apiKey.tenantId }, apiKey.createdByUserId, prismaExternal);
  return respond(req, res, apiKey, 201, opportunity);
});

externalApiRouter.patch('/api/external/v1/crm/opportunities/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'crm.opportunities:write'))) return;
  const body = await parseBody(req, res, apiKey, opportunityUpdateSchema);
  if (!body) return;

  const existing = await findOpportunityById(req.params.id, prismaExternal);
  if (!existing || existing.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);

  // A stray '' (vs. an intentional `null` to clear the owner) isn't treated as an explicit value —
  // same as the internal PATCH handler.
  const ownerId = body.ownerId === '' ? undefined : body.ownerId;

  const refError = await validateOpportunityRefs(
    apiKey.tenantId,
    { ...body, ownerId },
    body.pipelineId || existing.pipelineId,
    existing.lossReasonId,
    existing.companyId,
    existing.winReasonId,
    existing.pipelineId,
  );
  if (refError) return badRequest(req, res, apiKey, refError.error);

  const updated = await updateOpportunity(
    req.params.id,
    apiKey.tenantId,
    { ...body, ownerId, changedByUserId: apiKey.createdByUserId },
    prismaExternal,
  );
  return respond(req, res, apiKey, 200, updated);
});

externalApiRouter.delete('/api/external/v1/crm/opportunities/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'crm.opportunities:write'))) return;

  const existing = await findOpportunityById(req.params.id, prismaExternal);
  if (!existing || existing.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);

  await deleteOpportunity(req.params.id, apiKey.createdByUserId, prismaExternal);
  return respond(req, res, apiKey, 204, {});
});

// ---- CRM: Pipelines (read-only — configuration, not a "movimiento", spec §3) ----

externalApiRouter.get('/api/external/v1/crm/pipelines', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'crm.pipelines:read'))) return;
  const pipelines = await listPipelines(apiKey.tenantId, prismaExternal);
  return respondPaginated(req, res, apiKey, pipelines);
});

// ---- HR: Employees ----

externalApiRouter.get('/api/external/v1/hr/employees', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'hr.employees:read'))) return;
  // No visibleIds filter — the internal Employee-scope permission (self/department/all, Fase E)
  // gates what a logged-in *person* sees; a key's scope is the sole source of authorization for
  // this API (spec decision #4), so a key with hr.employees:read sees every Employee in the tenant.
  const employees = await listEmployees(apiKey.tenantId, null, prismaExternal);
  return respondPaginated(req, res, apiKey, employees);
});

externalApiRouter.get('/api/external/v1/hr/employees/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'hr.employees:read'))) return;
  const employee = await findEmployeeById(req.params.id, prismaExternal);
  if (!employee || employee.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);
  return respond(req, res, apiKey, 200, employee);
});

const employeeCreateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  departmentId: z.string().nullable().optional(),
  jobTitleId: z.string().nullable().optional(),
  contractType: z.string().nullable().optional(),
  personType: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  startDate: isoDateTime.nullable().optional(),
  endDate: isoDateTime.nullable().optional(),
  birthdate: isoDateTime.nullable().optional(),
  contractUrl: z.string().nullable().optional(),
  personalEmail: z.string().nullable().optional(),
  statusId: z.string().optional(),
  managerId: z.string().nullable().optional(),
});

const employeeUpdateSchema = employeeCreateSchema.partial();

function validEnumOrNull(value: string | null | undefined, valid: string[]): boolean {
  return value === undefined || value === null || valid.includes(value);
}

externalApiRouter.post('/api/external/v1/hr/employees', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'hr.employees:write'))) return;
  const body = await parseBody(req, res, apiKey, employeeCreateSchema);
  if (!body) return;

  if (!validEnumOrNull(body.contractType, VALID_CONTRACT_TYPES)) return badRequest(req, res, apiKey, 'Invalid contract type');
  if (!validEnumOrNull(body.personType, VALID_PERSON_TYPES)) return badRequest(req, res, apiKey, 'Invalid person type');

  if (body.managerId) {
    const manager = await findEmployeeById(body.managerId, prismaExternal);
    if (!manager || manager.tenantId !== apiKey.tenantId) return badRequest(req, res, apiKey, 'managerId not found in this tenant');
  }
  if (body.departmentId) {
    const department = await findFieldCatalogDefinitionById(body.departmentId);
    if (!department || department.tenantId !== apiKey.tenantId || department.kind !== 'department') return badRequest(req, res, apiKey, 'departmentId not found in this tenant');
  }
  if (body.jobTitleId) {
    const jobTitle = await findFieldCatalogDefinitionById(body.jobTitleId);
    if (!jobTitle || jobTitle.tenantId !== apiKey.tenantId || jobTitle.kind !== 'jobTitle') return badRequest(req, res, apiKey, 'jobTitleId not found in this tenant');
  }

  const employee = await createEmployee({ ...body, tenantId: apiKey.tenantId } as any, apiKey.createdByUserId, prismaExternal);
  return respond(req, res, apiKey, 201, employee);
});

externalApiRouter.patch('/api/external/v1/hr/employees/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'hr.employees:write'))) return;
  const body = await parseBody(req, res, apiKey, employeeUpdateSchema);
  if (!body) return;

  if (!validEnumOrNull(body.contractType, VALID_CONTRACT_TYPES)) return badRequest(req, res, apiKey, 'Invalid contract type');
  if (!validEnumOrNull(body.personType, VALID_PERSON_TYPES)) return badRequest(req, res, apiKey, 'Invalid person type');

  const existing = await findEmployeeById(req.params.id, prismaExternal);
  if (!existing || existing.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);

  // Same guard as the internal PATCH — a terminated employee's status can't be changed back
  // through the generic update (that would silently reopen a second real termination/payment).
  if (body.statusId !== undefined && body.statusId !== existing.statusId) {
    const currentStatus = await findStatusDefinitionById(existing.statusId);
    if (currentStatus?.isTerminatedStatus) return badRequest(req, res, apiKey, 'Cannot change the status of a terminated employee');
  }

  if (body.managerId) {
    const manager = await findEmployeeById(body.managerId, prismaExternal);
    if (!manager || manager.tenantId !== apiKey.tenantId) return badRequest(req, res, apiKey, 'managerId not found in this tenant');
    if (await wouldCreateManagerCycle(req.params.id, body.managerId)) return badRequest(req, res, apiKey, 'This would create a reporting cycle');
  }
  if (body.statusId !== undefined) {
    const status = await findStatusDefinitionById(body.statusId);
    if (!status || status.tenantId !== apiKey.tenantId) return badRequest(req, res, apiKey, 'statusId not found in this tenant');
  }
  if (body.departmentId) {
    const department = await findFieldCatalogDefinitionById(body.departmentId);
    if (!department || department.tenantId !== apiKey.tenantId || department.kind !== 'department') return badRequest(req, res, apiKey, 'departmentId not found in this tenant');
  }
  if (body.jobTitleId) {
    const jobTitle = await findFieldCatalogDefinitionById(body.jobTitleId);
    if (!jobTitle || jobTitle.tenantId !== apiKey.tenantId || jobTitle.kind !== 'jobTitle') return badRequest(req, res, apiKey, 'jobTitleId not found in this tenant');
  }

  const updated = await updateEmployee(req.params.id, body as any, apiKey.createdByUserId, prismaExternal);
  return respond(req, res, apiKey, 200, updated);
});

externalApiRouter.delete('/api/external/v1/hr/employees/:id', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'hr.employees:write'))) return;

  const existing = await findEmployeeById(req.params.id, prismaExternal);
  if (!existing || existing.tenantId !== apiKey.tenantId) return notFound(req, res, apiKey);

  await deleteEmployee(req.params.id, apiKey.createdByUserId, prismaExternal);
  return respond(req, res, apiKey, 204, {});
});

// ---- HR: Time Off ----

externalApiRouter.get('/api/external/v1/hr/timeoff', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'hr.timeoff:read'))) return;
  const requests = await listAllTimeOffRequests(apiKey.tenantId, prismaExternal);
  return respondPaginated(req, res, apiKey, requests);
});

const timeOffCreateSchema = z.object({
  employeeId: z.string().min(1),
  timeOffPolicyId: z.string().min(1),
  startDate: dateString,
  endDate: dateString,
  note: z.string().optional(),
});

// POST only — no PATCH/DELETE for Time Off (no GET .../:id in Unit 2 either, same reasoning).
// Deciding (approve/reject) a request is deliberately NOT exposed: it's gated by "is this
// person's assigned manager" (timeOffRequestService.ts's decideTimeOffRequest), a relationship an
// ApiKey structurally can't have (spec decision #4 — a key isn't a User, has no identity of its
// own to be someone's manager).
externalApiRouter.post('/api/external/v1/hr/timeoff', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'hr.timeoff:write'))) return;
  const body = await parseBody(req, res, apiKey, timeOffCreateSchema);
  if (!body) return;

  const result = await createTimeOffRequest({ ...body, tenantId: apiKey.tenantId }, apiKey.createdByUserId, prismaExternal);
  if (!result.success) return badRequest(req, res, apiKey, result.error ?? 'Could not create time off request');
  return respond(req, res, apiKey, 201, result.request);
});

// ---- HR: Payroll (runs only — no payment-account data, spec §4) ----

externalApiRouter.get('/api/external/v1/hr/payroll', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'hr.payroll:read'))) return;
  const runs = await listRuns(apiKey.tenantId, prismaExternal);
  return respondPaginated(req, res, apiKey, runs);
});
