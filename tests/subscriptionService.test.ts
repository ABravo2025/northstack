import { beforeEach, describe, expect, it, vi } from 'vitest';

const tenants: any[] = [];
const subscriptions: any[] = [];

vi.mock('../src/lib/prisma.js', () => {
  const mockPrisma: any = {
    subscription: {
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
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  };
  return { default: mockPrisma };
});

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
    tenants.push({ id: 't1', status: 'trialing', plan: null, trialEndsAt: new Date('2026-09-01'), gracePeriodEndsAt: null, lockedPriceCents: null });
    subscriptions.push({ tenantId: 't1', status: 'trialing', plan: 'starter', lockedPriceCents: 2900 });
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
});
