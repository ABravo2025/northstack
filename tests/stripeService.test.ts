import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.STRIPE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');

let connections: any[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    stripeConnection: {
      findUnique: vi.fn(async ({ where }: any) => connections.find((c) => c.tenantId === where.tenantId) ?? null),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const existing = connections.find((c) => c.tenantId === where.tenantId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = {
          id: `conn_${connections.length + 1}`,
          disconnectedAt: null,
          needsAttention: false,
          connectedAt: new Date(),
          ...create,
        };
        connections.push(created);
        return created;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const existing = connections.find((c) => c.tenantId === where.tenantId);
        if (!existing) throw new Error('not found');
        Object.assign(existing, data);
        return existing;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = connections.filter(
          (c) => c.tenantId === where.tenantId && (where.disconnectedAt === undefined || c.disconnectedAt === where.disconnectedAt),
        );
        for (const match of matches) Object.assign(match, data);
        return { count: matches.length };
      }),
    },
  },
}));

const { retrieveAccountMock, listCustomersMock } = vi.hoisted(() => ({
  retrieveAccountMock: vi.fn(async () => ({ id: 'acct_123' })),
  listCustomersMock: vi.fn(async () => ({ data: [], has_more: false })),
}));
vi.mock('../src/lib/stripe.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/stripe.js')>('../src/lib/stripe.js');
  return {
    ...actual,
    retrieveAccount: retrieveAccountMock,
    listCustomers: listCustomersMock,
  };
});

import { StripeApiError } from '../src/lib/stripe.js';
import {
  connectStripe,
  detectApiKeyMode,
  disconnectStripe,
  getApiKeyForTenant,
  getStripeConnectionStatus,
  markNeedsAttention,
} from '../src/modules/integrations/stripeService.js';

function resetMocks() {
  connections = [];
  retrieveAccountMock.mockReset().mockResolvedValue({ id: 'acct_123' });
  listCustomersMock.mockReset().mockResolvedValue({ data: [], has_more: false });
}

describe('detectApiKeyMode', () => {
  it('detects test/live from the key prefix, for both secret and restricted keys', () => {
    expect(detectApiKeyMode('sk_test_abc')).toBe('test');
    expect(detectApiKeyMode('rk_test_abc')).toBe('test');
    expect(detectApiKeyMode('sk_live_abc')).toBe('live');
    expect(detectApiKeyMode('rk_live_abc')).toBe('live');
  });

  it('rejects anything that does not look like a Stripe secret/restricted key', () => {
    expect(() => detectApiKeyMode('pk_test_abc')).toThrow(/sk_ or rk_/);
    expect(() => detectApiKeyMode('not-a-key')).toThrow(/sk_ or rk_/);
    expect(() => detectApiKeyMode('')).toThrow(/sk_ or rk_/);
  });
});

describe('connectStripe', () => {
  beforeEach(resetMocks);

  it('stores an encrypted key and a sanitized status on a valid connect', async () => {
    const status = await connectStripe({ tenantId: 't1', userId: 'u1', apiKey: 'sk_test_abc123' });

    expect(status).toEqual({
      connected: true,
      apiKeyMode: 'test',
      connectedAt: expect.any(String),
      needsAttention: false,
    });
    expect(connections[0].apiKeyEncrypted).not.toContain('sk_test_abc123');
    expect(connections[0].stripeAccountId).toBe('acct_123');
  });

  it('falls back to listCustomers when retrieveAccount 401s (a Restricted Key without Account read access)', async () => {
    retrieveAccountMock.mockRejectedValueOnce(new StripeApiError(401, 'insufficient permissions'));

    const status = await connectStripe({ tenantId: 't1', userId: 'u1', apiKey: 'rk_test_scopedkey' });

    expect(status.connected).toBe(true);
    expect(listCustomersMock).toHaveBeenCalledWith('rk_test_scopedkey', { limit: 1 });
    expect(connections[0].stripeAccountId).toBeUndefined();
  });

  it('rejects when both retrieveAccount and the listCustomers fallback fail', async () => {
    retrieveAccountMock.mockRejectedValueOnce(new StripeApiError(401, 'bad key'));
    listCustomersMock.mockRejectedValueOnce(new StripeApiError(401, 'bad key'));

    await expect(connectStripe({ tenantId: 't1', userId: 'u1', apiKey: 'sk_test_revoked' })).rejects.toThrow(/rejected this key/);
    expect(connections).toHaveLength(0);
  });

  it('rejects a malformed key before ever calling Stripe', async () => {
    await expect(connectStripe({ tenantId: 't1', userId: 'u1', apiKey: 'garbage' })).rejects.toThrow(/sk_ or rk_/);
    expect(retrieveAccountMock).not.toHaveBeenCalled();
  });

  it('reconnecting clears a previous disconnectedAt/needsAttention instead of creating a second row', async () => {
    await connectStripe({ tenantId: 't1', userId: 'u1', apiKey: 'sk_test_first' });
    await disconnectStripe('t1');

    const status = await connectStripe({ tenantId: 't1', userId: 'u2', apiKey: 'sk_live_second' });

    expect(connections).toHaveLength(1);
    expect(status).toEqual({
      connected: true,
      apiKeyMode: 'live',
      connectedAt: expect.any(String),
      needsAttention: false,
    });
    expect(connections[0].connectedByUserId).toBe('u2');
  });
});

describe('getStripeConnectionStatus / disconnectStripe / getApiKeyForTenant', () => {
  beforeEach(resetMocks);

  it('reports "not connected" for a tenant that never connected', async () => {
    expect(await getStripeConnectionStatus('unknown-tenant')).toEqual({
      connected: false,
      apiKeyMode: null,
      connectedAt: null,
      needsAttention: false,
    });
  });

  it('disconnecting a tenant that never connected is a no-op, not a crash', async () => {
    await expect(disconnectStripe('never-connected-tenant')).resolves.toBeUndefined();
  });

  it('disconnecting an already-disconnected connection is a no-op', async () => {
    await connectStripe({ tenantId: 't1', userId: 'u1', apiKey: 'sk_test_abc' });
    await disconnectStripe('t1');
    await expect(disconnectStripe('t1')).resolves.toBeUndefined();
  });

  it('treats a disconnected connection as not connected, without deleting the row', async () => {
    await connectStripe({ tenantId: 't1', userId: 'u1', apiKey: 'sk_test_abc' });
    await disconnectStripe('t1');

    expect(await getStripeConnectionStatus('t1')).toMatchObject({ connected: false });
    expect(connections).toHaveLength(1); // soft — the row survives
    await expect(getApiKeyForTenant('t1')).rejects.toThrow(/no active Stripe connection/);
  });

  it('getApiKeyForTenant decrypts back to the exact key that was stored', async () => {
    await connectStripe({ tenantId: 't1', userId: 'u1', apiKey: 'sk_test_roundtrip' });
    expect(await getApiKeyForTenant('t1')).toBe('sk_test_roundtrip');
  });
});

describe('markNeedsAttention', () => {
  beforeEach(resetMocks);

  it('flips needsAttention on an active connection', async () => {
    await connectStripe({ tenantId: 't1', userId: 'u1', apiKey: 'sk_test_abc' });
    await markNeedsAttention('t1');
    expect(await getStripeConnectionStatus('t1')).toMatchObject({ needsAttention: true });
  });

  it('never sets it on an already-disconnected connection', async () => {
    await connectStripe({ tenantId: 't1', userId: 'u1', apiKey: 'sk_test_abc' });
    await disconnectStripe('t1');
    await markNeedsAttention('t1');
    expect(connections[0].needsAttention).toBe(false);
  });
});
