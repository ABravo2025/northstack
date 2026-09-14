import { beforeEach, describe, expect, it, vi } from 'vitest';

const tenants: any[] = [];
const subscriptions: any[] = [];
const planPrices: any[] = [
  { plan: 'starter', market: 'international', launchPriceCents: 2900, dodoProductId: 'pdt_starter' },
  { plan: 'growth', market: 'international', launchPriceCents: 7900, dodoProductId: 'pdt_growth' },
  { plan: 'starter', market: 'ar', launchPriceCents: 0, dodoProductId: null }, // placeholder, mirrors seed-plan-prices.ts
  { plan: 'growth', market: 'ar', launchPriceCents: 0, dodoProductId: null },
];

vi.mock('../src/lib/prisma.js', () => {
  const mockPrisma: any = {
    subscription: {
      findUnique: vi.fn(async ({ where }: any) => subscriptions.find((s) => s.tenantId === where.tenantId) ?? null),
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
    planPrice: {
      findFirst: vi.fn(async ({ where }: any) => planPrices.find((p) => p.plan === where.plan && p.market === where.market) ?? null),
    },
    activityLogEntry: {
      create: vi.fn(async ({ data }: any) => data),
    },
    // seatService.ts's countActiveSeats — 0 active seats by default, see checkoutService.test.ts's
    // matching comment.
    user: {
      count: vi.fn(async () => 0),
    },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  };
  return { default: mockPrisma };
});

// vi.mock factories are hoisted above every top-level const, so the mock functions they
// reference must be created via vi.hoisted() rather than plain consts above these calls.
const { changeSubscriptionPlanMock, cancelDodoSubscriptionMock, removeScheduledCancellationMock } = vi.hoisted(() => ({
  changeSubscriptionPlanMock: vi.fn(async () => ({})),
  cancelDodoSubscriptionMock: vi.fn(async () => ({})),
  removeScheduledCancellationMock: vi.fn(async () => ({})),
}));
vi.mock('../src/lib/dodopayments.js', () => ({
  changeSubscriptionPlan: changeSubscriptionPlanMock,
  cancelSubscription: cancelDodoSubscriptionMock,
  removeScheduledCancellation: removeScheduledCancellationMock,
}));

const { updatePreapprovalMock } = vi.hoisted(() => ({ updatePreapprovalMock: vi.fn(async () => ({})) }));
vi.mock('../src/lib/mercadopago.js', () => ({
  updatePreapproval: updatePreapprovalMock,
}));

import { changePlan, requestCancellation, resumeSubscription } from '../src/modules/tenant/subscriptionSelfServeService.js';

function resetMocks() {
  tenants.length = 0;
  subscriptions.length = 0;
  changeSubscriptionPlanMock.mockClear();
  cancelDodoSubscriptionMock.mockClear();
  removeScheduledCancellationMock.mockClear();
  updatePreapprovalMock.mockClear();
}

describe('changePlan', () => {
  beforeEach(resetMocks);

  it('rejects scale — no self-serve checkout for it', async () => {
    const result = await changePlan('t1', 'scale' as any, 'u1');
    expect(result.success).toBe(false);
  });

  it('rejects when the tenant has no provider attached yet', async () => {
    tenants.push({ id: 't1', plan: 'starter' });
    subscriptions.push({ tenantId: 't1', provider: null, externalSubscriptionId: null, plan: 'starter' });

    const result = await changePlan('t1', 'growth', 'u1');
    expect(result.success).toBe(false);
    expect(changeSubscriptionPlanMock).not.toHaveBeenCalled();
  });

  it('calls the Dodo wrapper with the new plan\'s dodoProductId and updates plan/lockedPriceCents immediately on success', async () => {
    tenants.push({ id: 't1', plan: 'starter', lockedPriceCents: 2900 });
    subscriptions.push({
      tenantId: 't1',
      provider: 'dodopayments',
      externalSubscriptionId: 'sub_1',
      plan: 'starter',
      currency: 'USD',
    });

    const result = await changePlan('t1', 'growth', 'u1');

    expect(result.success).toBe(true);
    expect(changeSubscriptionPlanMock).toHaveBeenCalledWith('sub_1', { productId: 'pdt_growth' });
    expect(updatePreapprovalMock).not.toHaveBeenCalled();
    expect(subscriptions[0].plan).toBe('growth');
    expect(subscriptions[0].lockedPriceCents).toBe(7900);
    expect(tenants[0].plan).toBe('growth');
    expect(tenants[0].lockedPriceCents).toBe(7900);
  });

  it('calls the Mercado Pago wrapper (transactionAmount in decimal ARS, not cents)', async () => {
    tenants.push({ id: 't1', plan: 'starter' });
    subscriptions.push({
      tenantId: 't1',
      provider: 'mercadopago',
      externalSubscriptionId: 'preapproval_1',
      plan: 'starter',
      currency: 'ARS',
    });
    // AR pricing is placeholder (0 cents) per seed-plan-prices.ts — bump it here so this test
    // exercises the success path, not the "pricing not available" guard.
    planPrices.find((p) => p.plan === 'growth' && p.market === 'ar')!.launchPriceCents = 5000;

    const result = await changePlan('t1', 'growth', 'u1');

    expect(result.success).toBe(true);
    expect(updatePreapprovalMock).toHaveBeenCalledWith('preapproval_1', { transactionAmount: 50 });
    expect(changeSubscriptionPlanMock).not.toHaveBeenCalled();
  });

  it('rejects when the market price is the AR placeholder (0 cents)', async () => {
    tenants.push({ id: 't1', plan: 'starter' });
    subscriptions.push({ tenantId: 't1', provider: 'mercadopago', externalSubscriptionId: 'preapproval_2', plan: 'starter' });

    const result = await changePlan('t1', 'starter', 'u1');
    expect(result.success).toBe(false);
    expect(updatePreapprovalMock).not.toHaveBeenCalled();
  });
});

describe('requestCancellation', () => {
  beforeEach(resetMocks);

  it('rejects when there is no active paid subscription', async () => {
    subscriptions.push({ tenantId: 't1', provider: null, currentPeriodEnd: null });
    const result = await requestCancellation('t1', undefined, 'u1');
    expect(result.success).toBe(false);
  });

  it('rejects a second cancellation while one is already scheduled', async () => {
    subscriptions.push({
      tenantId: 't1',
      provider: 'dodopayments',
      externalSubscriptionId: 'sub_1',
      currentPeriodEnd: new Date('2026-09-01'),
      cancelledAt: new Date('2026-08-01'),
    });
    const result = await requestCancellation('t1', undefined, 'u1');
    expect(result.success).toBe(false);
    expect(cancelDodoSubscriptionMock).not.toHaveBeenCalled();
  });

  it('Dodo: calls the native scheduled cancellation and never touches Tenant.status', async () => {
    tenants.push({ id: 't1', status: 'active' });
    const periodEnd = new Date('2026-09-01');
    subscriptions.push({
      tenantId: 't1',
      provider: 'dodopayments',
      externalSubscriptionId: 'sub_1',
      currentPeriodEnd: periodEnd,
      cancelledAt: null,
    });

    const result = await requestCancellation('t1', 'too expensive', 'u1');

    expect(result.success).toBe(true);
    expect(cancelDodoSubscriptionMock).toHaveBeenCalledWith('sub_1');
    expect(subscriptions[0].cancelledAt).toBeInstanceOf(Date);
    expect(subscriptions[0].cancellationEffectiveAt).toBe(periodEnd);
    expect(subscriptions[0].cancellationReason).toBe('too expensive');
    // Not flipped yet — only the cron/webhook does that once cancellationEffectiveAt arrives.
    expect(tenants[0].status).toBe('active');
  });

  it('Mercado Pago: never calls the provider — the cron sweep does it later', async () => {
    tenants.push({ id: 't1', status: 'active' });
    subscriptions.push({
      tenantId: 't1',
      provider: 'mercadopago',
      externalSubscriptionId: 'preapproval_1',
      currentPeriodEnd: new Date('2026-09-01'),
      cancelledAt: null,
    });

    const result = await requestCancellation('t1', undefined, 'u1');

    expect(result.success).toBe(true);
    expect(cancelDodoSubscriptionMock).not.toHaveBeenCalled();
    expect(subscriptions[0].cancelledAt).toBeInstanceOf(Date);
  });
});

describe('resumeSubscription', () => {
  beforeEach(resetMocks);

  it('rejects when there is nothing pending to resume', async () => {
    subscriptions.push({ tenantId: 't1', cancelledAt: null, cancellationEffectiveAt: null });
    const result = await resumeSubscription('t1', 'u1');
    expect(result.success).toBe(false);
  });

  it('rejects once cancellationEffectiveAt has already passed', async () => {
    subscriptions.push({
      tenantId: 't1',
      cancelledAt: new Date('2026-08-01'),
      cancellationEffectiveAt: new Date('2026-08-02'), // in the past relative to "now" in this test run
    });
    const result = await resumeSubscription('t1', 'u1');
    expect(result.success).toBe(false);
  });

  it('Dodo: clears the scheduled cancellation on Dodo too, not just locally', async () => {
    subscriptions.push({
      tenantId: 't1',
      provider: 'dodopayments',
      externalSubscriptionId: 'sub_1',
      cancelledAt: new Date(),
      cancellationEffectiveAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const result = await resumeSubscription('t1', 'u1');

    expect(result.success).toBe(true);
    expect(removeScheduledCancellationMock).toHaveBeenCalledWith('sub_1');
    expect(subscriptions[0].cancelledAt).toBeNull();
    expect(subscriptions[0].cancellationEffectiveAt).toBeNull();
  });

  it('Mercado Pago: never calls the provider — nothing was ever scheduled there to undo', async () => {
    subscriptions.push({
      tenantId: 't1',
      provider: 'mercadopago',
      externalSubscriptionId: 'preapproval_1',
      cancelledAt: new Date(),
      cancellationEffectiveAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const result = await resumeSubscription('t1', 'u1');

    expect(result.success).toBe(true);
    expect(removeScheduledCancellationMock).not.toHaveBeenCalled();
  });
});
