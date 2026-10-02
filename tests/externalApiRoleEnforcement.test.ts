import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Router-level checks for spec-mcp-server.md §2b: an AI assistant token acts as one user, so the
// Private API applies that user's Employee scope, hidden fields and own-only Time Off — the same
// rules the app's own routes apply. The caller is injected (authenticateApiKey mocked); the
// services are mocked to fixed data so only the router's authorization logic is under test.

let caller: any;

vi.mock('../src/lib/externalApiAuth.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, authenticateApiKey: vi.fn(async () => caller) };
});
vi.mock('../src/lib/rateLimit.js', () => ({ isRateLimited: vi.fn(async () => false) }));
vi.mock('../src/lib/prismaExternal.js', () => ({ default: { apiRequestLog: { create: vi.fn(async () => ({})) } } }));

const EMPLOYEES = [
  { id: 'emp_self', tenantId: 't1', firstName: 'Ana', salaryNote: 'secret-a' },
  { id: 'emp_other', tenantId: 't1', firstName: 'Beto', salaryNote: 'secret-b' },
];

vi.mock('../src/modules/hr/employeeService.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    resolveVisibleEmployeeIds: vi.fn(async (_t: string, role: any) => (role.permissions.has('view_employee_scope:all') ? null : new Set(['emp_self']))),
    listEmployees: vi.fn(async (_t: string, visibleIds: Set<string> | null) => EMPLOYEES.filter((e) => !visibleIds || visibleIds.has(e.id))),
    findEmployeeById: vi.fn(async (id: string) => EMPLOYEES.find((e) => e.id === id) ?? null),
    findEmployeeByUserId: vi.fn(async (userId: string) => (userId === 'u_ana' ? EMPLOYEES[0] : null)),
  };
});

const createTimeOffRequest = vi.fn(async (input: any) => ({ success: true, request: { id: 'tor_new', ...input } }));
vi.mock('../src/modules/hr/timeOffRequestService.js', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    listAllTimeOffRequests: vi.fn(async () => [{ id: 'tor_a' }, { id: 'tor_b' }]),
    listMyTimeOffRequests: vi.fn(async (_t: string, employeeId: string) => [{ id: `tor_of_${employeeId}` }]),
    createTimeOffRequest: (input: any, ...rest: any[]) => createTimeOffRequest(input, ...rest),
    decideTimeOffRequest: vi.fn(async (id: string) => ({ success: true, request: { id, status: 'approved' } })),
  };
});

import { externalApiRouter } from '../src/routes/externalApi.js';

function role(permissions: string[], hidden: Record<string, string[]> = {}) {
  return {
    id: 'r1',
    name: 'Custom',
    isOwner: false,
    permissions: new Set(permissions),
    hiddenFieldsByEntity: new Map(Object.entries(hidden).map(([k, v]) => [k, new Set(v)])),
  };
}

function aiCaller(roleContext: any, scopes: string[]) {
  return {
    kind: 'ai', id: 'conn_1', name: 'Claude', tenantId: 't1', scopes, createdByUserId: 'u_ana',
    tenantPlan: 'growth', tenantStatus: 'active', actor: { id: 'u_ana', firstName: 'Ana', lastName: 'L', email: 'a@x', locale: 'es', roleContext },
  };
}

let server: http.Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(externalApiRouter);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(() => server.close());
beforeEach(() => createTimeOffRequest.mockClear());

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api/external/v1${path}`, {
    method,
    headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

describe('AI token — employees follow the user\'s Employee scope', () => {
  it('lists only employees in scope', async () => {
    caller = aiCaller(role(['view_employee', 'view_employee_scope:self']), ['hr.employees:read']);
    const { status, body } = await call('GET', '/hr/employees');
    expect(status).toBe(200);
    expect(body.data.map((e: any) => e.id)).toEqual(['emp_self']);
  });

  it('404s (never 403) an employee outside the scope', async () => {
    caller = aiCaller(role(['view_employee', 'view_employee_scope:self']), ['hr.employees:read']);
    expect((await call('GET', '/hr/employees/emp_other')).status).toBe(404);
    expect((await call('GET', '/hr/employees/emp_self')).status).toBe(200);
  });
});

describe('AI token — time off', () => {
  it('a regular user only sees their own requests', async () => {
    caller = aiCaller(role(['use_ai_assistants']), ['hr.timeoff:read', 'hr.timeoff:write']);
    const { body } = await call('GET', '/hr/timeoff');
    expect(body.data.map((r: any) => r.id)).toEqual(['tor_of_emp_self']);
  });

  it('an HR admin (manage_custom_fields) sees everyone\'s', async () => {
    caller = aiCaller(role(['manage_custom_fields']), ['hr.timeoff:read']);
    const { body } = await call('GET', '/hr/timeoff');
    expect(body.data.map((r: any) => r.id)).toEqual(['tor_a', 'tor_b']);
  });

  it('a regular user requests for themselves even without employeeId, and never for someone else', async () => {
    caller = aiCaller(role([]), ['hr.timeoff:write']);
    const own = await call('POST', '/hr/timeoff', { timeOffPolicyId: 'p1', startDate: '2026-11-02', endDate: '2026-11-03' });
    expect(own.status).toBe(201);
    expect(createTimeOffRequest.mock.calls[0][0].employeeId).toBe('emp_self');

    const other = await call('POST', '/hr/timeoff', { employeeId: 'emp_other', timeOffPolicyId: 'p1', startDate: '2026-11-02', endDate: '2026-11-03' });
    expect(other.status).toBe(404);
    expect(createTimeOffRequest).toHaveBeenCalledTimes(1);
  });

  it('deciding is allowed for an AI token but refused for an API key', async () => {
    caller = aiCaller(role([]), ['hr.timeoff:write']);
    expect((await call('PATCH', '/hr/timeoff/tor_a', { status: 'approved' })).status).toBe(200);

    caller = { ...aiCaller(role([]), ['hr.timeoff:write']), kind: 'api_key' };
    const res = await call('PATCH', '/hr/timeoff/tor_a', { status: 'approved' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('not_allowed_for_api_key');
  });
});

describe('suspended workspace', () => {
  it('allows reads but blocks writes', async () => {
    caller = { ...aiCaller(role([]), ['hr.timeoff:read', 'hr.timeoff:write']), tenantStatus: 'suspended' };
    expect((await call('GET', '/hr/timeoff')).status).toBe(200);
    const write = await call('POST', '/hr/timeoff', { timeOffPolicyId: 'p1', startDate: '2026-11-02', endDate: '2026-11-03' });
    expect(write.status).toBe(403);
    expect(write.body.code).toBe('tenant_suspended');
  });
});

describe('GET /me', () => {
  it('describes who the credential acts as and what it may call', async () => {
    caller = aiCaller(role(['use_ai_assistants']), ['tasks:read']);
    const { status, body } = await call('GET', '/me');
    expect(status).toBe(200);
    expect(body).toMatchObject({ credential: { kind: 'ai', name: 'Claude' }, user: { id: 'u_ana' }, scopes: ['tasks:read'] });
  });
});

describe('missing role permission', () => {
  it('403s with a role-oriented message for an AI token', async () => {
    caller = aiCaller(role([]), ['tasks:read']);
    const res = await call('GET', '/hr/payroll');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Your role');
  });
});
