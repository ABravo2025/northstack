import { beforeEach, describe, expect, it, vi } from 'vitest';

let apiKeys: any[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    apiKey: {
      create: vi.fn(async ({ data }: any) => {
        const created = { id: `key_${apiKeys.length + 1}`, lastUsedAt: null, revokedAt: null, createdAt: new Date(), ...data };
        apiKeys.push(created);
        return created;
      }),
      findMany: vi.fn(async ({ where }: any) =>
        apiKeys
          .filter((k) => k.tenantId === where.tenantId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      ),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = apiKeys.filter(
          (k) => k.id === where.id && k.tenantId === where.tenantId && (where.revokedAt === undefined || k.revokedAt === where.revokedAt),
        );
        for (const match of matches) Object.assign(match, data);
        return { count: matches.length };
      }),
    },
  },
}));

import { createApiKey, listApiKeys, revokeApiKey } from '../src/modules/integrations/apiKeyService.js';
import type { RoleContext } from '../src/modules/auth/roleService.js';

const OWNER: RoleContext = { id: 'r_owner', name: 'Owner', isOwner: true, permissions: new Set(), hiddenFieldsByEntity: new Map() };

function role(permissions: string[], hidden: Record<string, string[]> = {}): RoleContext {
  return {
    id: 'r_custom',
    name: 'Custom',
    isOwner: false,
    permissions: new Set(permissions),
    hiddenFieldsByEntity: new Map(Object.entries(hidden).map(([k, v]) => [k as any, new Set(v)])),
  };
}

beforeEach(() => {
  apiKeys = [];
});

describe('createApiKey', () => {
  it('creates a key and returns the full key exactly once', async () => {
    const result = await createApiKey('tenant_1', 'user_1', OWNER, { name: 'Zapier', scopes: ['tasks:read', 'tasks:write'] });

    expect(result.fullKey.startsWith('nk_live_')).toBe(true);
    expect(result.name).toBe('Zapier');
    expect(result.scopes).toEqual(['tasks:read', 'tasks:write']);
    expect((result as any).keyHash).toBeUndefined();
  });

  it('rejects an empty name', async () => {
    await expect(createApiKey('tenant_1', 'user_1', OWNER, { name: '  ', scopes: ['tasks:read'] })).rejects.toThrow('Name is required.');
  });

  it('rejects a key with no scopes', async () => {
    await expect(createApiKey('tenant_1', 'user_1', OWNER, { name: 'Zapier', scopes: [] })).rejects.toThrow('At least one scope is required.');
  });

  it('rejects an unknown scope', async () => {
    await expect(createApiKey('tenant_1', 'user_1', OWNER, { name: 'Zapier', scopes: ['not.a.real.scope'] })).rejects.toThrow('Unknown scope(s)');
  });

  it('dedupes repeated scopes', async () => {
    const result = await createApiKey('tenant_1', 'user_1', OWNER, { name: 'Zapier', scopes: ['tasks:read', 'tasks:read'] });
    expect(result.scopes).toEqual(['tasks:read']);
  });
});

describe('listApiKeys', () => {
  it('never returns keyHash or the full key, and only lists the requesting tenant', async () => {
    await createApiKey('tenant_1', 'user_1', OWNER, { name: 'A', scopes: ['tasks:read'] });
    await createApiKey('tenant_2', 'user_2', OWNER, { name: 'B', scopes: ['tasks:read'] });

    const list = await listApiKeys('tenant_1');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('A');
    expect((list[0] as any).keyHash).toBeUndefined();
    expect((list[0] as any).fullKey).toBeUndefined();
  });
});

describe('revokeApiKey', () => {
  it('soft-revokes a key', async () => {
    const created = await createApiKey('tenant_1', 'user_1', OWNER, { name: 'A', scopes: ['tasks:read'] });
    await revokeApiKey('tenant_1', created.id);

    const [key] = await listApiKeys('tenant_1');
    expect(key.revokedAt).toBeInstanceOf(Date);
  });

  it('revoking twice is a no-op, not an error', async () => {
    const created = await createApiKey('tenant_1', 'user_1', OWNER, { name: 'A', scopes: ['tasks:read'] });
    await revokeApiKey('tenant_1', created.id);
    const firstRevokedAt = apiKeys[0].revokedAt;

    await expect(revokeApiKey('tenant_1', created.id)).resolves.toBeUndefined();
    expect(apiKeys[0].revokedAt).toBe(firstRevokedAt);
  });

  it('revoking a key belonging to a different tenant does nothing', async () => {
    const created = await createApiKey('tenant_1', 'user_1', OWNER, { name: 'A', scopes: ['tasks:read'] });
    await revokeApiKey('tenant_2', created.id);

    const [key] = await listApiKeys('tenant_1');
    expect(key.revokedAt).toBeNull();
  });
});

describe("createApiKey — scopes capped by the creator's role", () => {
  it('rejects a payroll scope from a role without Payroll access (the 2026-10-02 escalation)', async () => {
    const apiOnly = role(['manage_api_access']);
    await expect(createApiKey('tenant_1', 'user_1', apiOnly, { name: 'X', scopes: ['hr.payroll:read'] })).rejects.toThrow(
      "Your role can't grant these scope(s): hr.payroll:read",
    );
  });

  it('allows a scope the role has, and Tasks/Notes for anyone who can manage keys', async () => {
    const crm = role(['manage_api_access', 'view_company']);
    const result = await createApiKey('tenant_1', 'user_1', crm, { name: 'X', scopes: ['crm.companies:read', 'tasks:write'] });
    expect(result.scopes).toEqual(['crm.companies:read', 'tasks:write']);
  });

  it('rejects an entity read scope when the role has hidden fields on that entity', async () => {
    const restricted = role(['manage_api_access', 'view_company'], { company: ['annualRevenue'] });
    await expect(createApiKey('tenant_1', 'user_1', restricted, { name: 'X', scopes: ['crm.companies:read'] })).rejects.toThrow(
      'crm.companies:read',
    );
  });

  it('rejects employee scopes unless the role sees every employee', async () => {
    const reportsOnly = role(['manage_api_access', 'view_employee', 'view_employee_scope:reports']);
    await expect(createApiKey('tenant_1', 'user_1', reportsOnly, { name: 'X', scopes: ['hr.employees:read'] })).rejects.toThrow(
      'hr.employees:read',
    );
    const all = role(['manage_api_access', 'view_employee', 'view_employee_scope:all']);
    const result = await createApiKey('tenant_1', 'user_1', all, { name: 'X', scopes: ['hr.employees:read'] });
    expect(result.scopes).toEqual(['hr.employees:read']);
  });
});
