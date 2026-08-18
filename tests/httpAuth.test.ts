import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessions: any[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    session: {
      findUnique: vi.fn(async ({ where }: any) => sessions.find((s) => s.token === where.token) ?? null),
      update: vi.fn(async () => ({})),
    },
  },
}));

import { authenticateUser, validateSession } from '../src/lib/httpAuth.js';

function fakeReq(token: string | null, method = 'GET'): any {
  return { headers: token ? { authorization: `Bearer ${token}` } : {}, method };
}

function fakeRes(): any {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body: any) => {
    res.body = body;
    return res;
  });
  return res;
}

function pushSession(userOverrides: any = {}) {
  const session = {
    token: 'tok-1',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    user: {
      id: 'user-1',
      status: 'active',
      tenantId: 'tenant-1',
      tenant: { id: 'tenant-1', status: 'active' },
      ...userOverrides,
    },
  };
  sessions.push(session);
  return session;
}

describe('validateSession — suspended tenant view-only enforcement', () => {
  beforeEach(() => {
    sessions.length = 0;
  });

  it('allows a GET request through for a suspended tenant', async () => {
    pushSession({ tenant: { id: 'tenant-1', status: 'suspended' } });
    const res = fakeRes();

    const user = await validateSession(fakeReq('tok-1', 'GET'), res);
    expect(user).not.toBeNull();
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('blocks a %s request with 403 for a suspended tenant', async (method) => {
    pushSession({ tenant: { id: 'tenant-1', status: 'suspended' } });
    const res = fakeRes();

    const user = await validateSession(fakeReq('tok-1', method), res);
    expect(user).toBeNull();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error).toMatch(/view-only/i);
  });

  it.each(['trialing', 'past_due', 'active'])('still allows mutations through for a %s tenant', async (status) => {
    pushSession({ tenant: { id: 'tenant-1', status } });
    const res = fakeRes();

    const user = await validateSession(fakeReq('tok-1', 'POST'), res);
    expect(user).not.toBeNull();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('still requires a tenantId regardless of method (pre-existing behavior, unaffected)', async () => {
    pushSession({ tenantId: null, tenant: null });
    const res = fakeRes();

    const user = await validateSession(fakeReq('tok-1', 'GET'), res);
    expect(user).toBeNull();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error).toBe('Tenant access required');
  });

  it('a suspended tenant with no bearer token still gets a plain 401, not the view-only message', async () => {
    const res = fakeRes();
    const user = await authenticateUser(fakeReq(null, 'POST'), res);
    expect(user).toBeNull();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
