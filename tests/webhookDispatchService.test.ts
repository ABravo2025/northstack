import { createHmac, randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = randomBytes(32).toString('hex');

let subscriptions: any[] = [];
let deliveries: any[] = [];
let nextDeliveryId = 1;

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    webhookSubscription: {
      findMany: vi.fn(async ({ where }: any) =>
        subscriptions.filter((s) => s.tenantId === where.tenantId && s.isActive === where.isActive && s.events.includes(where.events.has)),
      ),
      findUnique: vi.fn(async ({ where }: any) => subscriptions.find((s) => s.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const existing = subscriptions.find((s) => s.id === where.id);
        Object.assign(existing, data);
        return existing;
      }),
    },
    webhookDelivery: {
      create: vi.fn(async ({ data }: any) => {
        const created = { id: `del_${nextDeliveryId++}`, attempts: 0, lastAttemptAt: null, responseStatusCode: null, createdAt: new Date(Date.now() + nextDeliveryId), ...data };
        deliveries.push(created);
        return created;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const existing = deliveries.find((d) => d.id === where.id);
        Object.assign(existing, data);
        return existing;
      }),
      findMany: vi.fn(async ({ where, orderBy, take }: any) => {
        let rows = deliveries.slice();
        if (where?.webhookSubscriptionId) rows = rows.filter((d) => d.webhookSubscriptionId === where.webhookSubscriptionId);
        if (where?.status) rows = rows.filter((d) => d.status === where.status);
        if (where?.nextAttemptAt?.lte) rows = rows.filter((d) => d.nextAttemptAt && d.nextAttemptAt <= where.nextAttemptAt.lte);
        if (orderBy?.createdAt === 'desc') rows = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return take ? rows.slice(0, take) : rows;
      }),
    },
    $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
  },
}));

import { encryptWebhookSecret } from '../src/lib/webhookEncryption.js';
import { deliverWebhookDelivery, emitWebhookEvent, runWebhookDeliveryRetries, WEBHOOK_EVENTS } from '../src/modules/integrations/webhookDispatchService.js';

function makeSubscription(overrides: Partial<any> = {}) {
  const sub = {
    id: `sub_${subscriptions.length + 1}`,
    tenantId: 'tenant_1',
    url: 'https://example.com/hook',
    secretEncrypted: encryptWebhookSecret('whsec_test_secret'),
    events: ['task.created'],
    isActive: true,
    needsAttention: false,
    ...overrides,
  };
  subscriptions.push(sub);
  return sub;
}

beforeEach(() => {
  subscriptions = [];
  deliveries = [];
  nextDeliveryId = 1;
  vi.restoreAllMocks();
});

describe('WEBHOOK_EVENTS', () => {
  it('has no duplicates', () => {
    expect(new Set(WEBHOOK_EVENTS).size).toBe(WEBHOOK_EVENTS.length);
  });
});

describe('emitWebhookEvent', () => {
  it('creates a pending WebhookDelivery for every active subscription subscribed to the event', async () => {
    makeSubscription({ events: ['task.created', 'task.completed'] });
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await emitWebhookEvent({ tenantId: 'tenant_1', type: 'task.created', entity: { type: 'task', id: 't1' }, data: { id: 't1' } });

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].eventType).toBe('task.created');
  });

  it('creates no delivery when no subscription is subscribed to the event', async () => {
    makeSubscription({ events: ['task.completed'] });
    await emitWebhookEvent({ tenantId: 'tenant_1', type: 'task.created', entity: { type: 'task', id: 't1' }, data: {} });
    expect(deliveries).toHaveLength(0);
  });

  it('creates no delivery for an inactive subscription even if it lists the event', async () => {
    makeSubscription({ isActive: false, events: ['task.created'] });
    await emitWebhookEvent({ tenantId: 'tenant_1', type: 'task.created', entity: { type: 'task', id: 't1' }, data: {} });
    expect(deliveries).toHaveLength(0);
  });
});

describe('deliverWebhookDelivery — signing', () => {
  it('signs the request with HMAC-SHA256 over `${timestamp}.${rawBody}` using the subscription secret', async () => {
    const secret = 'whsec_known_secret';
    const sub = makeSubscription({ secretEncrypted: encryptWebhookSecret(secret) });
    const delivery = { id: 'del_1', webhookSubscriptionId: sub.id, eventType: 'task.created', payload: { id: 'evt_1', foo: 'bar' }, attempts: 0 };
    deliveries.push(delivery);

    let capturedHeaders: Record<string, string> = {};
    let capturedBody = '';
    vi.spyOn(global, 'fetch').mockImplementation(async (_url, init: any) => {
      capturedHeaders = init.headers;
      capturedBody = init.body;
      return new Response(null, { status: 200 });
    });

    await deliverWebhookDelivery(delivery as any);

    const timestamp = capturedHeaders['X-Northstack-Timestamp'];
    const expectedSignature = createHmac('sha256', secret).update(`${timestamp}.${capturedBody}`).digest('hex');
    expect(capturedHeaders['X-Northstack-Signature']).toBe(`sha256=${expectedSignature}`);
    expect(JSON.parse(capturedBody)).toEqual(delivery.payload);
  });

  it('marks the delivery successful on a 2xx response', async () => {
    const sub = makeSubscription();
    const delivery = { id: 'del_1', webhookSubscriptionId: sub.id, eventType: 'task.created', payload: {}, attempts: 0 };
    deliveries.push(delivery);
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await deliverWebhookDelivery(delivery as any);

    expect(deliveries[0].status).toBe('success');
    expect(deliveries[0].attempts).toBe(1);
    expect(deliveries[0].nextAttemptAt).toBeNull();
  });
});

describe('deliverWebhookDelivery — backoff and attempts', () => {
  it('schedules +1min after the 1st failure, +5min after the 2nd, +30min after the 3rd, and fails on the 4th', async () => {
    const sub = makeSubscription();
    const delivery = { id: 'del_1', webhookSubscriptionId: sub.id, eventType: 'task.created', payload: {}, attempts: 0 };
    deliveries.push(delivery);
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));

    const before1 = Date.now();
    await deliverWebhookDelivery(delivery as any);
    expect(delivery.attempts).toBe(1);
    expect(delivery.status).toBe('pending');
    expect(delivery.nextAttemptAt.getTime() - before1).toBeGreaterThanOrEqual(59_000);
    expect(delivery.nextAttemptAt.getTime() - before1).toBeLessThan(61_000);

    const before2 = Date.now();
    await deliverWebhookDelivery(delivery as any);
    expect(delivery.attempts).toBe(2);
    expect(delivery.nextAttemptAt.getTime() - before2).toBeGreaterThanOrEqual(5 * 60_000 - 1000);

    const before3 = Date.now();
    await deliverWebhookDelivery(delivery as any);
    expect(delivery.attempts).toBe(3);
    expect(delivery.nextAttemptAt.getTime() - before3).toBeGreaterThanOrEqual(30 * 60_000 - 1000);

    await deliverWebhookDelivery(delivery as any);
    expect(delivery.attempts).toBe(4);
    expect(delivery.status).toBe('failed');
    expect(delivery.nextAttemptAt).toBeNull();
  });

  it('treats a network/timeout error the same as a non-2xx response', async () => {
    const sub = makeSubscription();
    const delivery = { id: 'del_1', webhookSubscriptionId: sub.id, eventType: 'task.created', payload: {}, attempts: 0 };
    deliveries.push(delivery);
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));

    await deliverWebhookDelivery(delivery as any);
    expect(delivery.status).toBe('pending');
    expect(delivery.attempts).toBe(1);
    expect(delivery.responseStatusCode).toBeNull();
  });

  it('clears needsAttention on a successful delivery', async () => {
    const sub = makeSubscription({ needsAttention: true });
    const delivery = { id: 'del_1', webhookSubscriptionId: sub.id, eventType: 'task.created', payload: {}, attempts: 0 };
    deliveries.push(delivery);
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    await deliverWebhookDelivery(delivery as any);
    expect(sub.needsAttention).toBe(false);
  });
});

describe('deliverWebhookDelivery — needsAttention', () => {
  it('flags the subscription after 5 CONSECUTIVE fully-failed deliveries', async () => {
    const sub = makeSubscription();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));

    // 4 prior deliveries, already fully failed (simulating past events), oldest first.
    for (let i = 0; i < 4; i++) {
      deliveries.push({ id: `old_${i}`, webhookSubscriptionId: sub.id, status: 'failed', createdAt: new Date(Date.now() - (10 - i) * 1000) });
    }

    // The 5th delivery fails all 4 of its own attempts.
    const delivery = { id: 'del_current', webhookSubscriptionId: sub.id, eventType: 'task.created', payload: {}, attempts: 3, createdAt: new Date() };
    deliveries.push(delivery);

    await deliverWebhookDelivery(delivery as any); // attempt 4 -> final -> status: failed

    expect(delivery.status).toBe('failed');
    expect(sub.needsAttention).toBe(true);
  });

  it('does NOT flag the subscription if one of the last 5 deliveries succeeded', async () => {
    const sub = makeSubscription();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));

    for (let i = 0; i < 4; i++) {
      deliveries.push({
        id: `old_${i}`,
        webhookSubscriptionId: sub.id,
        status: i === 0 ? 'success' : 'failed',
        createdAt: new Date(Date.now() - (10 - i) * 1000),
      });
    }
    const delivery = { id: 'del_current', webhookSubscriptionId: sub.id, eventType: 'task.created', payload: {}, attempts: 3, createdAt: new Date() };
    deliveries.push(delivery);

    await deliverWebhookDelivery(delivery as any);

    expect(sub.needsAttention).toBe(false);
  });
});

describe('runWebhookDeliveryRetries', () => {
  it('delivers every pending delivery whose nextAttemptAt has elapsed, and nothing else', async () => {
    const sub = makeSubscription();
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    const due = { id: 'due_1', webhookSubscriptionId: sub.id, eventType: 'task.created', payload: {}, attempts: 1, status: 'pending', nextAttemptAt: new Date(Date.now() - 1000), createdAt: new Date() };
    const notYetDue = { id: 'not_due', webhookSubscriptionId: sub.id, eventType: 'task.created', payload: {}, attempts: 1, status: 'pending', nextAttemptAt: new Date(Date.now() + 60_000), createdAt: new Date() };
    const alreadyDone = { id: 'done_1', webhookSubscriptionId: sub.id, eventType: 'task.created', payload: {}, attempts: 1, status: 'success', nextAttemptAt: null, createdAt: new Date() };
    deliveries.push(due, notYetDue, alreadyDone);

    const result = await runWebhookDeliveryRetries();

    expect(result.processed).toBe(1);
    expect(due.status).toBe('success');
    expect(notYetDue.status).toBe('pending');
  });
});
