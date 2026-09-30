import { beforeEach, describe, expect, it, vi } from 'vitest';

const tenants: any[] = [];
const subscriptions: any[] = [];
const planPrices: any[] = [
  { id: 'pp_intl_starter', plan: 'starter', market: 'international', launchPriceCents: 1900, extraSeatPriceCents: 400, dodoProductId: 'pdt_starter', dodoExtraSeatAddonId: 'adn_seat' },
  { id: 'pp_intl_growth', plan: 'growth', market: 'international', launchPriceCents: 3900, extraSeatPriceCents: 400, dodoProductId: 'pdt_growth', dodoExtraSeatAddonId: 'adn_seat' },
  { id: 'pp_ar_starter', plan: 'starter', market: 'ar', launchPriceCents: 0, extraSeatPriceCents: 0, dodoProductId: null }, // not sold yet (0 in src/config/pricing.ts)
  { id: 'pp_ar_growth', plan: 'growth', market: 'ar', launchPriceCents: 0, extraSeatPriceCents: 0, dodoProductId: null },
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
const { changeSubscriptionPlanMock, cancelDodoSubscriptionMock, removeScheduledCancellationMock, cancelScheduledPlanChangeMock } = vi.hoisted(() => ({
  changeSubscriptionPlanMock: vi.fn(async () => ({})),
  cancelScheduledPlanChangeMock: vi.fn(async () => {}),
  cancelDodoSubscriptionMock: vi.fn(async () => ({})),
  removeScheduledCancellationMock: vi.fn(async () => ({})),
}));
vi.mock('../src/lib/dodopayments.js', () => ({
  changeSubscriptionPlan: changeSubscriptionPlanMock,
  cancelScheduledPlanChange: cancelScheduledPlanChangeMock,
  cancelSubscription: cancelDodoSubscriptionMock,
  removeScheduledCancellation: removeScheduledCancellationMock,
}));

const { updatePreapprovalMock, createPreapprovalMock } = vi.hoisted(() => ({
  updatePreapprovalMock: vi.fn(async () => ({})),
  createPreapprovalMock: vi.fn(async (_input: any) => ({ id: 'pre_upgrade', init_point: 'https://mp.example/upgrade' })),
}));
vi.mock('../src/lib/mercadopago.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/mercadopago.js')>()),
  updatePreapproval: updatePreapprovalMock,
  createPreapproval: createPreapprovalMock,
}));

// Current-price lookup (planPriceService.ts, covered in planPriceService.test.ts) stubbed over the
// planPrices fixture; 0 = not sold in that market, same as the real one.
vi.mock('../src/modules/tenant/planPriceService.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/modules/tenant/planPriceService.js')>()),
  currentPlanPrice: vi.fn(async (plan: string, market: string) => {
    const row = planPrices.find((p) => p.plan === plan && p.market === market);
    return row && row.launchPriceCents > 0 ? row : null;
  }),
  lockedPlanPrice: vi.fn(async (sub: { planPriceId: string }) => planPrices.find((p) => p.id === sub.planPriceId) ?? null),
}));

import { changePlan, requestCancellation, resumeSubscription } from '../src/modules/tenant/subscriptionSelfServeService.js';

function resetMocks() {
  tenants.length = 0;
  subscriptions.length = 0;
  changeSubscriptionPlanMock.mockClear();
  cancelDodoSubscriptionMock.mockClear();
  removeScheduledCancellationMock.mockClear();
  updatePreapprovalMock.mockClear();
  createPreapprovalMock.mockClear();
  cancelScheduledPlanChangeMock.mockClear();
  planPrices.find((p) => p.id === 'pp_ar_starter')!.launchPriceCents = 0;
  planPrices.find((p) => p.id === 'pp_ar_growth')!.launchPriceCents = 0;
}

describe('changePlan', () => {
  beforeEach(resetMocks);

  const owner = { id: 'u1', email: 'owner@example.com' };
  const DAY = 24 * 60 * 60 * 1000;

  function dodoSub(overrides: Record<string, unknown> = {}) {
    tenants.push({ id: 't1', plan: 'starter', lockedPriceCents: 1900 });
    subscriptions.push({
      id: 'sub1', tenantId: 't1', provider: 'dodopayments', externalSubscriptionId: 'sub_1', plan: 'starter',
      status: 'active', currency: 'USD', lockedPriceCents: 1900, planPriceId: 'pp_intl_starter', pendingPlanPriceId: null,
      currentPeriodEnd: new Date(Date.now() + 20 * DAY), ...overrides,
    });
  }

  function mpSub(overrides: Record<string, unknown> = {}) {
    planPrices.find((p) => p.id === 'pp_ar_starter')!.launchPriceCents = 3_000_000;
    planPrices.find((p) => p.id === 'pp_ar_growth')!.launchPriceCents = 6_000_000;
    tenants.push({ id: 't1', plan: 'starter', lockedPriceCents: 3_000_000 });
    subscriptions.push({
      id: 'sub1', tenantId: 't1', provider: 'mercadopago', externalSubscriptionId: 'pre_1', plan: 'starter',
      status: 'active', currency: 'ARS', lockedPriceCents: 3_000_000, planPriceId: 'pp_ar_starter', pendingPlanPriceId: null,
      currentPeriodEnd: new Date(Date.now() + 20 * DAY), ...overrides,
    });
  }

  it('rejects scale — no self-serve checkout for it', async () => {
    const result = await changePlan('t1', 'scale' as any, owner);
    expect(result.success).toBe(false);
  });

  it('rejects when the tenant has no provider attached yet', async () => {
    tenants.push({ id: 't1', plan: 'starter' });
    subscriptions.push({ tenantId: 't1', provider: null, externalSubscriptionId: null, plan: 'starter' });

    const result = await changePlan('t1', 'growth', owner);
    expect(result.success).toBe(false);
    expect(changeSubscriptionPlanMock).not.toHaveBeenCalled();
  });

  it('rejects when the market price is not set (0 in the config)', async () => {
    tenants.push({ id: 't1', plan: 'starter' });
    subscriptions.push({ tenantId: 't1', provider: 'mercadopago', externalSubscriptionId: 'pre_2', plan: 'starter', status: 'active' });
    expect((await changePlan('t1', 'growth', owner)).success).toBe(false);
    expect(updatePreapprovalMock).not.toHaveBeenCalled();
  });

  describe('during the trial', () => {
    it('Dodo: switches now, nothing charged', async () => {
      dodoSub({ status: 'trialing' });

      const result = await changePlan('t1', 'growth', owner);

      expect(result).toEqual({ success: true, outcome: 'changed' });
      expect(changeSubscriptionPlanMock).toHaveBeenCalledWith('sub_1', expect.objectContaining({ productId: 'pdt_growth', mode: 'now_no_charge' }));
      expect(subscriptions[0]).toMatchObject({ plan: 'growth', lockedPriceCents: 3900, planPriceId: 'pp_intl_growth' });
      expect(tenants[0].plan).toBe('growth');
    });

    it('Mercado Pago: updates the recurring amount, switches now', async () => {
      mpSub({ status: 'trialing' });

      await changePlan('t1', 'growth', owner);

      expect(updatePreapprovalMock).toHaveBeenCalledWith('pre_1', { transactionAmount: 60_000 });
      expect(createPreapprovalMock).not.toHaveBeenCalled();
      expect(subscriptions[0].plan).toBe('growth');
    });
  });

  describe('upgrade (active)', () => {
    it('Dodo: charges the full Growth price now, restarting the cycle; the plan only switches once the charge is confirmed', async () => {
      dodoSub();

      const result = await changePlan('t1', 'growth', owner);

      expect(result).toEqual({ success: true, outcome: 'charging' });
      expect(changeSubscriptionPlanMock).toHaveBeenCalledWith('sub_1', {
        productId: 'pdt_growth',
        extraSeatAddonId: 'adn_seat',
        extraSeats: 0,
        mode: 'upgrade_now',
        metadata: { subscriptionId: 'sub1', planPriceId: 'pp_intl_growth', planChange: 'upgrade' },
      });
      expect(subscriptions[0].plan).toBe('starter');
      expect(tenants[0].plan).toBe('starter');
    });

    it('Mercado Pago: creates a Growth preapproval charged now for the payer to confirm; nothing switches yet', async () => {
      mpSub();

      const result = await changePlan('t1', 'growth', owner);

      expect(result).toEqual({ success: true, outcome: 'charging', initPoint: 'https://mp.example/upgrade' });
      expect(createPreapprovalMock).toHaveBeenCalledWith(expect.objectContaining({
        externalReference: 'sub1:pp_ar_growth',
        payerEmail: 'owner@example.com',
        transactionAmount: 60_000,
      }));
      // No free trial — MP charges it on authorization.
      expect(createPreapprovalMock.mock.calls[0][0]).not.toHaveProperty('trialDays', expect.anything());
      expect(updatePreapprovalMock).not.toHaveBeenCalled();
      expect(subscriptions[0].plan).toBe('starter');
    });

    it('is refused while payment is overdue', async () => {
      dodoSub({ status: 'past_due' });
      expect((await changePlan('t1', 'growth', owner)).success).toBe(false);
      expect(changeSubscriptionPlanMock).not.toHaveBeenCalled();
    });
  });

  describe('downgrade (active)', () => {
    it('Dodo: schedules the change for the next billing date, keeps Growth until then', async () => {
      dodoSub({ plan: 'growth', lockedPriceCents: 3900, planPriceId: 'pp_intl_growth' });
      tenants[0].plan = 'growth';

      const result = await changePlan('t1', 'starter', owner);

      expect(result).toEqual({ success: true, outcome: 'scheduled', effectiveAt: subscriptions[0].currentPeriodEnd });
      expect(changeSubscriptionPlanMock).toHaveBeenCalledWith('sub_1', expect.objectContaining({ productId: 'pdt_starter', mode: 'at_next_billing' }));
      expect(subscriptions[0]).toMatchObject({ plan: 'growth', pendingPlanPriceId: 'pp_intl_starter' });
      expect(tenants[0].plan).toBe('growth');
    });

    it('Mercado Pago: lowers the next charge, keeps Growth until then', async () => {
      mpSub({ plan: 'growth', lockedPriceCents: 6_000_000, planPriceId: 'pp_ar_growth' });

      await changePlan('t1', 'starter', owner);

      expect(updatePreapprovalMock).toHaveBeenCalledWith('pre_1', { transactionAmount: 30_000 });
      expect(subscriptions[0]).toMatchObject({ plan: 'growth', pendingPlanPriceId: 'pp_ar_starter' });
    });
  });

  describe('choosing the current plan again', () => {
    it('cancels a scheduled Dodo downgrade', async () => {
      dodoSub({ plan: 'growth', planPriceId: 'pp_intl_growth', pendingPlanPriceId: 'pp_intl_starter' });

      const result = await changePlan('t1', 'growth', owner);

      expect(result).toEqual({ success: true, outcome: 'schedule_cancelled' });
      expect(cancelScheduledPlanChangeMock).toHaveBeenCalledWith('sub_1');
      expect(subscriptions[0].pendingPlanPriceId).toBeNull();
    });

    it('cancels a scheduled Mercado Pago downgrade by restoring the current amount', async () => {
      mpSub({ plan: 'growth', lockedPriceCents: 6_000_000, planPriceId: 'pp_ar_growth', pendingPlanPriceId: 'pp_ar_starter' });

      await changePlan('t1', 'growth', owner);

      expect(updatePreapprovalMock).toHaveBeenCalledWith('pre_1', { transactionAmount: 60_000 });
      expect(subscriptions[0].pendingPlanPriceId).toBeNull();
    });

    it('is refused when nothing is scheduled', async () => {
      dodoSub();
      expect((await changePlan('t1', 'starter', owner)).success).toBe(false);
    });
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
