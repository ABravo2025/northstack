import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = randomBytes(32).toString('hex');

let subscriptions: any[] = [];
let deliveries: any[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    webhookSubscription: {
      create: vi.fn(async ({ data }: any) => {
        const created = { id: `wh_${subscriptions.length + 1}`, needsAttention: false, createdAt: new Date(), ...data };
        subscriptions.push(created);
        return created;
      }),
      findMany: vi.fn(async ({ where }: any) => subscriptions.filter((s) => s.tenantId === where.tenantId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
      findUnique: vi.fn(async ({ where }: any) => subscriptions.find((s) => s.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const existing = subscriptions.find((s) => s.id === where.id);
        if (!existing) throw new Error('not found');
        Object.assign(existing, data);
        return existing;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = subscriptions.filter((s) => s.id === where.id && s.tenantId === where.tenantId);
        for (const match of matches) Object.assign(match, data);
        return { count: matches.length };
      }),
    },
    webhookDelivery: {
      findMany: vi.fn(async ({ where, take }: any) => {
        let rows = deliveries.filter((d) => d.webhookSubscriptionId === where.webhookSubscriptionId);
        rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return take ? rows.slice(0, take) : rows;
      }),
      findUnique: vi.fn(async ({ where }: any) => deliveries.find((d) => d.id === where.id) ?? null),
    },
  },
}));

const { deliverWebhookDeliveryMock } = vi.hoisted(() => ({ deliverWebhookDeliveryMock: vi.fn(async () => undefined) }));
vi.mock('../src/modules/integrations/webhookDispatchService.js', async () => {
  const actual = await vi.importActual<typeof import('../src/modules/integrations/webhookDispatchService.js')>(
    '../src/modules/integrations/webhookDispatchService.js',
  );
  return { ...actual, deliverWebhookDelivery: deliverWebhookDeliveryMock };
});

import {
  createSubscription,
  deleteSubscription,
  listSubscriptions,
  regenerateSecret,
  retryDelivery,
  updateSubscription,
} from '../src/modules/integrations/webhookService.js';

beforeEach(() => {
  subscriptions = [];
  deliveries = [];
  deliverWebhookDeliveryMock.mockClear();
});

describe('createSubscription', () => {
  it('creates a subscription and returns the secret exactly once', async () => {
    const result = await createSubscription('tenant_1', 'user_1', { url: 'https://example.com/hook', events: ['task.created'] });
    expect(result.secret.startsWith('whsec_')).toBe(true);
    expect(result.url).toBe('https://example.com/hook');
    expect((result as any).secretEncrypted).toBeUndefined();
  });

  it('rejects a non-https url', async () => {
    await expect(createSubscription('tenant_1', 'user_1', { url: 'http://example.com/hook', events: ['task.created'] })).rejects.toThrow('https');
  });

  it('rejects an unknown event', async () => {
    await expect(createSubscription('tenant_1', 'user_1', { url: 'https://example.com/hook', events: ['not.a.real.event'] })).rejects.toThrow('Unknown event(s)');
  });

  it('rejects zero events', async () => {
    await expect(createSubscription('tenant_1', 'user_1', { url: 'https://example.com/hook', events: [] })).rejects.toThrow('At least one event is required.');
  });
});

describe('listSubscriptions', () => {
  it('never returns secretEncrypted and only lists the requesting tenant', async () => {
    await createSubscription('tenant_1', 'user_1', { url: 'https://a.example.com', events: ['task.created'] });
    await createSubscription('tenant_2', 'user_2', { url: 'https://b.example.com', events: ['task.created'] });

    const list = await listSubscriptions('tenant_1');
    expect(list).toHaveLength(1);
    expect(list[0].url).toBe('https://a.example.com');
    expect((list[0] as any).secretEncrypted).toBeUndefined();
  });
});

describe('updateSubscription', () => {
  it('updates url/events/isActive', async () => {
    const created = await createSubscription('tenant_1', 'user_1', { url: 'https://a.example.com', events: ['task.created'] });
    const updated = await updateSubscription('tenant_1', created.id, { isActive: false });
    expect(updated?.isActive).toBe(false);
  });

  it('clears needsAttention when reactivated', async () => {
    const created = await createSubscription('tenant_1', 'user_1', { url: 'https://a.example.com', events: ['task.created'] });
    subscriptions[0].needsAttention = true;
    const updated = await updateSubscription('tenant_1', created.id, { isActive: true });
    expect(updated?.needsAttention).toBe(false);
  });

  it('returns null for a subscription belonging to a different tenant', async () => {
    const created = await createSubscription('tenant_1', 'user_1', { url: 'https://a.example.com', events: ['task.created'] });
    const updated = await updateSubscription('tenant_2', created.id, { isActive: false });
    expect(updated).toBeNull();
  });
});

describe('deleteSubscription', () => {
  it('soft-deletes (isActive: false) and is idempotent', async () => {
    const created = await createSubscription('tenant_1', 'user_1', { url: 'https://a.example.com', events: ['task.created'] });
    await deleteSubscription('tenant_1', created.id);
    expect(subscriptions[0].isActive).toBe(false);
    await expect(deleteSubscription('tenant_1', created.id)).resolves.toBeUndefined();
  });
});

describe('regenerateSecret', () => {
  it('returns a new secret different from the original', async () => {
    const created = await createSubscription('tenant_1', 'user_1', { url: 'https://a.example.com', events: ['task.created'] });
    const result = await regenerateSecret('tenant_1', created.id);
    expect(result?.secret).toBeDefined();
    expect(result?.secret).not.toBe(created.secret);
  });
});

describe('retryDelivery', () => {
  it('calls deliverWebhookDelivery for a delivery owned by this tenant', async () => {
    const created = await createSubscription('tenant_1', 'user_1', { url: 'https://a.example.com', events: ['task.created'] });
    const delivery = { id: 'del_1', webhookSubscriptionId: created.id, webhookSubscription: subscriptions[0] };
    deliveries.push(delivery);

    const result = await retryDelivery('tenant_1', 'del_1');
    expect(result).toEqual({ success: true });
    expect(deliverWebhookDeliveryMock).toHaveBeenCalledTimes(1);
  });
});
