import { beforeEach, describe, expect, it, vi } from 'vitest';

let apiKeys: any[] = [];

vi.mock('../src/lib/prismaExternal.js', () => ({
  default: {
    apiKey: {
      findUnique: vi.fn(async ({ where }: any) => apiKeys.find((k) => k.keyHash === where.keyHash) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const existing = apiKeys.find((k) => k.id === where.id);
        if (!existing) throw new Error('not found');
        Object.assign(existing, data);
        return existing;
      }),
    },
  },
}));

import {
  API_SCOPES,
  authenticateApiKey,
  generateApiKey,
  hashApiKey,
  requireScope,
} from '../src/lib/externalApiAuth.js';

function fakeRes() {
  const res: any = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function fakeReq(bearer?: string) {
  return { headers: bearer ? { authorization: `Bearer ${bearer}` } : {} } as any;
}

beforeEach(() => {
  apiKeys = [];
});

describe('generateApiKey', () => {
  it('produces a nk_live_-prefixed key with a matching keyPrefix', () => {
    const { fullKey, keyPrefix } = generateApiKey();
    expect(fullKey.startsWith('nk_live_')).toBe(true);
    expect(fullKey.startsWith(keyPrefix)).toBe(true);
    expect(keyPrefix).toHaveLength(14);
  });

  it('never repeats a key across calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(generateApiKey().fullKey);
    }
    expect(seen.size).toBe(200);
  });
});

describe('hashApiKey', () => {
  it('is deterministic and produces a 64-char hex sha256 digest', () => {
    const { fullKey } = generateApiKey();
    const hash1 = hashApiKey(fullKey);
    const hash2 = hashApiKey(fullKey);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different keys', () => {
    expect(hashApiKey(generateApiKey().fullKey)).not.toBe(hashApiKey(generateApiKey().fullKey));
  });
});

describe('authenticateApiKey', () => {
  it('401s when no Authorization header is present', async () => {
    const res = fakeRes();
    const result = await authenticateApiKey(fakeReq(), res);
    expect(result).toBeNull();
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('missing_api_key');
  });

  it('401s when the key does not match any ApiKey', async () => {
    const res = fakeRes();
    const result = await authenticateApiKey(fakeReq('nk_live_doesnotexist'), res);
    expect(result).toBeNull();
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('invalid_api_key');
  });

  it('401s when the matching key was revoked', async () => {
    const { fullKey } = generateApiKey();
    apiKeys.push({
      id: 'key_1',
      tenantId: 'tenant_1',
      keyHash: hashApiKey(fullKey),
      scopes: ['tasks:read'],
      revokedAt: new Date(),
    });

    const res = fakeRes();
    const result = await authenticateApiKey(fakeReq(fullKey), res);
    expect(result).toBeNull();
    expect(res.statusCode).toBe(401);
  });

  it('returns the key and updates lastUsedAt for a valid, active key', async () => {
    const { fullKey } = generateApiKey();
    apiKeys.push({
      id: 'key_1',
      tenantId: 'tenant_1',
      keyHash: hashApiKey(fullKey),
      scopes: ['tasks:read', 'tasks:write'],
      revokedAt: null,
      lastUsedAt: null,
      createdByUserId: 'user_1',
    });

    const res = fakeRes();
    const result = await authenticateApiKey(fakeReq(fullKey), res);
    expect(result).toEqual({ id: 'key_1', tenantId: 'tenant_1', scopes: ['tasks:read', 'tasks:write'], createdByUserId: 'user_1' });
    expect(apiKeys[0].lastUsedAt).toBeInstanceOf(Date);
  });
});

describe('requireScope', () => {
  const key = { id: 'key_1', tenantId: 'tenant_1', scopes: ['tasks:read'], createdByUserId: 'user_1' };

  it('allows a key that has the required scope', () => {
    const res = fakeRes();
    expect(requireScope(key, 'tasks:read', res)).toBe(true);
    expect(res.statusCode).toBeUndefined();
  });

  it('403s a key missing the required scope', () => {
    const res = fakeRes();
    expect(requireScope(key, 'tasks:write', res)).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('missing_scope');
    expect(res.body.required).toBe('tasks:write');
  });
});

describe('API_SCOPES', () => {
  it('has no duplicate entries', () => {
    expect(new Set(API_SCOPES).size).toBe(API_SCOPES.length);
  });
});
