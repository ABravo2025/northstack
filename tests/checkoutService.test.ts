import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscriptions: any[] = [];
const planPrices: any[] = [
  { id: 'pp_intl_starter', plan: 'starter', market: 'international', launchPriceCents: 1900, extraSeatPriceCents: 400, dodoProductId: 'pdt_starter', dodoExtraSeatAddonId: 'adn_seat' },
  { id: 'pp_intl_growth', plan: 'growth', market: 'international', launchPriceCents: 3900, extraSeatPriceCents: 400, dodoProductId: 'pdt_growth', dodoExtraSeatAddonId: 'adn_seat' },
  { id: 'pp_ar_starter', plan: 'starter', market: 'ar', launchPriceCents: 0, extraSeatPriceCents: 0, dodoProductId: null },
  { id: 'pp_ar_growth', plan: 'growth', market: 'ar', launchPriceCents: 0, extraSeatPriceCents: 0, dodoProductId: null },
];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    subscription: {
      findUnique: vi.fn(async ({ where }: any) => subscriptions.find((s) => s.tenantId === where.tenantId) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const subscription = subscriptions.find((s) => s.tenantId === where.tenantId);
        if (subscription) Object.assign(subscription, data);
        return subscription;
      }),
    },
    planPrice: {
      findFirst: vi.fn(async ({ where }: any) => planPrices.find((p) => p.plan === where.plan && p.market === where.market) ?? null),
    },
    // seatService.ts's countActiveSeats — 0 active seats by default so existing assertions (built
    // around launchPriceCents alone) don't need to account for an extra-seat surcharge.
    user: {
      count: vi.fn(async () => 0),
    },
  },
}));

const { createCheckoutSessionMock, getCustomerPortalUrlMock } = vi.hoisted(() => ({
  createCheckoutSessionMock: vi.fn(async () => ({ checkoutUrl: 'https://checkout.dodopayments.com/cks_new' })),
  getCustomerPortalUrlMock: vi.fn(async () => 'https://checkout.dodopayments.com/portal_session'),
}));
vi.mock('../src/lib/dodopayments.js', () => ({
  createCheckoutSession: createCheckoutSessionMock,
  getCustomerPortalUrl: getCustomerPortalUrlMock,
}));

const { createPreapprovalMock, updatePreapprovalMock } = vi.hoisted(() => ({
  createPreapprovalMock: vi.fn(async () => ({ id: 'preapproval_new', init_point: 'https://mp.example/checkout' })),
  updatePreapprovalMock: vi.fn(async () => ({})),
}));
vi.mock('../src/lib/mercadopago.js', () => ({
  createPreapproval: createPreapprovalMock,
  updatePreapproval: updatePreapprovalMock,
  buildExternalReference: (subscriptionId: string, planPriceId: string) => `${subscriptionId}:${planPriceId}`,
}));

// Neither provider's checkout writes the plan any more (Mercado Pago stopped 2026-09-26, the plan
// now rides in external_reference) — kept mocked only to assert it stays uncalled.
const { updateTenantPlanMock } = vi.hoisted(() => ({
  updateTenantPlanMock: vi.fn(async () => ({ success: true })),
}));
vi.mock('../src/modules/tenant/planService.js', () => ({
  updateTenantPlan: updateTenantPlanMock,
  CURRENT_PLAN_PRICES_CENTS: { starter: 1900, growth: 3900 },
}));

// Price lookups come from planPriceService.ts (config sync covered in planPriceService.test.ts) —
// stubbed here over the planPrices fixture above. 0 = not sold in that market, same as the real one.
const { currentPlanPriceMock, lockedPlanPriceMock } = vi.hoisted(() => ({
  currentPlanPriceMock: vi.fn(),
  lockedPlanPriceMock: vi.fn(),
}));
vi.mock('../src/modules/tenant/planPriceService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/modules/tenant/planPriceService.js')>();
  return { ...actual, currentPlanPrice: currentPlanPriceMock, lockedPlanPrice: lockedPlanPriceMock };
});
function priceRow(plan: string, market: string) {
  const row = planPrices.find((p) => p.plan === plan && p.market === market);
  return row && row.launchPriceCents > 0 ? row : null;
}
currentPlanPriceMock.mockImplementation(async (plan: string, market: string) => priceRow(plan, market));
lockedPlanPriceMock.mockImplementation(async (sub: { plan: string }, market: string) => priceRow(sub.plan, market));

import { startCheckout } from '../src/modules/tenant/checkoutService.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Default: 15 whole days left, same as a tenant checking out right after signup — most tests
// don't care about the exact trial-remaining math, only the dedicated describe block below does.
function tenant(overrides: { id: string; country: string | null; trialEndsAt?: Date | null }) {
  return { trialEndsAt: new Date(Date.now() + 15 * DAY_MS), ...overrides };
}

function resetMocks() {
  subscriptions.length = 0;
  createCheckoutSessionMock.mockClear();
  getCustomerPortalUrlMock.mockClear();
  createPreapprovalMock.mockClear();
  updatePreapprovalMock.mockClear();
  updateTenantPlanMock.mockClear();
  currentPlanPriceMock.mockClear();
  lockedPlanPriceMock.mockClear();
  // Real trial behavior (the thing most of these tests assert) only applies to real production
  // billing — see checkoutService.ts's isRealProductionBilling comment. Default to 'production'
  // here so existing trialDays:15 assertions keep testing that path; the dedicated
  // staging/sandbox describe block below overrides this per-test.
  process.env.BILLING_ENV = 'production';
}

describe('startCheckout — subscribing for the first time (no provider yet)', () => {
  beforeEach(resetMocks);

  it('rejects when there is no Subscription row', async () => {
    const result = await startCheckout(tenant({ id: 't1', country: 'United States' }), { id: 'u1', email: 'a@example.com' });
    expect(result.success).toBe(false);
  });

  it('creates a new Dodo Payments checkout session for an international tenant', async () => {
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: null, externalSubscriptionId: null });

    const result = await startCheckout(tenant({ id: 't1', country: 'United States' }), { id: 'u1', email: 'a@example.com' }, 'starter');

    expect(result.success).toBe(true);
    expect(result.provider).toBe('dodopayments');
    expect(result.initPoint).toBe('https://checkout.dodopayments.com/cks_new');
    expect(createCheckoutSessionMock).toHaveBeenCalledTimes(1);
    // Genuinely free for SIGNUP_TRIAL_DAYS (2026-08-20 correction) — a fresh subscribe always
    // gets a real trial, never charges immediately.
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ trialDays: 15, productId: 'pdt_starter', extraSeatAddonId: 'adn_seat', planPriceId: 'pp_intl_starter' }),
    );
    expect(getCustomerPortalUrlMock).not.toHaveBeenCalled();
  });

  it('creates a new Mercado Pago preapproval for an Argentina tenant', async () => {
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: null, externalSubscriptionId: null });
    planPrices.find((p) => p.plan === 'starter' && p.market === 'ar')!.launchPriceCents = 5000; // real price, not the AR placeholder

    const result = await startCheckout(tenant({ id: 't1', country: 'Argentina' }), { id: 'u1', email: 'a@example.com' }, 'starter');

    expect(result.success).toBe(true);
    expect(result.provider).toBe('mercadopago');
    expect(result.initPoint).toBe('https://mp.example/checkout');
    expect(createPreapprovalMock).toHaveBeenCalledTimes(1);
    expect(createPreapprovalMock).toHaveBeenCalledWith(
      expect.objectContaining({ trialDays: 15, externalReference: 'sub1:pp_ar_starter', transactionAmount: 50 }),
    );
    // The plan is only written once the webhook confirms (mercadoPagoWebhookService.ts).
    expect(updateTenantPlanMock).not.toHaveBeenCalled();
  });

  it('returns the payer to /settings/billing on APP_BASE_URL, not a hardcoded production URL', async () => {
    process.env.APP_BASE_URL = 'https://staging.example.com';
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: null, externalSubscriptionId: null });
    planPrices.find((p) => p.plan === 'starter' && p.market === 'ar')!.launchPriceCents = 5000;

    await startCheckout(tenant({ id: 't1', country: 'Argentina' }), { id: 'u1', email: 'a@example.com' }, 'starter');
    await startCheckout(tenant({ id: 't1', country: 'United States' }), { id: 'u1', email: 'a@example.com' }, 'starter');

    expect(createPreapprovalMock).toHaveBeenCalledWith(expect.objectContaining({ backUrl: 'https://staging.example.com/settings/billing' }));
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(expect.objectContaining({ returnUrl: 'https://staging.example.com/settings/billing' }));
    delete process.env.APP_BASE_URL;
  });

  it('rejects when the market price is the AR placeholder (0 cents)', async () => {
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'growth', provider: null, externalSubscriptionId: null });

    const result = await startCheckout(tenant({ id: 't1', country: 'Argentina' }), { id: 'u1', email: 'a@example.com' }, 'growth');

    expect(result.success).toBe(false);
    expect(createPreapprovalMock).not.toHaveBeenCalled();
  });

  it('rejects when no plan is chosen yet', async () => {
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: null, externalSubscriptionId: null });

    const result = await startCheckout(tenant({ id: 't1', country: 'United States' }), { id: 'u1', email: 'a@example.com' });

    expect(result.success).toBe(false);
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('throws (not a soft error) when the international plan price has no dodoProductId — provisioning script never ran', async () => {
    planPrices.find((p) => p.plan === 'starter' && p.market === 'international')!.dodoProductId = null;
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: null, externalSubscriptionId: null });

    await expect(
      startCheckout(tenant({ id: 't1', country: 'United States' }), { id: 'u1', email: 'a@example.com' }, 'starter'),
    ).rejects.toThrow('dodoProductId');

    planPrices.find((p) => p.plan === 'starter' && p.market === 'international')!.dodoProductId = 'pdt_starter';
  });
});

describe('startCheckout — updating payment method on an already-active subscription', () => {
  beforeEach(resetMocks);

  it('Dodo: calls getCustomerPortalUrl, never creates a second subscription', async () => {
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: 'dodopayments', externalSubscriptionId: 'sub_dodo_1' });

    const result = await startCheckout(tenant({ id: 't1', country: 'United States' }), { id: 'u1', email: 'a@example.com' });

    expect(result.success).toBe(true);
    expect(result.initPoint).toBe('https://checkout.dodopayments.com/portal_session');
    expect(getCustomerPortalUrlMock).toHaveBeenCalledWith('sub_dodo_1', expect.any(String));
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it('Mercado Pago: creates a fresh preapproval and leaves the old one running until the new one is authorized', async () => {
    subscriptions.push({
      tenantId: 't1', id: 'sub1', plan: 'starter', provider: 'mercadopago', externalSubscriptionId: 'preapproval_old',
      status: 'active', currentPeriodEnd: new Date(Date.now() + 10 * DAY_MS - 60_000),
    });
    planPrices.find((p) => p.plan === 'starter' && p.market === 'ar')!.launchPriceCents = 5000;

    const result = await startCheckout(tenant({ id: 't1', country: 'Argentina' }), { id: 'u1', email: 'a@example.com' });

    expect(result.success).toBe(true);
    expect(result.initPoint).toBe('https://mp.example/checkout');
    // Cancelling here left the tenant with no active preapproval if they abandoned the checkout.
    expect(updatePreapprovalMock).not.toHaveBeenCalled();
    expect(createPreapprovalMock).toHaveBeenCalledTimes(1);
    // First charge deferred to where the old preapproval's next one would have landed — not a new
    // SIGNUP_TRIAL_DAYS, and not an immediate second charge for a period already paid.
    expect(createPreapprovalMock).toHaveBeenCalledWith(expect.objectContaining({ trialDays: 10, externalReference: 'sub1:pp_ar_starter' }));
    // Priced from the row the subscriber is locked on, not whatever the config says today.
    expect(lockedPlanPriceMock).toHaveBeenCalled();
    expect(currentPlanPriceMock).not.toHaveBeenCalled();
  });

  it('Mercado Pago: a past_due subscriber swapping cards is charged right away', async () => {
    subscriptions.push({
      tenantId: 't1', id: 'sub1', plan: 'starter', provider: 'mercadopago', externalSubscriptionId: 'preapproval_old',
      status: 'past_due', currentPeriodEnd: new Date(Date.now() - 3 * DAY_MS),
    });
    planPrices.find((p) => p.plan === 'starter' && p.market === 'ar')!.launchPriceCents = 5000;

    await startCheckout(tenant({ id: 't1', country: 'Argentina' }), { id: 'u1', email: 'a@example.com' });

    expect(createPreapprovalMock).toHaveBeenCalledWith(expect.objectContaining({ trialDays: undefined }));
  });

  it('rejects if the subscription has a provider but no externalSubscriptionId (inconsistent state)', async () => {
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: 'dodopayments', externalSubscriptionId: null });

    const result = await startCheckout(tenant({ id: 't1', country: 'United States' }), { id: 'u1', email: 'a@example.com' });

    expect(result.success).toBe(false);
    expect(getCustomerPortalUrlMock).not.toHaveBeenCalled();
  });
});

describe('startCheckout — outside real production billing (staging/local dev)', () => {
  beforeEach(resetMocks);

  it('charges a fresh Dodo subscribe immediately instead of granting a trial when BILLING_ENV is not production', async () => {
    delete process.env.BILLING_ENV;
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: null, externalSubscriptionId: null });

    const result = await startCheckout(tenant({ id: 't1', country: 'United States' }), { id: 'u1', email: 'a@example.com' }, 'starter');

    expect(result.success).toBe(true);
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(expect.objectContaining({ trialDays: undefined }));
  });

  it('charges a fresh Mercado Pago subscribe immediately instead of granting a trial when BILLING_ENV is not production', async () => {
    process.env.BILLING_ENV = 'sandbox';
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: null, externalSubscriptionId: null });
    planPrices.find((p) => p.plan === 'starter' && p.market === 'ar')!.launchPriceCents = 5000;

    const result = await startCheckout(tenant({ id: 't1', country: 'Argentina' }), { id: 'u1', email: 'a@example.com' }, 'starter');

    expect(result.success).toBe(true);
    expect(createPreapprovalMock).toHaveBeenCalledWith(expect.objectContaining({ trialDays: undefined }));
  });
});

describe('startCheckout — trial length caps at what remains of the ORIGINAL trial window', () => {
  beforeEach(resetMocks);

  it('grants only the days actually left, not a fresh SIGNUP_TRIAL_DAYS, for a tenant partway through their trial', async () => {
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: null, externalSubscriptionId: null });

    const result = await startCheckout(
      tenant({ id: 't1', country: 'United States', trialEndsAt: new Date(Date.now() + 3 * DAY_MS) }),
      { id: 'u1', email: 'a@example.com' },
      'starter',
    );

    expect(result.success).toBe(true);
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(expect.objectContaining({ trialDays: 3 }));
  });

  it('charges immediately instead of granting a fresh trial if the original window already lapsed', async () => {
    subscriptions.push({ tenantId: 't1', id: 'sub1', plan: 'starter', provider: null, externalSubscriptionId: null });

    // Regression for Alejandro's 2026-08-21 catch: without this, someone could start-but-abandon
    // checkout past their trial's real end date and, whenever they finally completed one, always
    // land a brand new 15-day runway — pushing out the real first charge indefinitely.
    const result = await startCheckout(
      tenant({ id: 't1', country: 'United States', trialEndsAt: new Date(Date.now() - 5 * DAY_MS) }),
      { id: 'u1', email: 'a@example.com' },
      'starter',
    );

    expect(result.success).toBe(true);
    expect(createCheckoutSessionMock).toHaveBeenCalledWith(expect.objectContaining({ trialDays: undefined }));
  });
});
