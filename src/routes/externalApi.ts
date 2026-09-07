import type express from 'express';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { getClientIp } from '../lib/httpAuth.js';
import { bestEffort } from '../lib/bestEffort.js';
import { isRateLimited } from '../lib/rateLimit.js';
import prismaExternal from '../lib/prismaExternal.js';
import { authenticateApiKey, hasScope, type AuthenticatedApiKey } from '../lib/externalApiAuth.js';
import { listAllTasksForTenant, findTaskById } from '../modules/tasks/taskService.js';
import { listAllNotesForTenant, findNoteById } from '../modules/notes/noteService.js';
import { listCompanies, findCompanyById } from '../modules/crm/companyService.js';
import { listContacts, findContactById } from '../modules/crm/contactService.js';
import { listOpportunities, findOpportunityById } from '../modules/crm/opportunityService.js';
import { listPipelines } from '../modules/crm/pipelineService.js';
import { listEmployees, findEmployeeById } from '../modules/hr/employeeService.js';
import { listAllTimeOffRequests } from '../modules/hr/timeOffRequestService.js';
import { listRuns } from '../modules/hr/payrollRunService.js';

// Private API (spec-private-api-webhooks.md, Unit 2) — read endpoints under /api/external/v1/*.
// This router wraps the already-existing internal services (same principle the rest of the app
// follows: thin routes, logic in src/modules/*/*.ts) rather than reimplementing them; the real
// difference from /api/* for the same resource is the auth layer (ApiKey+scope vs. Session+role)
// and the error shape (stable {error, code} JSON, not a message meant for a form in the SPA).

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

    if (isRateLimited(`apikey:${apiKey.id}`, RATE_LIMIT)) {
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

// Every findXById below follows the app-wide "unscoped global lookup, then verify tenantId"
// convention documented in lib/prisma.ts's header comment (pattern 2) — the id is already
// globally unique, so the tenant check happens here rather than in the query itself.
function notFound(req: express.Request, res: express.Response, apiKey: AuthenticatedApiKey) {
  return respond(req, res, apiKey, 404, { error: 'Not found', code: 'not_found' });
}

// ---- Tasks ----

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

// ---- HR: Time Off ----

externalApiRouter.get('/api/external/v1/hr/timeoff', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'hr.timeoff:read'))) return;
  const requests = await listAllTimeOffRequests(apiKey.tenantId, prismaExternal);
  return respondPaginated(req, res, apiKey, requests);
});

// ---- HR: Payroll (runs only — no payment-account data, spec §4) ----

externalApiRouter.get('/api/external/v1/hr/payroll', async (req, res) => {
  const { apiKey } = req as unknown as ExternalApiRequest;
  if (!(await requireScopeLogged(req, res, apiKey, 'hr.payroll:read'))) return;
  const runs = await listRuns(apiKey.tenantId, prismaExternal);
  return respondPaginated(req, res, apiKey, runs);
});
