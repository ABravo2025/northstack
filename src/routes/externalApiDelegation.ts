import type express from 'express';
import { getClientIp } from '../lib/httpAuth.js';
import { bestEffort } from '../lib/bestEffort.js';
import prismaExternal from '../lib/prismaExternal.js';
import { hasScope, type AuthenticatedApiKey } from '../lib/externalApiAuth.js';
import { getRequestContext, runWithRequestContext } from '../lib/requestContext.js';
import { findShiftById } from '../modules/shifts/shiftService.js';
import { shiftsRouter } from './shifts.js';
import { shiftRequestsRouter } from './shiftRequests.js';
import { timesheetsRouter } from './timesheets.js';
import { employeesRouter } from './employees.js';
import { catalogsRouter } from './catalogs.js';
import { timeOffRouter } from './timeOff.js';
import { timeOffRulesRouter } from './timeOffRules.js';
import { companiesRouter } from './companies.js';
import { contactsRouter } from './contacts.js';
import { opportunitiesRouter } from './opportunities.js';
import { tasksRouter } from './tasks.js';
import { taskFoldersRouter } from './taskFolders.js';
import { projectsRouter } from './projects.js';
import { clockRouter } from './clock.js';
import { clientReportsRouter } from './clientReports.js';
import { tagsRouter } from './tags.js';
import { notificationsRouter } from './notifications.js';
import { payrollRouter } from './payroll.js';
import { tenantsRouter } from './tenants.js';
import { rolesRouter } from './roles.js';
import { activityRouter } from './activity.js';

// Private API → the app's own routes (spec-mcp-server.md §10, widened 2026-10-20). An allowlisted
// request is handed to the app router that serves the same feature in the SPA, running AS the
// acting user (requestContext.actingUser, read by authenticateUser). That router already applies
// every permission, relationship rule (a project's members, a location's manager, a direct
// manager), plan limit and suspension check, so the API, the MCP and the app can't drift apart
// when a module changes — the reason the Private API had fallen behind the app before.
//
// External paths mirror the app's: /api/external/v1/<x> → /api/<x>. The one exception is the
// original /timesheets alias for /shifts/timesheet (2026-10-16), kept for existing integrations.
// Anything not listed here never reaches an app route: settings and configuration (roles, pipelines,
// catalogs, custom-field definitions, holidays, shift settings), money (payroll writes, terminations,
// payments, billing), credentials (API keys, 2FA) and imports/exports stay in the app.

type ScopeResolver = string | ((internalPath: string, apiKey: AuthenticatedApiKey) => Promise<string | null> | string | null);

interface DelegatedRoute {
  method: string;
  // The app route as written, e.g. /api/projects/:id — documentation (openapi.json) is built from it.
  source: string;
  pattern: RegExp;
  router: express.Router;
  // Scope this route needs; null from a resolver = the target doesn't exist (404).
  scope: ScopeResolver;
  // AI assistants may only touch DRAFT shifts through these: changing a published one notifies
  // people, which the dedicated publish/cancel routes do with their own confirmation step.
  draftOnlyForAi?: boolean;
  // Per-person inboxes (notifications): meaningless for a company API key.
  aiOnly?: boolean;
}

const RESERVED_SHIFT_SEGMENTS =
  'settings|locations|skills|templates|availability|publish|copy-week|suggestions|requests|available|mine|cost|timesheet|assignments|client-reports';
const SHIFT_ID = `(?!(?:${RESERVED_SHIFT_SEGMENTS})(?:/|$))[^/]+`;
const ID = '[^/]+';

function path(pattern: string): RegExp {
  return new RegExp(`^${pattern.replace(/:[a-zA-Z]+/g, (param) => (param === ':shiftId' ? SHIFT_ID : ID))}$`);
}

const SHIFTS = shiftsRouter as unknown as express.Router;
const r = (method: string, pattern: string, router: unknown, scope: ScopeResolver, extra: Partial<DelegatedRoute> = {}): DelegatedRoute => ({
  method,
  source: pattern,
  pattern: path(pattern),
  router: router as express.Router,
  scope,
  ...extra,
});

// Tags and custom-field values attach to several kinds of record: the scope follows the record.
const ENTITY_SCOPE_PREFIX: Record<string, string> = {
  employee: 'hr.employees',
  company: 'crm.companies',
  contact: 'crm.contacts',
  opportunity: 'crm.opportunities',
  project: 'projects',
};

function entityScope(entityType: string | undefined, access: 'read' | 'write'): string | null {
  const prefix = entityType ? ENTITY_SCOPE_PREFIX[entityType] : undefined;
  return prefix ? `${prefix}:${access}` : null;
}

const tagScopeFromPath = (access: 'read' | 'write') => (internalPath: string) => entityScope(internalPath.split('/')[3], access);

async function tagAssignmentScope(internalPath: string, apiKey: AuthenticatedApiKey): Promise<string | null> {
  const assignment = await prismaExternal.tagAssignment.findUnique({ where: { id: internalPath.split('/')[4] }, select: { tenantId: true, entityType: true } });
  if (!assignment || assignment.tenantId !== apiKey.tenantId) return null;
  return entityScope(assignment.entityType, 'write');
}

export const DELEGATED_ROUTES: DelegatedRoute[] = [
  // ---- Workspace: who's who and the catalogs ids come from (read-only) ----
  r('GET', '/api/tasks/mentionable-users', tasksRouter, 'workspace:read'),
  r('GET', '/api/hr/employees/directory', employeesRouter, 'workspace:read'),
  r('GET', '/api/hr/employees/birthdays', employeesRouter, 'workspace:read'),
  r('GET', '/api/field-catalog', catalogsRouter, 'workspace:read'),
  r('GET', '/api/status-definitions', catalogsRouter, 'workspace:read'),
  r('GET', '/api/hr/custom-fields', catalogsRouter, 'workspace:read'),
  r('GET', '/api/tenants/current', tenantsRouter, 'workspace:read'),
  r('GET', '/api/roles/assignable', rolesRouter, 'workspace:read'),
  r('GET', '/api/tags', tagsRouter, 'workspace:read'),

  // ---- Activity Log (the route applies the role's module visibility and plan retention) ----
  r('GET', '/api/activity', activityRouter, 'activity:read'),
  r('GET', '/api/activity/feed', activityRouter, 'activity:read'),

  // ---- The connected person's own notifications ----
  r('GET', '/api/notifications', notificationsRouter, 'tasks:read', { aiOnly: true }),
  r('GET', '/api/notifications/unread-count', notificationsRouter, 'tasks:read', { aiOnly: true }),
  r('PATCH', '/api/notifications/:id/read', notificationsRouter, 'tasks:read', { aiOnly: true }),
  r('POST', '/api/notifications/mark-all-read', notificationsRouter, 'tasks:read', { aiOnly: true }),

  // ---- Tasks: comments (@mentions), timer, folders ----
  r('GET', '/api/tasks/:id/comments', tasksRouter, 'tasks:read'),
  r('POST', '/api/tasks/:id/comments', tasksRouter, 'tasks:write'),
  r('DELETE', '/api/tasks/:id/comments/:commentId', tasksRouter, 'tasks:write'),
  r('POST', '/api/tasks/:id/timer', tasksRouter, 'tasks:write'),
  r('GET', '/api/task-folders', taskFoldersRouter, 'tasks:read'),
  r('POST', '/api/task-folders', taskFoldersRouter, 'tasks:write'),
  r('DELETE', '/api/task-folders/:id', taskFoldersRouter, 'tasks:write'),

  // ---- Tags on records ----
  r('GET', '/api/tags/:entityType/:entityId', tagsRouter, tagScopeFromPath('read')),
  r('POST', '/api/tags/:entityType/:entityId', tagsRouter, tagScopeFromPath('write')),
  r('DELETE', '/api/tags/assignments/:id', tagsRouter, tagAssignmentScope),

  // ---- Employees: custom-field values, invitation, contract e-mail ----
  r('GET', '/api/hr/employees/:id/custom-fields', employeesRouter, 'hr.employees:read'),
  r('POST', '/api/hr/employees/:id/custom-fields', employeesRouter, 'hr.employees:write'),
  r('PATCH', '/api/hr/employees/:id/custom-fields/:valueId', employeesRouter, 'hr.employees:write'),
  r('DELETE', '/api/hr/employees/:id/custom-fields/:valueId', employeesRouter, 'hr.employees:write'),
  r('POST', '/api/hr/employees/:id/invite', employeesRouter, 'hr.employees:write'),
  r('POST', '/api/hr/employees/:id/resend-contract', employeesRouter, 'hr.employees:write'),

  // ---- Time off: policies, assignments, balances, ledger, adjustments, holidays ----
  r('GET', '/api/time-off-policies', timeOffRouter, 'hr.timeoff:read'),
  r('POST', '/api/time-off-policies', timeOffRouter, 'hr.timeoff:write'),
  r('PATCH', '/api/time-off-policies/:id', timeOffRouter, 'hr.timeoff:write'),
  r('GET', '/api/hr/time-off-requests', timeOffRouter, 'hr.timeoff:read'),
  r('DELETE', '/api/hr/time-off-requests/:id', timeOffRouter, 'hr.timeoff:write'),
  r('GET', '/api/hr/time-off-balances', timeOffRouter, 'hr.timeoff:read'),
  r('GET', '/api/hr/employees/:id/time-off-policies', employeesRouter, 'hr.timeoff:read'),
  r('POST', '/api/hr/employees/:id/time-off-policies', employeesRouter, 'hr.timeoff:write'),
  r('DELETE', '/api/hr/employees/:id/time-off-policies/:policyId', employeesRouter, 'hr.timeoff:write'),
  r('GET', '/api/hr/employees/:id/time-off-balance', employeesRouter, 'hr.timeoff:read'),
  r('GET', '/api/hr/employees/:id/time-off-ledger', timeOffRulesRouter, 'hr.timeoff:read'),
  r('POST', '/api/hr/employees/:id/time-off-adjustments', timeOffRulesRouter, 'hr.timeoff:write'),
  r('GET', '/api/hr/employees/:id/religious-holidays', timeOffRulesRouter, 'hr.timeoff:read'),
  r('PUT', '/api/hr/employees/:id/religious-holidays', timeOffRulesRouter, 'hr.timeoff:write'),
  r('POST', '/api/hr/time-off-requests/preview', timeOffRulesRouter, 'hr.timeoff:read'),
  r('GET', '/api/time-off/settings', timeOffRulesRouter, 'hr.timeoff:read'),
  r('GET', '/api/time-off/holidays', timeOffRulesRouter, 'hr.timeoff:read'),
  r('GET', '/api/time-off/religions', timeOffRulesRouter, 'hr.timeoff:read'),
  r('GET', '/api/time-off/my-religious-holidays', timeOffRulesRouter, 'hr.timeoff:read'),
  r('PUT', '/api/time-off/my-religious-holidays', timeOffRulesRouter, 'hr.timeoff:write'),

  // ---- Payroll: read-only (spec decision #5) — no payment-account data leaves these ----
  r('GET', '/api/hr/pay-frequencies', payrollRouter, 'hr.payroll:read'),
  r('GET', '/api/hr/payment-methods', payrollRouter, 'hr.payroll:read'),
  r('GET', '/api/hr/payroll/compensation/status', payrollRouter, 'hr.payroll:read'),
  r('GET', '/api/hr/payroll/off-payments', payrollRouter, 'hr.payroll:read'),
  r('GET', '/api/hr/employees/:id/compensation', employeesRouter, 'hr.payroll:read'),
  r('GET', '/api/hr/employees/:id/payment-history', employeesRouter, 'hr.payroll:read'),

  // ---- CRM: custom-field values, opportunity contacts and stage history ----
  r('GET', '/api/companies/:id/custom-fields', companiesRouter, 'crm.companies:read'),
  r('POST', '/api/companies/:id/custom-fields', companiesRouter, 'crm.companies:write'),
  r('PATCH', '/api/companies/:id/custom-fields/:valueId', companiesRouter, 'crm.companies:write'),
  r('DELETE', '/api/companies/:id/custom-fields/:valueId', companiesRouter, 'crm.companies:write'),
  r('GET', '/api/contacts/:id/custom-fields', contactsRouter, 'crm.contacts:read'),
  r('POST', '/api/contacts/:id/custom-fields', contactsRouter, 'crm.contacts:write'),
  r('PATCH', '/api/contacts/:id/custom-fields/:valueId', contactsRouter, 'crm.contacts:write'),
  r('DELETE', '/api/contacts/:id/custom-fields/:valueId', contactsRouter, 'crm.contacts:write'),
  r('POST', '/api/opportunities/:id/contacts', opportunitiesRouter, 'crm.opportunities:write'),
  r('DELETE', '/api/opportunities/:id/contacts/:contactId', opportunitiesRouter, 'crm.opportunities:write'),
  r('GET', '/api/opportunities/:id/stage-history', opportunitiesRouter, 'crm.opportunities:read'),

  // ---- Projects (whole module; the routes apply membership/owner rules and the plan's limits) ----
  r('GET', '/api/projects', projectsRouter, 'projects:read'),
  r('GET', '/api/projects/options', projectsRouter, 'projects:read'),
  r('POST', '/api/projects', projectsRouter, 'projects:write'),
  r('POST', '/api/projects/from-template', projectsRouter, 'projects:write'),
  r('GET', '/api/projects/:id', projectsRouter, 'projects:read'),
  r('PATCH', '/api/projects/:id', projectsRouter, 'projects:write'),
  r('POST', '/api/projects/:id/phases', projectsRouter, 'projects:write'),
  r('PUT', '/api/projects/:id/phases/order', projectsRouter, 'projects:write'),
  r('PATCH', '/api/projects/:id/phases/:phaseId', projectsRouter, 'projects:write'),
  r('DELETE', '/api/projects/:id/phases/:phaseId', projectsRouter, 'projects:write'),
  r('POST', '/api/projects/:id/members', projectsRouter, 'projects:write'),
  r('PATCH', '/api/projects/:id/members/:memberId', projectsRouter, 'projects:write'),
  r('DELETE', '/api/projects/:id/members/:memberId', projectsRouter, 'projects:write'),
  r('POST', '/api/projects/:id/save-as-template', projectsRouter, 'projects:write'),
  r('GET', '/api/project-templates', projectsRouter, 'projects:read'),
  r('GET', '/api/project-templates/:id', projectsRouter, 'projects:read'),

  // ---- Shifts ----
  r('GET', '/api/shifts', SHIFTS, 'shifts:read'),
  r('GET', '/api/shifts/mine', SHIFTS, 'shifts:read'),
  r('GET', '/api/shifts/locations', SHIFTS, 'shifts:read'),
  r('GET', '/api/shifts/availability', SHIFTS, 'shifts:read'),
  r('GET', '/api/shifts/cost', SHIFTS, 'shifts:read'),
  r('GET', '/api/shifts/skills', SHIFTS, 'shifts:read'),
  r('GET', '/api/shifts/templates', SHIFTS, 'shifts:read'),
  r('GET', '/api/shifts/:shiftId/candidates', SHIFTS, 'shifts:read'),
  r('POST', '/api/shifts', SHIFTS, 'shifts:write'),
  r('PATCH', '/api/shifts/:shiftId', SHIFTS, 'shifts:write', { draftOnlyForAi: true }),
  r('DELETE', '/api/shifts/:shiftId', SHIFTS, 'shifts:write', { draftOnlyForAi: true }),
  r('POST', '/api/shifts/:shiftId/assignments', SHIFTS, 'shifts:write', { draftOnlyForAi: true }),
  r('DELETE', '/api/shifts/:shiftId/assignments/:id', SHIFTS, 'shifts:write', { draftOnlyForAi: true }),
  r('POST', '/api/shifts/assignments/:id/respond', SHIFTS, 'shifts:write'),
  r('POST', '/api/shifts/availability', SHIFTS, 'shifts:write'),
  r('DELETE', '/api/shifts/availability/:id', SHIFTS, 'shifts:write'),
  // Notify people (approved 2026-10-20: "avisos a terceros") — the MCP confirms them first.
  r('POST', '/api/shifts/publish', SHIFTS, 'shifts:write'),
  r('POST', '/api/shifts/:shiftId/cancel', SHIFTS, 'shifts:write'),
  r('POST', '/api/shifts/copy-week', SHIFTS, 'shifts:write'),
  // Open shifts, giving away and swapping (the person's own; managers decide)
  r('GET', '/api/shifts/available', shiftRequestsRouter, 'shifts:read'),
  r('GET', '/api/shifts/requests', shiftRequestsRouter, 'shifts:read'),
  r('GET', '/api/shifts/assignments/:id/swap-targets', shiftRequestsRouter, 'shifts:read'),
  r('POST', '/api/shifts/:shiftId/open', shiftRequestsRouter, 'shifts:write'),
  r('POST', '/api/shifts/:shiftId/claim', shiftRequestsRouter, 'shifts:write'),
  r('POST', '/api/shifts/assignments/:id/give', shiftRequestsRouter, 'shifts:write'),
  r('POST', '/api/shifts/assignments/:id/swap', shiftRequestsRouter, 'shifts:write'),
  r('POST', '/api/shifts/requests/:id/take', shiftRequestsRouter, 'shifts:write'),
  r('POST', '/api/shifts/requests/:id/answer', shiftRequestsRouter, 'shifts:write'),
  r('POST', '/api/shifts/requests/:id/decide', shiftRequestsRouter, 'shifts:write'),
  r('POST', '/api/shifts/requests/:id/cancel', shiftRequestsRouter, 'shifts:write'),

  // ---- Timesheets ----
  r('GET', '/api/shifts/timesheet', timesheetsRouter, 'timesheets:read'),
  r('GET', '/api/shifts/timesheet/approvals', timesheetsRouter, 'timesheets:read'),
  r('GET', '/api/shifts/timesheet/reports', timesheetsRouter, 'timesheets:read'),
  r('POST', '/api/shifts/timesheet/entries', timesheetsRouter, 'timesheets:write'),
  r('PATCH', '/api/shifts/timesheet/entries/:id', timesheetsRouter, 'timesheets:write'),
  r('DELETE', '/api/shifts/timesheet/entries/:id', timesheetsRouter, 'timesheets:write'),
  r('POST', '/api/shifts/timesheet/submit', timesheetsRouter, 'timesheets:write'),
  r('POST', '/api/shifts/timesheet/suggestions/dismiss', timesheetsRouter, 'timesheets:write'),
  r('POST', '/api/shifts/timesheet/suggestions/restore', timesheetsRouter, 'timesheets:write'),
  r('POST', '/api/shifts/timesheet/:id/decision', timesheetsRouter, 'timesheets:write'),
  r('POST', '/api/shifts/timesheet/:id/reopen', timesheetsRouter, 'timesheets:write'),
  r('POST', '/api/shifts/timesheet/:id/adjustments', timesheetsRouter, 'timesheets:write'),

  // ---- Client hour reports (the e-mail variant reaches a client; the MCP confirms it first) ----
  r('GET', '/api/shifts/client-reports/defaults', clientReportsRouter, 'timesheets:read'),
  r('POST', '/api/shifts/client-reports', clientReportsRouter, 'timesheets:write'),

  // ---- Clock in/out (approved 2026-10-20). The routes act on the person's OWN employee record;
  // the board and corrections are for whoever manages the location. ----
  r('GET', '/api/clock/me', clockRouter, 'clock:read'),
  r('GET', '/api/clock/board', clockRouter, 'clock:read'),
  r('GET', '/api/clock/entries/:id/corrections', clockRouter, 'clock:read'),
  r('POST', '/api/clock/in', clockRouter, 'clock:write'),
  r('POST', '/api/clock/out', clockRouter, 'clock:write'),
  r('POST', '/api/clock/break/:action', clockRouter, 'clock:write'),
  r('PATCH', '/api/clock/entries/:id', clockRouter, 'clock:write'),
];

// /api/external/v1/<x> → /api/<x>; /api/external/v1/timesheets/... → /api/shifts/timesheet/...
export function internalPathFor(externalPath: string): string | null {
  const prefix = '/api/external/v1';
  if (!externalPath.startsWith(`${prefix}/`)) return null;
  const rest = externalPath.slice(prefix.length);
  if (rest === '/timesheets' || rest.startsWith('/timesheets/')) return `/api/shifts/timesheet${rest.slice('/timesheets'.length)}`;
  return `/api${rest}`;
}

export function findDelegatedRoute(method: string, internalPath: string): DelegatedRoute | undefined {
  return DELEGATED_ROUTES.find((route) => route.method === method && route.pattern.test(internalPath));
}

// loggedPath: the EXTERNAL path the caller used — req.path is rewritten to the app route while it runs.
async function logRequest(req: express.Request, apiKey: AuthenticatedApiKey, statusCode: number, loggedPath = req.path): Promise<void> {
  await bestEffort(
    prismaExternal.apiRequestLog.create({
      data: {
        tenantId: apiKey.tenantId,
        apiKeyId: apiKey.kind === 'api_key' ? apiKey.id : null,
        aiConnectionId: apiKey.kind === 'ai' ? apiKey.id : null,
        method: req.method,
        path: loggedPath,
        statusCode,
        ipAddress: getClientIp(req),
      },
    }),
    `Failed to write ApiRequestLog for ${req.method} ${loggedPath}`,
  );
}

async function sendLogged(req: express.Request, res: express.Response, apiKey: AuthenticatedApiKey, status: number, body: unknown): Promise<void> {
  await logRequest(req, apiKey, status);
  res.status(status).json(body);
}

function runRouter(router: express.Router, req: express.Request, res: express.Response): Promise<boolean> {
  return new Promise((resolve, reject) => {
    res.once('finish', () => resolve(true));
    router(req, res, (err?: unknown) => (err ? reject(err) : resolve(false)));
  });
}

// Registered right after the Private API's auth middleware, before its own handlers: a request
// that matches the allowlist is served here; anything else falls through to them (next()). That
// order also settles the few shared prefixes, e.g. /tasks/mentionable-users vs. /tasks/:id.
export async function delegateToAppRoutes(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
  try {
    const apiKey = (req as unknown as { apiKey?: AuthenticatedApiKey }).apiKey;
    const internalPath = apiKey ? internalPathFor(req.path) : null;
    const route = internalPath ? findDelegatedRoute(req.method, internalPath) : undefined;
    if (!apiKey || !internalPath || !route) {
      next();
      return;
    }

    if (route.aiOnly && apiKey.kind !== 'ai') {
      return sendLogged(req, res, apiKey, 403, { error: 'Only available to an AI assistant acting as a person.', code: 'not_allowed_for_api_key' });
    }
    const scope = typeof route.scope === 'string' ? route.scope : await route.scope(internalPath, apiKey);
    if (scope === null) return sendLogged(req, res, apiKey, 404, { error: 'Not found', code: 'not_found' });
    if (!hasScope(apiKey, scope)) {
      return sendLogged(req, res, apiKey, 403, {
        error: apiKey.kind === 'ai' ? `Your role in this workspace doesn't allow this action (${scope}).` : `This API key is missing the required scope: ${scope}`,
        code: 'missing_scope',
        required: scope,
      });
    }

    if (route.draftOnlyForAi && apiKey.kind === 'ai') {
      const shift = await findShiftById(internalPath.split('/')[3]);
      if (!shift || shift.tenantId !== apiKey.tenantId) return sendLogged(req, res, apiKey, 404, { error: 'Not found', code: 'not_found' });
      if (shift.status !== 'draft') {
        return sendLogged(req, res, apiKey, 409, {
          error: 'An AI assistant can only edit draft shifts. To change a published shift, cancel it (cancel_shift) or change it in the app.',
          code: 'published_shift',
        });
      }
    }

    // The request log is written before the response leaves, same rule as externalApi.ts's
    // respond(): hold the real end() until the row is saved, since Vercel may freeze the function
    // right after.
    const externalPath = req.path;
    const originalEnd = res.end.bind(res) as (...args: unknown[]) => express.Response;
    (res as unknown as { end: (...args: unknown[]) => express.Response }).end = (...args: unknown[]) => {
      void logRequest(req, apiKey, res.statusCode, externalPath).finally(() => originalEnd(...args));
      return res;
    };

    const originalUrl = req.url;
    const query = originalUrl.includes('?') ? originalUrl.slice(originalUrl.indexOf('?')) : '';
    req.url = `${internalPath}${query}`;
    const context = getRequestContext();
    try {
      await runWithRequestContext(
        { source: context?.source ?? 'api', sourceClientName: context?.sourceClientName ?? apiKey.name, actingUser: apiKey.actor },
        async () => {
          if (!(await runRouter(route.router, req, res)) && !res.headersSent) {
            res.status(404).json({ error: 'Not found', code: 'not_found' });
          }
        },
      );
    } finally {
      req.url = originalUrl;
    }
  } catch (err) {
    console.error('Private API delegation failed:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'internal_error' });
  }
}
