import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscriptions: any[] = [];
const invoices: any[] = [];
const planPrices: any[] = [
  { id: 'pp_ar_starter', plan: 'starter', market: 'ar', launchPriceCents: 1_500_000 },
  { id: 'pp_ar_growth', plan: 'growth', market: 'ar', launchPriceCents: 3_000_000 },
];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    subscription: {
      findUnique: vi.fn(async ({ where }: any) => subscriptions.find((s) => s.id === where.id) ?? null),
      findFirst: vi.fn(async ({ where }: any) => subscriptions.find((s) => s.externalSubscriptionId === where.externalSubscriptionId) ?? null),
    },
    invoice: {
      findFirst: vi.fn(async ({ where }: any) => invoices.find((i) => i.externalInvoiceId === where.externalInvoiceId) ?? null),
      create: vi.fn(async ({ data }: any) => {
        invoices.push(data);
        return data;
      }),
    },
    planPrice: {
      findUnique: vi.fn(async ({ where }: any) => planPrices.find((p) => p.id === where.id) ?? null),
    },
  },
}));

const { updatePreapprovalMock, syncMock, getPreapprovalMock, syncSeatBillingMock } = vi.hoisted(() => ({
  updatePreapprovalMock: vi.fn(async () => ({})),
  syncMock: vi.fn(async () => ({})),
  getPreapprovalMock: vi.fn(async () => ({ id: 'pre_new', status: 'authorized', next_payment_date: '2026-10-30T10:00:00.000-04:00' })),
  syncSeatBillingMock: vi.fn(async () => {}),
}));
vi.mock('../src/lib/mercadopago.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/mercadopago.js')>()),
  updatePreapproval: updatePreapprovalMock,
  getPreapproval: getPreapprovalMock,
}));
vi.mock('../src/modules/tenant/seatService.js', () => ({
  syncSeatBilling: syncSeatBillingMock,
}));
vi.mock('../src/modules/tenant/subscriptionService.js', () => ({
  syncSubscriptionAndTenant: syncMock,
}));

import { handleMercadoPagoAuthorizedPayment, handleMercadoPagoPreapproval } from '../src/modules/tenant/mercadoPagoWebhookService.js';

const FREE_TRIAL = { frequency: 15, frequency_type: 'days' };

function preapproval(overrides: Record<string, unknown>) {
  return {
    id: 'pre_new',
    status: 'authorized',
    external_reference: 'sub1:pp_ar_growth',
    auto_recurring: { transaction_amount: 30000, currency_id: 'ARS' },
    ...overrides,
  } as any;
}

beforeEach(() => {
  subscriptions.length = 0;
  invoices.length = 0;
  getPreapprovalMock.mockClear();
  syncSeatBillingMock.mockClear();
  updatePreapprovalMock.mockClear();
  syncMock.mockClear();
});

describe('handleMercadoPagoPreapproval — first subscribe', () => {
  it('confirms plan, provider and ARS pricing, and stays trialing while the free trial runs', async () => {
    subscriptions.push({ id: 'sub1', tenantId: 't1', provider: null, externalSubscriptionId: null, plan: 'starter', status: 'trialing' });

    const status = await handleMercadoPagoPreapproval(
      preapproval({ auto_recurring: { transaction_amount: 30000, currency_id: 'ARS', free_trial: FREE_TRIAL } }),
    );

    expect(status).toBe('ok');
    expect(syncMock).toHaveBeenCalledWith({
      tenantId: 't1',
      provider: 'mercadopago',
      externalSubscriptionId: 'pre_new',
      currency: 'ARS',
      plan: 'growth',
      lockedPriceCents: 3_000_000,
      planPriceId: 'pp_ar_growth',
      pendingPlanPriceId: null,
    });
    expect(updatePreapprovalMock).not.toHaveBeenCalled();
  });

  it('goes active right away when there is no free trial (charged now)', async () => {
    subscriptions.push({ id: 'sub1', tenantId: 't1', provider: null, externalSubscriptionId: null, plan: 'starter', status: 'past_due' });

    await handleMercadoPagoPreapproval(preapproval({}));

    expect(syncMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', currentPeriodStart: expect.any(Date), plan: 'growth' }));
  });

  it('still resolves a pre-2026-09-26 external_reference with no price suffix, leaving the plan alone', async () => {
    subscriptions.push({ id: 'sub1', tenantId: 't1', provider: null, externalSubscriptionId: null, plan: 'starter', status: 'trialing' });

    await handleMercadoPagoPreapproval(preapproval({ external_reference: 'sub1' }));

    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(syncMock).toHaveBeenCalledWith(expect.not.objectContaining({ plan: expect.anything() }));
  });

  it('ignores a preapproval whose Subscription does not exist', async () => {
    expect(await handleMercadoPagoPreapproval(preapproval({ external_reference: 'missing:pp_ar_growth' }))).toBe('no matching subscription');
    expect(syncMock).not.toHaveBeenCalled();
  });
});

describe('handleMercadoPagoPreapproval — replacement preapproval (update payment method)', () => {
  it('switches to the new preapproval, keeps plan/status, then cancels the superseded one', async () => {
    subscriptions.push({ id: 'sub1', tenantId: 't1', provider: 'mercadopago', externalSubscriptionId: 'pre_old', plan: 'starter', status: 'active' });

    await handleMercadoPagoPreapproval(
      preapproval({ external_reference: 'sub1:pp_ar_starter', auto_recurring: { transaction_amount: 15000, currency_id: 'ARS', free_trial: FREE_TRIAL } }),
    );

    expect(syncMock).toHaveBeenCalledWith({
      tenantId: 't1', provider: 'mercadopago', externalSubscriptionId: 'pre_new', currency: 'ARS',
      plan: 'starter', lockedPriceCents: 1_500_000, planPriceId: 'pp_ar_starter', pendingPlanPriceId: null,
    });
    expect(updatePreapprovalMock).toHaveBeenCalledWith('pre_old', { status: 'cancelled' });
    expect(syncMock.mock.invocationCallOrder[0]).toBeLessThan(updatePreapprovalMock.mock.invocationCallOrder[0]);
  });

  it('does not fail the webhook when cancelling the superseded preapproval fails', async () => {
    subscriptions.push({ id: 'sub1', tenantId: 't1', provider: 'mercadopago', externalSubscriptionId: 'pre_old', plan: 'starter', status: 'active' });
    updatePreapprovalMock.mockRejectedValueOnce(new Error('Mercado Pago API error (503)'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await handleMercadoPagoPreapproval(preapproval({ external_reference: 'sub1:pp_ar_starter' }))).toBe('ok');
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('pre_old'), expect.any(Error));
    consoleError.mockRestore();
  });

  it("ignores the superseded preapproval's own cancelled webhook instead of cancelling the subscription", async () => {
    subscriptions.push({ id: 'sub1', tenantId: 't1', provider: 'mercadopago', externalSubscriptionId: 'pre_new', plan: 'starter', status: 'active' });

    const status = await handleMercadoPagoPreapproval(preapproval({ id: 'pre_old', status: 'cancelled', external_reference: 'sub1:pp_ar_starter' }));

    expect(status).toBe('superseded preapproval, ignored');
    expect(syncMock).not.toHaveBeenCalled();
  });
});

describe('handleMercadoPagoPreapproval — the current preapproval', () => {
  beforeEach(() => {
    subscriptions.push({ id: 'sub1', tenantId: 't1', provider: 'mercadopago', externalSubscriptionId: 'pre_new', plan: 'growth', status: 'active' });
  });

  it('treats a repeat `authorized` (sent after our own amount updates) as a no-op', async () => {
    expect(await handleMercadoPagoPreapproval(preapproval({}))).toBe('already current');
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('cancels the subscription when the current preapproval is cancelled', async () => {
    await handleMercadoPagoPreapproval(preapproval({ status: 'cancelled' }));
    expect(syncMock).toHaveBeenCalledWith({ tenantId: 't1', status: 'cancelled' });
  });

  it('moves to past_due with a grace period when the current preapproval is paused', async () => {
    await handleMercadoPagoPreapproval(preapproval({ status: 'paused' }));
    expect(syncMock).toHaveBeenCalledWith({ tenantId: 't1', status: 'past_due', gracePeriodEndsAt: expect.any(Date) });
  });
});

// The real GET /authorized_payments/{id} response for the first staging charge (2026-09-30), minus
// nothing: the top-level status is "processed", the money result is payment.status.
function authorizedPayment(overrides: Record<string, unknown> = {}) {
  return {
    preapproval_id: 'pre_new',
    id: 7032385786,
    type: 'recurring',
    status: 'processed',
    transaction_amount: 30000,
    currency_id: 'ARS',
    reason: 'Northstack — starter (AR)',
    external_reference: 'sub1:pp_ar_starter',
    payment: { id: 180602307715, status: 'approved', status_detail: 'accredited' },
    retry_attempt: 1,
    payment_method_id: 'account_money',
    ...overrides,
  } as any;
}

describe('handleMercadoPagoAuthorizedPayment', () => {
  beforeEach(() => {
    subscriptions.push({
      id: 'sub1', tenantId: 't1', provider: 'mercadopago', externalSubscriptionId: 'pre_new',
      plan: 'starter', status: 'active', lockedPriceCents: 3_000_000, currency: 'ARS',
    });
  });

  it('records an approved charge (status "processed", payment.status "approved"): active, period end from MP, invoice', async () => {
    expect(await handleMercadoPagoAuthorizedPayment(authorizedPayment())).toBe('ok');

    expect(syncMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 't1',
      status: 'active',
      currentPeriodEnd: new Date('2026-10-30T10:00:00.000-04:00'),
      paymentMethodBrand: 'account_money',
    }));
    expect(invoices).toEqual([expect.objectContaining({
      externalInvoiceId: '7032385786',
      amountCents: 3_000_000,
      baseAmountCents: 3_000_000,
      extraSeatsAmountCents: 0,
      currency: 'ARS',
      status: 'paid',
    })]);
    expect(syncSeatBillingMock).toHaveBeenCalledWith('t1');
  });

  it('splits an extra-seat surcharge out of the charged amount', async () => {
    await handleMercadoPagoAuthorizedPayment(authorizedPayment({ transaction_amount: 42000 }));
    expect(invoices[0]).toMatchObject({ amountCents: 4_200_000, baseAmountCents: 3_000_000, extraSeatsAmountCents: 1_200_000 });
  });

  it('finds the subscription by external_reference even before the preapproval webhook stored its id', async () => {
    subscriptions[0].externalSubscriptionId = null;
    subscriptions[0].provider = null;
    expect(await handleMercadoPagoAuthorizedPayment(authorizedPayment())).toBe('ok');
    expect(invoices).toHaveLength(1);
  });

  it('never records the same charge twice', async () => {
    await handleMercadoPagoAuthorizedPayment(authorizedPayment());
    expect(await handleMercadoPagoAuthorizedPayment(authorizedPayment())).toBe('already recorded');
    expect(invoices).toHaveLength(1);
  });

  it('moves to past_due with a grace period on a rejected charge', async () => {
    await handleMercadoPagoAuthorizedPayment(authorizedPayment({ status: 'recycling', payment: { id: 1, status: 'rejected' } }));
    expect(syncMock).toHaveBeenCalledWith({ tenantId: 't1', status: 'past_due', gracePeriodEndsAt: expect.any(Date) });
    expect(invoices).toHaveLength(0);
  });

  it('ignores a charge that has not happened yet', async () => {
    const status = await handleMercadoPagoAuthorizedPayment(authorizedPayment({ status: 'scheduled', payment: undefined }));
    expect(status).toContain('ignored');
    expect(syncMock).not.toHaveBeenCalled();
    expect(invoices).toHaveLength(0);
  });

  it("records a superseded preapproval's charge without touching the subscription's status", async () => {
    subscriptions[0].externalSubscriptionId = 'pre_replacement';
    await handleMercadoPagoAuthorizedPayment(authorizedPayment());
    expect(syncMock).not.toHaveBeenCalled();
    expect(invoices).toHaveLength(1);
  });
});

describe('plan changes (2026-09-30)', () => {
  it('an upgrade preapproval (no trial) switches plan, restarts the period and cancels the old preapproval', async () => {
    subscriptions.push({ id: 'sub1', tenantId: 't1', provider: 'mercadopago', externalSubscriptionId: 'pre_old', plan: 'starter', status: 'active', pendingPlanPriceId: null });

    await handleMercadoPagoPreapproval(preapproval({ next_payment_date: '2026-10-30T10:00:00.000-04:00' }));

    expect(syncMock).toHaveBeenCalledWith(expect.objectContaining({
      plan: 'growth',
      planPriceId: 'pp_ar_growth',
      status: 'active',
      currentPeriodStart: expect.any(Date),
      currentPeriodEnd: new Date('2026-10-30T10:00:00.000-04:00'),
      externalSubscriptionId: 'pre_new',
    }));
    expect(updatePreapprovalMock).toHaveBeenCalledWith('pre_old', { status: 'cancelled' });
  });

  it('a scheduled downgrade applies with the renewal charge, and the invoice base is the new price', async () => {
    subscriptions.push({
      id: 'sub1', tenantId: 't1', provider: 'mercadopago', externalSubscriptionId: 'pre_new', plan: 'growth',
      status: 'active', lockedPriceCents: 3_000_000, currency: 'ARS', pendingPlanPriceId: 'pp_ar_starter',
    });

    await handleMercadoPagoAuthorizedPayment(authorizedPayment({ preapproval_id: 'pre_new', transaction_amount: 15000 }));

    expect(syncMock).toHaveBeenCalledWith(expect.objectContaining({
      plan: 'starter', lockedPriceCents: 1_500_000, planPriceId: 'pp_ar_starter', pendingPlanPriceId: null,
    }));
    expect(invoices[0]).toMatchObject({ amountCents: 1_500_000, baseAmountCents: 1_500_000, extraSeatsAmountCents: 0 });
  });
});
