import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscriptions: any[] = [];
const planPrices: any[] = [
  { plan: 'starter', market: 'international', launchPriceCents: 2900 },
  { plan: 'growth', market: 'international', launchPriceCents: 7900 },
  { plan: 'starter', market: 'ar', launchPriceCents: 0 },
  { plan: 'growth', market: 'ar', launchPriceCents: 0 },
];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    subscription: {
      findUnique: vi.fn(async ({ where }: any) => subscriptions.find((s) => s.tenantId === where.tenantId) ?? null),
    },
    planPrice: {
      findFirst: vi.fn(async ({ where }: any) => planPrices.find((p) => p.plan === where.plan && p.market === where.market) ?? null),
    },
  },
}));

const { createNonCatalogTransactionMock, getUpdatePaymentMethodTransactionMock } = vi.hoisted(() => ({
  createNonCatalogTransactionMock: vi.fn(async () => ({ id: 'txn_new' })),
  getUpdatePaymentMethodTransactionMock: vi.fn(async () => ({ id: 'txn_update' })),
}));
vi.mock('../src/lib/paddle.js', () => ({
  createNonCatalogTransaction: createNonCatalogTransactionMock,
  getUpdatePaymentMethodTransaction: getUpdatePaymentMethodTransactionMock,
}));

const { createPreapprovalMock, updatePreapprovalMock } = vi.hoisted(() => ({
  createPreapprovalMock: vi.fn(async () => ({ id: 'preapproval_new', init_point: 'https://mp.example/checkout' })),
  updatePreapprovalMock: vi.fn(async () => ({})),
}));
vi.mock('../src/lib/mercadopago.js', () => ({
  createPreapproval: createPreapprovalMock,
  updatePreapproval: updatePreapprovalMock,
}));

import { startCheckout } from '../src/modules/tenant/checkoutService.js';

function resetMocks() {
  subscriptions.length = 0;
  createNonCatalogTransactionMock.mockClear();
  getUpdatePaymentMethodTransactionMock.mockClear();
  createPreapprovalMock.mockClear();
  updatePreapprovalMock.mockClear();
  // Real trial behavior (the thing most of these tests assert) only applies to real production
  // billing — see checkoutService.ts's isRealProductionBilling comment. Default to 'production'
  // here so existing trialDays:15 assertions keep testing that path; the dedicated
  // staging/sandbox describe block below overrides this per-test.
  process.env.PADDLE_ENV = 'production';
}

describe('startCheckout — subscribing for the first time (no provider yet)', () => {
  beforeEach(resetMocks);

  it('rejects when there is no Subscription row', async () => {
    const result = await startCheckout({ id: 't1', country: 'United States' }, { email: 'a@example.com' });
    expect(result.success).toBe(false);
  });

  it('creates a new Paddle transaction for an international tenant', async () => {
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: null, externalSubscriptionId: null });

    const result = await startCheckout({ id: 't1', country: 'United States' }, { email: 'a@example.com' });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('paddle');
    expect(result.paddleTransactionId).toBe('txn_new');
    expect(createNonCatalogTransactionMock).toHaveBeenCalledTimes(1);
    // Genuinely free for SIGNUP_TRIAL_DAYS (2026-08-20 correction) — a fresh subscribe always
    // gets a real trial, never charges immediately.
    expect(createNonCatalogTransactionMock).toHaveBeenCalledWith(expect.objectContaining({ trialDays: 15 }));
    expect(getUpdatePaymentMethodTransactionMock).not.toHaveBeenCalled();
  });

  it('creates a new Mercado Pago preapproval for an Argentina tenant', async () => {
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: null, externalSubscriptionId: null });
    planPrices.find((p) => p.plan === 'starter' && p.market === 'ar')!.launchPriceCents = 5000; // real price, not the AR placeholder

    const result = await startCheckout({ id: 't1', country: 'Argentina' }, { email: 'a@example.com' });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('mercadopago');
    expect(result.initPoint).toBe('https://mp.example/checkout');
    expect(createPreapprovalMock).toHaveBeenCalledTimes(1);
    expect(createPreapprovalMock).toHaveBeenCalledWith(expect.objectContaining({ trialDays: 15 }));
  });

  it('rejects when the market price is the AR placeholder (0 cents)', async () => {
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'growth', provider: null, externalSubscriptionId: null });

    const result = await startCheckout({ id: 't1', country: 'Argentina' }, { email: 'a@example.com' });

    expect(result.success).toBe(false);
    expect(createPreapprovalMock).not.toHaveBeenCalled();
  });
});

describe('startCheckout — updating payment method on an already-active subscription', () => {
  beforeEach(resetMocks);

  it('Paddle: calls getUpdatePaymentMethodTransaction, never creates a second subscription', async () => {
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: 'paddle', externalSubscriptionId: 'sub_paddle_1' });

    const result = await startCheckout({ id: 't1', country: 'United States' }, { email: 'a@example.com' });

    expect(result.success).toBe(true);
    expect(result.paddleTransactionId).toBe('txn_update');
    expect(getUpdatePaymentMethodTransactionMock).toHaveBeenCalledWith('sub_paddle_1');
    expect(createNonCatalogTransactionMock).not.toHaveBeenCalled();
  });

  it('Mercado Pago: cancels the old preapproval, then creates a fresh one', async () => {
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: 'mercadopago', externalSubscriptionId: 'preapproval_old' });
    planPrices.find((p) => p.plan === 'starter' && p.market === 'ar')!.launchPriceCents = 5000;

    const result = await startCheckout({ id: 't1', country: 'Argentina' }, { email: 'a@example.com' });

    expect(result.success).toBe(true);
    expect(result.initPoint).toBe('https://mp.example/checkout');
    expect(updatePreapprovalMock).toHaveBeenCalledWith('preapproval_old', { status: 'cancelled' });
    expect(createPreapprovalMock).toHaveBeenCalledTimes(1);
    // Never a second free trial for someone just swapping their card on an existing subscription.
    expect(createPreapprovalMock).toHaveBeenCalledWith(expect.objectContaining({ trialDays: undefined }));
  });

  it('rejects if the subscription has a provider but no externalSubscriptionId (inconsistent state)', async () => {
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: 'paddle', externalSubscriptionId: null });

    const result = await startCheckout({ id: 't1', country: 'United States' }, { email: 'a@example.com' });

    expect(result.success).toBe(false);
    expect(getUpdatePaymentMethodTransactionMock).not.toHaveBeenCalled();
  });
});

describe('startCheckout — outside real production billing (staging/local dev)', () => {
  beforeEach(resetMocks);

  it('charges a fresh Paddle subscribe immediately instead of granting a trial when PADDLE_ENV is not production', async () => {
    delete process.env.PADDLE_ENV;
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: null, externalSubscriptionId: null });

    const result = await startCheckout({ id: 't1', country: 'United States' }, { email: 'a@example.com' });

    expect(result.success).toBe(true);
    expect(createNonCatalogTransactionMock).toHaveBeenCalledWith(expect.objectContaining({ trialDays: undefined }));
  });

  it('charges a fresh Mercado Pago subscribe immediately instead of granting a trial when PADDLE_ENV is not production', async () => {
    process.env.PADDLE_ENV = 'sandbox';
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: null, externalSubscriptionId: null });
    planPrices.find((p) => p.plan === 'starter' && p.market === 'ar')!.launchPriceCents = 5000;

    const result = await startCheckout({ id: 't1', country: 'Argentina' }, { email: 'a@example.com' });

    expect(result.success).toBe(true);
    expect(createPreapprovalMock).toHaveBeenCalledWith(expect.objectContaining({ trialDays: undefined }));
  });
});
