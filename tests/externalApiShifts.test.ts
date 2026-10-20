import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Private API → app Shifts/Timesheet routers (spec-mcp-server.md §10): only allowlisted routes get
// through, they run AS the acting user (validateSession sees requestContext.actingUser), and an AI
// assistant can only touch draft shifts. The app's routers are replaced by small fakes that echo
// who they ran as.

let caller: any;
const shifts: Record<string, any> = { s_draft: { id: 's_draft', tenantId: 't1', status: 'draft' }, s_pub: { id: 's_pub', tenantId: 't1', status: 'published' } };

vi.mock('../src/lib/externalApiAuth.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, authenticateApiKey: vi.fn(async () => caller) };
});
vi.mock('../src/lib/rateLimit.js', () => ({ isRateLimited: vi.fn(async () => false) }));
vi.mock('../src/lib/prismaExternal.js', () => ({ default: { apiRequestLog: { create: vi.fn(async () => ({})) } } }));
vi.mock('../src/modules/shifts/shiftService.js', () => ({ findShiftById: vi.fn(async (id: string) => shifts[id] ?? null) }));

async function fakeRouter() {
  const { validateSession } = await import('../src/lib/httpAuth.js');
  const router = express.Router();
  const echo = async (req: express.Request, res: express.Response) => {
    const user = await validateSession(req, res);
    if (!user) return;
    res.json({ ranAs: user.id, path: req.path, query: req.query, method: req.method });
  };
  router.get('/api/shifts', echo);
  router.patch('/api/shifts/:id', echo);
  router.patch('/api/shifts/settings', echo);
  router.post('/api/shifts/publish', echo);
  router.get('/api/shifts/timesheet/approvals', echo);
  return router;
}

vi.mock('../src/routes/shifts.js', async () => ({ shiftsRouter: await fakeRouter() }));
vi.mock('../src/routes/shiftRequests.js', () => ({ shiftRequestsRouter: express.Router() }));
vi.mock('../src/routes/timesheets.js', async () => ({ timesheetsRouter: await fakeRouter() }));

import { externalApiRouter } from '../src/routes/externalApi.js';

function aiCaller(scopes: string[]) {
  return {
    kind: 'ai', id: 'conn_1', name: 'Claude', tenantId: 't1', scopes, createdByUserId: 'u_ana', tenantPlan: 'growth', tenantStatus: 'active',
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

describe('Shifts & Timesheets through the Private API', () => {
  it("runs the app's own route as the acting user, keeping the query", async () => {
    caller = aiCaller(['shifts:read']);
    const { status, body } = await call('GET', '/shifts?from=2026-10-19&to=2026-10-25');
    expect(status).toBe(200);
    expect(body).toMatchObject({ ranAs: 'u_ana', path: '/api/shifts', query: { from: '2026-10-19', to: '2026-10-25' } });
  });

  it('maps /timesheets/* to the app timesheet routes', async () => {
    caller = aiCaller(['timesheets:read']);
    const { body } = await call('GET', '/timesheets/approvals');
    expect(body).toMatchObject({ ranAs: 'u_ana', path: '/api/shifts/timesheet/approvals' });
  });

  it('refuses anything off the allowlist (shift settings)', async () => {
    caller = aiCaller(['shifts:read', 'shifts:write']);
    const settings = await call('PATCH', '/shifts/settings', { x: 1 });
    expect(settings.status).toBe(404);
    expect(settings.body.code).toBe('not_found');
  });

  it('lets publishing a week through since 2026-10-20 (the MCP confirms it first)', async () => {
    caller = aiCaller(['shifts:write']);
    const { status, body } = await call('POST', '/shifts/publish', { shiftIds: ['s_draft'] });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ranAs: 'u_ana', path: '/api/shifts/publish' });
  });

  it('needs the matching scope', async () => {
    caller = aiCaller(['shifts:read']);
    expect((await call('PATCH', '/shifts/s_draft', { notes: 'x' })).status).toBe(403);
  });

  it('lets an AI assistant change a draft shift but not a published one', async () => {
    caller = aiCaller(['shifts:write']);
    const draft = await call('PATCH', '/shifts/s_draft', { notes: 'x' });
    expect(draft.status).toBe(200);
    expect(draft.body.ranAs).toBe('u_ana');

    const published = await call('PATCH', '/shifts/s_pub', { notes: 'x' });
    expect(published.status).toBe(409);
    expect(published.body.code).toBe('published_shift');
  });
});
