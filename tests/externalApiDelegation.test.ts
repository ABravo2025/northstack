import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Private API → the app's own routes (externalApiDelegation.ts, 2026-10-20): /api/external/v1/<x>
// runs the app's /api/<x> as the acting user, only for allowlisted routes, each behind a scope. The
// app routers involved are replaced by small fakes that echo who they ran as.

let caller: any;
const tagAssignments: Record<string, { tenantId: string; entityType: string }> = {
  ta_company: { tenantId: 't1', entityType: 'company' },
  ta_other_tenant: { tenantId: 't2', entityType: 'company' },
};

vi.mock('../src/lib/externalApiAuth.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, authenticateApiKey: vi.fn(async () => caller) };
});
vi.mock('../src/lib/rateLimit.js', () => ({ isRateLimited: vi.fn(async () => false) }));
vi.mock('../src/lib/prismaExternal.js', () => ({
  default: {
    apiRequestLog: { create: vi.fn(async () => ({})) },
    tagAssignment: { findUnique: vi.fn(async ({ where }: any) => tagAssignments[where.id] ?? null) },
  },
}));

async function echoRouter(routes: [string, string][]) {
  const { validateSession } = await import('../src/lib/httpAuth.js');
  const router = express.Router();
  const echo = async (req: express.Request, res: express.Response) => {
    const user = await validateSession(req, res);
    if (!user) return;
    res.json({ ranAs: user.id, path: req.path, query: req.query, method: req.method, body: req.body });
  };
  for (const [method, path] of routes) (router as any)[method](path, echo);
  return router;
}

vi.mock('../src/routes/projects.js', async () => ({
  projectsRouter: await echoRouter([['get', '/api/projects'], ['post', '/api/projects'], ['get', '/api/projects/:id']]),
}));
vi.mock('../src/routes/notifications.js', async () => ({
  notificationsRouter: await echoRouter([['get', '/api/notifications']]),
}));
vi.mock('../src/routes/tags.js', async () => ({
  tagsRouter: await echoRouter([['post', '/api/tags/:entityType/:entityId'], ['delete', '/api/tags/assignments/:id']]),
}));
vi.mock('../src/routes/timeOff.js', async () => ({
  timeOffRouter: await echoRouter([['get', '/api/time-off-policies'], ['post', '/api/time-off-policies']]),
}));
vi.mock('../src/routes/tasks.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, tasksRouter: await echoRouter([['get', '/api/tasks/mentionable-users']]) };
});

import { externalApiRouter } from '../src/routes/externalApi.js';
import { internalPathFor, findDelegatedRoute } from '../src/routes/externalApiDelegation.js';

function credential(kind: 'ai' | 'api_key', scopes: string[]) {
  return {
    kind, id: 'c1', name: 'Claude', tenantId: 't1', scopes, createdByUserId: 'u_ana', tenantPlan: 'growth', tenantStatus: 'active',
    actor: { id: 'u_ana', tenantId: 't1', status: 'active', tenant: { id: 't1', status: 'active', plan: 'growth' }, roleContext: { isOwner: false, permissions: new Set(), hiddenFieldsByEntity: new Map() } },
  };
}

let server: http.Server;
let base: string;
beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use(externalApiRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => server.close());

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api/external/v1${path}`, {
    method,
    headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('path mapping', () => {
  it('mirrors /api/external/v1/<x> to /api/<x>, keeping the /timesheets alias', () => {
    expect(internalPathFor('/api/external/v1/projects/p1')).toBe('/api/projects/p1');
    expect(internalPathFor('/api/external/v1/timesheets/approvals')).toBe('/api/shifts/timesheet/approvals');
    expect(internalPathFor('/api/projects')).toBeNull();
  });

  it('never matches a shift id against a reserved segment', () => {
    expect(findDelegatedRoute('PATCH', '/api/shifts/settings')).toBeUndefined();
    expect(findDelegatedRoute('PATCH', '/api/shifts/s1')?.draftOnlyForAi).toBe(true);
  });

  it('keeps configuration and money out', () => {
    expect(findDelegatedRoute('POST', '/api/roles')).toBeUndefined();
    expect(findDelegatedRoute('POST', '/api/pipelines')).toBeUndefined();
    expect(findDelegatedRoute('POST', '/api/hr/payroll/runs')).toBeUndefined();
    expect(findDelegatedRoute('POST', '/api/hr/employees/e1/termination')).toBeUndefined();
    expect(findDelegatedRoute('POST', '/api/field-catalog')).toBeUndefined();
    expect(findDelegatedRoute('POST', '/api/time-off/holidays')).toBeUndefined();
  });
});

describe('delegated routes through the Private API', () => {
  it("runs the app's route as the acting user with the query and body", async () => {
    caller = credential('ai', ['projects:read', 'projects:write']);
    const list = await call('GET', '/projects?status=active');
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ ranAs: 'u_ana', path: '/api/projects', query: { status: 'active' } });

    const created = await call('POST', '/projects', { name: 'Onboarding Acme' });
    expect(created.body).toMatchObject({ method: 'POST', body: { name: 'Onboarding Acme' } });
  });

  it('needs the matching scope', async () => {
    caller = credential('ai', ['projects:read']);
    const { status, body } = await call('POST', '/projects', { name: 'x' });
    expect(status).toBe(403);
    expect(body).toMatchObject({ code: 'missing_scope', required: 'projects:write' });
  });

  it('wins over a native route sharing the prefix (/tasks/mentionable-users vs /tasks/:id)', async () => {
    caller = credential('ai', ['workspace:read']);
    const { status, body } = await call('GET', '/tasks/mentionable-users');
    expect(status).toBe(200);
    expect(body.path).toBe('/api/tasks/mentionable-users');
  });

  it('keeps per-person inboxes away from company API keys', async () => {
    caller = credential('api_key', ['tasks:read']);
    expect((await call('GET', '/notifications')).status).toBe(403);
    caller = credential('ai', ['tasks:read']);
    expect((await call('GET', '/notifications')).status).toBe(200);
  });

  it("tags need the scope of the record they're on", async () => {
    caller = credential('ai', ['crm.contacts:write']);
    expect((await call('POST', '/tags/company/c1', { name: 'VIP' })).status).toBe(403);
    caller = credential('ai', ['crm.companies:write']);
    expect((await call('POST', '/tags/company/c1', { name: 'VIP' })).status).toBe(200);
    expect((await call('POST', '/tags/client/c1', { name: 'VIP' })).status).toBe(404);
  });

  it("removing a tag looks the assignment up, and another tenant's is a 404", async () => {
    caller = credential('ai', ['crm.companies:write']);
    expect((await call('DELETE', '/tags/assignments/ta_company')).status).toBe(200);
    expect((await call('DELETE', '/tags/assignments/ta_other_tenant')).status).toBe(404);
  });

  it('serves time-off policies (the gap that started this review)', async () => {
    caller = credential('ai', ['hr.timeoff:read', 'hr.timeoff:write']);
    expect((await call('GET', '/time-off-policies')).body.path).toBe('/api/time-off-policies');
    expect((await call('POST', '/time-off-policies', { name: 'Vacaciones', daysPerYear: 14 })).body.body).toMatchObject({ daysPerYear: 14 });
  });

  it('answers anything else under the API with a JSON 404', async () => {
    caller = credential('ai', ['projects:read']);
    const { status, body } = await call('GET', '/billing/plan');
    expect(status).toBe(404);
    expect(body.code).toBe('not_found');
  });
});
