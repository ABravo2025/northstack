import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { handleMcpRequest } from '../src/modules/integrations/mcp/server.js';

// The tools added in the 2026-10-20 Private API ↔ app parity review, over the real protocol: each
// one must hit the right Private API path with the right body, and everything that notifies other
// people or can't be undone must stop at a confirmation first. The fake API answers every path.

const TOKEN = 'nk_mcp_good';
const calls: { method: string; path: string; query: Record<string, unknown>; body: unknown }[] = [];

const fakeApi = express();
fakeApi.use(express.json());
fakeApi.use('/api/external/v1', (req, res) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) {
    res.status(401).json({ error: 'bad token' });
    return;
  }
  if (req.path === '/me') {
    res.json({ user: { id: 'u1', employeeId: 'e_me' }, scopes: [] });
    return;
  }
  calls.push({ method: req.method, path: req.path, query: req.query, body: req.body });
  const fixtures: Record<string, unknown> = {
    '/hr/employees/e1': { id: 'e1', firstName: 'Nicolás', lastName: 'Paz', email: 'nico@acme.test' },
    '/hr/employees/e1/time-off-policies': [{ timeOffPolicyId: 'pol1', timeOffPolicy: { id: 'pol1', name: 'Vacaciones Anuales AR' } }],
    '/hr/employees/e1/custom-fields': [{ id: 'v1', customFieldDefinitionId: 'def_existing', value: 'old' }],
    '/time-off-policies': [{ id: 'pol1', name: 'Vacaciones Anuales AR' }],
    '/roles/invitable': [
      { id: 'role_member', name: 'Member', aiCanInvite: true },
      { id: 'role_sales', name: 'Sales', aiCanInvite: true },
      { id: 'role_admin', name: 'Admin', aiCanInvite: false },
    ],
  };
  if (req.method === 'DELETE') {
    res.status(204).end();
    return;
  }
  res.status(req.method === 'POST' ? 201 : 200).json(fixtures[req.path] ?? { ok: true, path: req.path });
});

let apiServer: http.Server;
let mcpServer: http.Server;
let mcpUrl: URL;

beforeAll(async () => {
  apiServer = fakeApi.listen(0);
  process.env.PRIVATE_API_BASE_URL = `http://127.0.0.1:${(apiServer.address() as any).port}`;
  mcpServer = http.createServer((req, res) => void handleMcpRequest(req, res));
  await new Promise<void>((resolve) => mcpServer.listen(0, resolve));
  mcpUrl = new URL(`http://127.0.0.1:${(mcpServer.address() as any).port}/mcp`);
});

afterAll(() => {
  apiServer.close();
  mcpServer.close();
  delete process.env.PRIVATE_API_BASE_URL;
});

beforeEach(() => {
  calls.length = 0;
});

async function withClient(run: (client: Client) => Promise<void>): Promise<void> {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(mcpUrl, { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } }));
  try {
    await run(client);
  } finally {
    await client.close();
  }
}

const text = (result: any): string => result.content.map((c: any) => c.text).join('\n');
const tokenOf = (result: any) => /confirmationToken: "([^"]+)"/.exec(text(result))?.[1];
const writes = () => calls.filter((c) => c.method !== 'GET');

describe('the case that started the review (Nicolás Paz)', () => {
  it('update_employee sends the contract fields', async () => {
    await withClient(async (client) => {
      await client.callTool({ name: 'update_employee', arguments: { id: 'e1', contractType: 'full_time', contractUrl: 'https://drive.example/contract.pdf', endDate: null } });
      expect(calls[0]).toMatchObject({ method: 'PATCH', path: '/hr/employees/e1', body: { contractType: 'full_time', contractUrl: 'https://drive.example/contract.pdf', endDate: null } });
    });
  });

  it('creates a time-off policy and assigns it', async () => {
    await withClient(async (client) => {
      await client.callTool({ name: 'create_time_off_policy', arguments: { name: 'Vacaciones Anuales AR', daysPerYear: 14, dayCount: 'calendar', accrualMethod: 'monthly' } });
      await client.callTool({ name: 'assign_time_off_policy', arguments: { employeeId: 'e1', timeOffPolicyId: 'pol1' } });
      expect(writes()).toEqual([
        expect.objectContaining({ method: 'POST', path: '/time-off-policies', body: { name: 'Vacaciones Anuales AR', daysPerYear: 14, dayCount: 'calendar', accrualMethod: 'monthly' } }),
        expect.objectContaining({ method: 'POST', path: '/hr/employees/e1/time-off-policies', body: { timeOffPolicyId: 'pol1' } }),
      ]);
    });
  });
});

describe('ids the model needs', () => {
  it('list_users and list_catalogs reach the app lists', async () => {
    await withClient(async (client) => {
      await client.callTool({ name: 'list_users', arguments: {} });
      await client.callTool({ name: 'list_catalogs', arguments: { kind: 'departments' } });
      await client.callTool({ name: 'list_catalogs', arguments: { kind: 'employee_statuses' } });
      await client.callTool({ name: 'list_catalogs', arguments: { kind: 'custom_fields', entityType: 'company' } });
      expect(calls.map((c) => [c.path, c.query])).toEqual([
        ['/tasks/mentionable-users', {}],
        ['/field-catalog', { kind: 'department' }],
        ['/status-definitions', { entityType: 'employee' }],
        ['/hr/custom-fields', { entityType: 'company' }],
      ]);
    });
  });

  it('time_off_balance defaults to your own employee record (from /me)', async () => {
    await withClient(async (client) => {
      await client.callTool({ name: 'time_off_balance', arguments: {} });
      expect(calls[0].path).toBe('/hr/employees/e_me/time-off-balance');
    });
  });
});

describe('set_custom_field', () => {
  it('replaces an existing value, creates a new one, and clears with null', async () => {
    await withClient(async (client) => {
      await client.callTool({ name: 'set_custom_field', arguments: { entityType: 'employee', entityId: 'e1', definitionId: 'def_existing', value: 'new' } });
      await client.callTool({ name: 'set_custom_field', arguments: { entityType: 'employee', entityId: 'e1', definitionId: 'def_new', value: 3 } });
      await client.callTool({ name: 'set_custom_field', arguments: { entityType: 'employee', entityId: 'e1', definitionId: 'def_existing', value: null } });
      expect(writes().map((c) => [c.method, c.path, c.body])).toEqual([
        ['PATCH', '/hr/employees/e1/custom-fields/v1', { value: 'new' }],
        ['POST', '/hr/employees/e1/custom-fields', { customFieldDefinitionId: 'def_new', value: 3 }],
        ['DELETE', '/hr/employees/e1/custom-fields/v1', {}],
      ]);
    });
  });
});

describe('confirmation before notifying people or changing balances', () => {
  const cases: [string, Record<string, unknown>, string, string][] = [
    ['invite_employee', { employeeId: 'e1', roleId: 'role_sales' }, 'POST', '/hr/employees/e1/invite'],
    ['publish_shifts', { shiftIds: ['s2', 's1'] }, 'POST', '/shifts/publish'],
    ['adjust_time_off_balance', { employeeId: 'e1', timeOffPolicyId: 'pol1', days: -1.5, reason: 'Correction' }, 'POST', '/hr/employees/e1/time-off-adjustments'],
    ['unassign_time_off_policy', { employeeId: 'e1', timeOffPolicyId: 'pol1' }, 'DELETE', '/hr/employees/e1/time-off-policies/pol1'],
    ['send_client_report', { companyId: 'c1', from: '2026-10-01', to: '2026-10-15', email: 'client@acme.test' }, 'POST', '/shifts/client-reports'],
  ];

  for (const [name, args, method, path] of cases) {
    it(`${name}: nothing happens until confirmed`, async () => {
      await withClient(async (client) => {
        const first = await client.callTool({ name, arguments: args });
        expect(text(first)).toContain('CONFIRMATION REQUIRED');
        expect(writes()).toEqual([]);

        const second = await client.callTool({ name, arguments: { ...args, confirmationToken: tokenOf(first) } });
        expect((second as any).isError).toBeFalsy();
        expect(writes().map((c) => [c.method, c.path])).toEqual([[method, path]]);
      });
    });
  }

  it("the invitation summary names the e-mail and the role it grants", async () => {
    await withClient(async (client) => {
      const first = await client.callTool({ name: 'invite_employee', arguments: { employeeId: 'e1', roleId: 'role_sales' } });
      expect(text(first)).toContain('nico@acme.test');
      expect(text(first)).toContain('"Sales"');
    });
  });

  it('a confirmation for one role cannot be reused for another', async () => {
    await withClient(async (client) => {
      const first = await client.callTool({ name: 'invite_employee', arguments: { employeeId: 'e1' } });
      const other: any = await client.callTool({ name: 'invite_employee', arguments: { employeeId: 'e1', roleId: 'role_sales', confirmationToken: tokenOf(first) } });
      expect(other.isError).toBe(true);
      expect(writes()).toEqual([]);
    });
  });

  it('refuses a sensitive role (Admin, salaries, payments) before asking to confirm', async () => {
    await withClient(async (client) => {
      const result: any = await client.callTool({ name: 'invite_employee', arguments: { employeeId: 'e1', roleId: 'role_admin' } });
      expect(result.isError).toBe(true);
      expect(text(result)).not.toContain('CONFIRMATION REQUIRED');
      expect(text(result)).toContain('Invite from the app');
      expect(writes()).toEqual([]);
    });
  });

  it('a client report without e-mail just creates the link, no confirmation', async () => {
    await withClient(async (client) => {
      await client.callTool({ name: 'send_client_report', arguments: { companyId: 'c1', from: '2026-10-01', to: '2026-10-15' } });
      expect(writes().map((c) => c.path)).toEqual(['/shifts/client-reports']);
    });
  });
});

describe('projects, tasks and clock', () => {
  it('create_project uses the template route when a templateId is given', async () => {
    await withClient(async (client) => {
      await client.callTool({ name: 'create_project', arguments: { name: 'Onboarding', ownerEmployeeId: 'e1', templateId: 'tpl1' } });
      await client.callTool({ name: 'update_project', arguments: { id: 'p1', budgetHours: 1.5 } });
      expect(writes().map((c) => [c.path, c.body])).toEqual([
        ['/projects/from-template', { name: 'Onboarding', ownerEmployeeId: 'e1', templateId: 'tpl1' }],
        ['/projects/p1', { budgetMinutes: 90 }],
      ]);
    });
  });

  it('create_task accepts a project with its phase', async () => {
    await withClient(async (client) => {
      await client.callTool({ name: 'create_task', arguments: { entityType: 'project', entityId: 'p1', title: 'Kickoff', assigneeId: 'u1', projectPhaseId: 'ph1' } });
      expect(calls[0]).toMatchObject({ method: 'POST', path: '/tasks', body: { entityType: 'project', projectPhaseId: 'ph1' } });
    });
  });

  it('clock_action maps to the clock routes', async () => {
    await withClient(async (client) => {
      await client.callTool({ name: 'clock_action', arguments: { action: 'in', locationId: 'loc1' } });
      await client.callTool({ name: 'clock_action', arguments: { action: 'break_start' } });
      expect(writes().map((c) => c.path)).toEqual(['/clock/in', '/clock/break/start']);
    });
  });
});

describe('the catalog', () => {
  it('has unique names and every tool annotated', async () => {
    await withClient(async (client) => {
      const { tools } = await client.listTools();
      expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
      expect(tools.every((t) => typeof t.annotations?.readOnlyHint === 'boolean')).toBe(true);
      // Configuration and money stay in the app.
      expect(tools.some((t) => /pipeline_stage|create_role|run_payroll|terminate|create_department/.test(t.name))).toBe(false);
    });
  });
});
