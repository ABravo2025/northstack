import { beforeEach, describe, expect, it, vi } from 'vitest';

const tenants: any[] = [];
const subscriptions: any[] = [];

vi.mock('../src/lib/prisma.js', () => {
  const mockPrisma: any = {
    subscription: {
      findUniqueOrThrow: vi.fn(async ({ where }: any) => {
        const subscription = subscriptions.find((s) => s.tenantId === where.tenantId);
        const tenant = tenants.find((t) => t.id === subscription.tenantId);
        return { ...subscription, tenant: { name: tenant?.name ?? 'Test Tenant' } };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const subscription = subscriptions.find((s) => s.tenantId === where.tenantId);
        Object.assign(subscription, data);
        return subscription;
      }),
    },
    tenant: {
      update: vi.fn(async ({ where, data }: any) => {
        const tenant = tenants.find((t) => t.id === where.id);
        Object.assign(tenant, data);
        return tenant;
      }),
    },
    activityLogEntry: {
      create: vi.fn(async ({ data }: any) => data),
    },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  };
  return { default: mockPrisma };
});

import prisma from '../src/lib/prisma.js';
import { resolveProvider, syncSubscriptionAndTenant } from '../src/modules/tenant/subscriptionService.js';

describe('resolveProvider', () => {
  it('routes Argentina to mercadopago', () => {
    expect(resolveProvider({ country: 'Argentina' })).toBe('mercadopago');
  });

  it('routes every other country to paddle', () => {
    expect(resolveProvider({ country: 'United States' })).toBe('paddle');
    expect(resolveProvider({ country: 'Brazil' })).toBe('paddle');
  });

  it('defaults legacy tenants with no country on file to paddle', () => {
    expect(resolveProvider({ country: null })).toBe('paddle');
  });
});

describe('syncSubscriptionAndTenant', () => {
  beforeEach(() => {
    tenants.length = 0;
    subscriptions.length = 0;
    tenants.push({ id: 't1', name: 'Test Tenant', status: 'trialing', plan: null, trialEndsAt: new Date('2026-09-01'), gracePeriodEndsAt: null, lockedPriceCents: null });
    subscriptions.push({ id: 's1', tenantId: 't1', status: 'trialing', plan: 'starter', lockedPriceCents: 2900, lastActionByUserId: null, lastActionAt: null });
    (prisma.activityLogEntry.create as any).mockClear();
  });

  it('writes the mirrored fields to both Subscription and Tenant in the same call', async () => {
    const currentPeriodEnd = new Date('2026-10-01');
    await syncSubscriptionAndTenant({
      tenantId: 't1',
      status: 'active',
      provider: 'paddle',
      currentPeriodEnd,
    });

    expect(subscriptions[0].status).toBe('active');
    expect(subscriptions[0].provider).toBe('paddle');
    expect(subscriptions[0].currentPeriodEnd).toBe(currentPeriodEnd);
    // Tenant only has status/plan/trialEndsAt/gracePeriodEndsAt/lockedPriceCents — provider and
    // currentPeriodEnd have no mirror there.
    expect(tenants[0].status).toBe('active');
    expect(tenants[0].provider).toBeUndefined();
    expect(tenants[0].currentPeriodEnd).toBeUndefined();
  });

  it('leaves Tenant untouched when only Subscription-only fields change', async () => {
    await syncSubscriptionAndTenant({
      tenantId: 't1',
      paymentMethodBrand: 'visa',
      paymentMethodLast4: '4242',
    });

    expect(subscriptions[0].paymentMethodBrand).toBe('visa');
    expect(tenants[0].status).toBe('trialing'); // unchanged
    expect(tenants[0]).not.toHaveProperty('paymentMethodBrand');
  });

  it('logs an Activity entry attributed to changedByUserId when the caller passes one directly (self-serve)', async () => {
    await syncSubscriptionAndTenant({ tenantId: 't1', plan: 'growth', changedByUserId: 'u-self-serve' });

    expect(prisma.activityLogEntry.create).toHaveBeenCalledTimes(1);
    const data = (prisma.activityLogEntry.create as any).mock.calls[0][0].data;
    expect(data.entityType).toBe('subscription');
    expect(data.changedByUserId).toBe('u-self-serve');
  });

  it('attributes a webhook-confirmed change to lastActionByUserId when it is still fresh', async () => {
    subscriptions[0].lastActionByUserId = 'u-checkout';
    subscriptions[0].lastActionAt = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago

    await syncSubscriptionAndTenant({ tenantId: 't1', status: 'active' });

    expect(prisma.activityLogEntry.create).toHaveBeenCalledTimes(1);
    const data = (prisma.activityLogEntry.create as any).mock.calls[0][0].data;
    expect(data.changedByUserId).toBe('u-checkout');
  });

  it('does not attribute (and does not log) a webhook-confirmed change once lastActionByUserId is stale', async () => {
    subscriptions[0].lastActionByUserId = 'u-checkout';
    subscriptions[0].lastActionAt = new Date(Date.now() - 90 * 60 * 1000); // 90 min ago, past the 60 min window

    await syncSubscriptionAndTenant({ tenantId: 't1', status: 'active' });

    expect(prisma.activityLogEntry.create).not.toHaveBeenCalled();
  });

  it('does not log anything when there is neither a direct actor nor a fresh lastActionByUserId', async () => {
    await syncSubscriptionAndTenant({ tenantId: 't1', status: 'past_due' });

    expect(prisma.activityLogEntry.create).not.toHaveBeenCalled();
  });
});
