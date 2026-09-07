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

beforeEach(() => {
  apiKeys = [];
});

describe('createApiKey', () => {
  it('creates a key and returns the full key exactly once', async () => {
    const result = await createApiKey('tenant_1', 'user_1', { name: 'Zapier', scopes: ['tasks:read', 'tasks:write'] });

    expect(result.fullKey.startsWith('nk_live_')).toBe(true);
    expect(result.name).toBe('Zapier');
    expect(result.scopes).toEqual(['tasks:read', 'tasks:write']);
    expect((result as any).keyHash).toBeUndefined();
  });

  it('rejects an empty name', async () => {
    await expect(createApiKey('tenant_1', 'user_1', { name: '  ', scopes: ['tasks:read'] })).rejects.toThrow('Name is required.');
  });

  it('rejects a key with no scopes', async () => {
    await expect(createApiKey('tenant_1', 'user_1', { name: 'Zapier', scopes: [] })).rejects.toThrow('At least one scope is required.');
  });

  it('rejects an unknown scope', async () => {
    await expect(createApiKey('tenant_1', 'user_1', { name: 'Zapier', scopes: ['not.a.real.scope'] })).rejects.toThrow('Unknown scope(s)');
  });

  it('dedupes repeated scopes', async () => {
    const result = await createApiKey('tenant_1', 'user_1', { name: 'Zapier', scopes: ['tasks:read', 'tasks:read'] });
    expect(result.scopes).toEqual(['tasks:read']);
  });
});

describe('listApiKeys', () => {
  it('never returns keyHash or the full key, and only lists the requesting tenant', async () => {
    await createApiKey('tenant_1', 'user_1', { name: 'A', scopes: ['tasks:read'] });
    await createApiKey('tenant_2', 'user_2', { name: 'B', scopes: ['tasks:read'] });

    const list = await listApiKeys('tenant_1');
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('A');
    expect((list[0] as any).keyHash).toBeUndefined();
    expect((list[0] as any).fullKey).toBeUndefined();
  });
});

describe('revokeApiKey', () => {
  it('soft-revokes a key', async () => {
    const created = await createApiKey('tenant_1', 'user_1', { name: 'A', scopes: ['tasks:read'] });
    await revokeApiKey('tenant_1', created.id);

    const [key] = await listApiKeys('tenant_1');
    expect(key.revokedAt).toBeInstanceOf(Date);
  });

  it('revoking twice is a no-op, not an error', async () => {
    const created = await createApiKey('tenant_1', 'user_1', { name: 'A', scopes: ['tasks:read'] });
    await revokeApiKey('tenant_1', created.id);
    const firstRevokedAt = apiKeys[0].revokedAt;

    await expect(revokeApiKey('tenant_1', created.id)).resolves.toBeUndefined();
    expect(apiKeys[0].revokedAt).toBe(firstRevokedAt);
  });

  it('revoking a key belonging to a different tenant does nothing', async () => {
    const created = await createApiKey('tenant_1', 'user_1', { name: 'A', scopes: ['tasks:read'] });
    await revokeApiKey('tenant_2', created.id);

    const [key] = await listApiKeys('tenant_1');
    expect(key.revokedAt).toBeNull();
  });
});
