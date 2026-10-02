import { beforeEach, describe, expect, it, vi } from 'vitest';

let apiKeys: any[] = [];
let aiConnections: any[] = [];
let users: any[] = [];
let roles: Record<string, any> = {};

vi.mock('../src/modules/auth/roleService.js', () => ({
  resolveRoleContextForUser: vi.fn(async (user: any) => roles[user.id]),
  getEmployeeScope: vi.fn((role: any) => (role.isOwner || role.permissions.has('view_employee_scope:all') ? 'all' : 'none')),
}));

vi.mock('../src/lib/prismaExternal.js', () => ({
  default: {
    user: {
      findUnique: vi.fn(async ({ where }: any) => users.find((u) => u.id === where.id) ?? null),
    },
    aiConnection: {
      findFirst: vi.fn(async ({ where }: any) => {
        const hashes = where.OR.map((c: any) => c.personalTokenHash ?? c.accessTokenHash);
        const conn = aiConnections.find((c) => hashes.includes(c.personalTokenHash) || hashes.includes(c.accessTokenHash));
        return conn ? { ...conn, tenant: conn.tenant ?? { plan: null, status: 'active' } } : null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const existing = aiConnections.find((c) => c.id === where.id);
        Object.assign(existing, data);
        return existing;
      }),
    },
    apiKey: {
      findUnique: vi.fn(async ({ where }: any) => {
        const key = apiKeys.find((k) => k.keyHash === where.keyHash);
        return key ? { ...key, tenant: key.tenant ?? { plan: null, status: 'active' } } : null;
      }),
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
  generateAiToken,
  generateApiKey,
  hashApiKey,
  requireScope,
} from '../src/lib/externalApiAuth.js';

function role(permissions: string[], isOwner = false) {
  return { id: `r_${permissions.join('_')}`, name: isOwner ? 'Owner' : 'Custom', isOwner, permissions: new Set(permissions), hiddenFieldsByEntity: new Map() };
}

function addUser(id: string, roleContext: any, overrides: Record<string, unknown> = {}) {
  users.push({ id, tenantId: 'tenant_1', status: 'active', firstName: 'Ana', lastName: 'Lopez', tenant: { id: 'tenant_1', status: 'active', plan: null }, ...overrides });
  roles[id] = roleContext;
}

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
  aiConnections = [];
  users = [];
  roles = {};
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
    addUser('user_1', role([], true));
    const { fullKey } = generateApiKey();
    apiKeys.push({
      id: 'key_1',
      tenantId: 'tenant_1',
      keyHash: hashApiKey(fullKey),
      name: 'Zapier',
      scopes: ['tasks:read', 'tasks:write'],
      revokedAt: null,
      lastUsedAt: null,
      createdByUserId: 'user_1',
    });

    const res = fakeRes();
    const result = await authenticateApiKey(fakeReq(fullKey), res);
    expect(result).toMatchObject({
      kind: 'api_key',
      id: 'key_1',
      name: 'Zapier',
      tenantId: 'tenant_1',
      scopes: ['tasks:read', 'tasks:write'],
      createdByUserId: 'user_1',
      tenantPlan: null,
      tenantStatus: 'active',
    });
    expect(result?.actor.id).toBe('user_1');
    expect(apiKeys[0].lastUsedAt).toBeInstanceOf(Date);
  });

  it("returns the key's tenant plan so the router can reject Starter tenants", async () => {
    addUser('user_1', role([], true));
    const { fullKey } = generateApiKey();
    apiKeys.push({
      id: 'key_1',
      tenantId: 'tenant_1',
      keyHash: hashApiKey(fullKey),
      scopes: ['tasks:read'],
      revokedAt: null,
      lastUsedAt: null,
      createdByUserId: 'user_1',
      tenant: { plan: 'starter', status: 'active' },
    });

    const result = await authenticateApiKey(fakeReq(fullKey), fakeRes());
    expect(result?.tenantPlan).toBe('starter');
  });

  it("narrows a key's scopes to what its creator's role can do NOW (role narrowed after creation)", async () => {
    addUser('user_1', role(['manage_api_access', 'view_company']));
    const { fullKey } = generateApiKey();
    apiKeys.push({
      id: 'key_1', tenantId: 'tenant_1', keyHash: hashApiKey(fullKey), name: 'Old key', revokedAt: null, createdByUserId: 'user_1',
      scopes: ['crm.companies:read', 'hr.payroll:read', 'tasks:read'],
    });

    const result = await authenticateApiKey(fakeReq(fullKey), fakeRes());
    expect(result?.scopes).toEqual(['crm.companies:read', 'tasks:read']);
  });

  it("401s a key whose creator was deactivated", async () => {
    addUser('user_1', role([], true), { status: 'inactive' });
    const { fullKey } = generateApiKey();
    apiKeys.push({ id: 'key_1', tenantId: 'tenant_1', keyHash: hashApiKey(fullKey), name: 'K', revokedAt: null, createdByUserId: 'user_1', scopes: ['tasks:read'] });

    const res = fakeRes();
    expect(await authenticateApiKey(fakeReq(fullKey), res)).toBeNull();
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('key_creator_inactive');
  });
});

describe('authenticateApiKey — AI assistant tokens', () => {
  function addConnection(userId: string, overrides: Record<string, unknown> = {}) {
    const { fullKey } = generateAiToken();
    aiConnections.push({
      id: 'conn_1', tenantId: 'tenant_1', userId, clientName: 'Claude', revokedAt: null,
      personalTokenHash: hashApiKey(fullKey), accessTokenHash: null, accessTokenExpiresAt: null, ...overrides,
    });
    return fullKey;
  }

  it('generates nk_mcp_-prefixed tokens', () => {
    const { fullKey, keyPrefix } = generateAiToken();
    expect(fullKey.startsWith('nk_mcp_')).toBe(true);
    expect(fullKey.startsWith(keyPrefix)).toBe(true);
  });

  it("acts as its user, with scopes derived from the user's role (not key scopes)", async () => {
    addUser('user_7', role(['use_ai_assistants', 'view_company', 'view_contact']));
    const token = addConnection('user_7');

    const result = await authenticateApiKey(fakeReq(token), fakeRes());
    expect(result).toMatchObject({ kind: 'ai', id: 'conn_1', name: 'Claude', createdByUserId: 'user_7' });
    expect(result?.scopes).toContain('crm.companies:read');
    expect(result?.scopes).toContain('crm.opportunities:read');
    expect(result?.scopes).not.toContain('crm.companies:write');
    expect(result?.scopes).not.toContain('hr.payroll:read');
    expect(result?.scopes).not.toContain('hr.employees:read');
    expect(aiConnections[0].lastUsedAt).toBeInstanceOf(Date);
  });

  it("403s when the user's role has use_ai_assistants switched off", async () => {
    addUser('user_7', role(['view_company']));
    const token = addConnection('user_7');

    const res = fakeRes();
    expect(await authenticateApiKey(fakeReq(token), res)).toBeNull();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('ai_not_allowed');
  });

  it('401s a revoked connection and a deactivated user', async () => {
    addUser('user_7', role(['use_ai_assistants']));
    const revoked = addConnection('user_7', { revokedAt: new Date() });
    const res1 = fakeRes();
    expect(await authenticateApiKey(fakeReq(revoked), res1)).toBeNull();
    expect(res1.statusCode).toBe(401);

    aiConnections = [];
    users = [];
    addUser('user_8', role(['use_ai_assistants']), { status: 'inactive' });
    const inactive = addConnection('user_8');
    const res2 = fakeRes();
    expect(await authenticateApiKey(fakeReq(inactive), res2)).toBeNull();
    expect(res2.body.code).toBe('user_inactive');
  });

  it("401s when the user moved to another tenant (credential tenant mismatch)", async () => {
    addUser('user_7', role(['use_ai_assistants']), { tenantId: 'tenant_2' });
    const token = addConnection('user_7');
    const res = fakeRes();
    expect(await authenticateApiKey(fakeReq(token), res)).toBeNull();
    expect(res.statusCode).toBe(401);
  });

  it('401s an expired OAuth access token', async () => {
    addUser('user_7', role(['use_ai_assistants']));
    const { fullKey } = generateAiToken();
    aiConnections.push({
      id: 'conn_2', tenantId: 'tenant_1', userId: 'user_7', clientName: 'ChatGPT', revokedAt: null,
      personalTokenHash: null, accessTokenHash: hashApiKey(fullKey), accessTokenExpiresAt: new Date(Date.now() - 1000),
    });
    const res = fakeRes();
    expect(await authenticateApiKey(fakeReq(fullKey), res)).toBeNull();
    expect(res.body.code).toBe('invalid_ai_token');
  });
});

describe('requireScope', () => {
  const key = { kind: 'api_key', id: 'key_1', name: 'Zapier', tenantId: 'tenant_1', scopes: ['tasks:read'], createdByUserId: 'user_1', tenantPlan: null, tenantStatus: 'active', actor: {} } as any;

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
