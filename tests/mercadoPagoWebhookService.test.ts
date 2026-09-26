import { beforeEach, describe, expect, it, vi } from 'vitest';

const subscriptions: any[] = [];
const planPrices: any[] = [
  { id: 'pp_ar_starter', plan: 'starter', market: 'ar', launchPriceCents: 1_500_000 },
  { id: 'pp_ar_growth', plan: 'growth', market: 'ar', launchPriceCents: 3_000_000 },
];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    subscription: {
      findUnique: vi.fn(async ({ where }: any) => subscriptions.find((s) => s.id === where.id) ?? null),
    },
    planPrice: {
      findUnique: vi.fn(async ({ where }: any) => planPrices.find((p) => p.id === where.id) ?? null),
    },
  },
}));

const { updatePreapprovalMock, syncMock } = vi.hoisted(() => ({
  updatePreapprovalMock: vi.fn(async () => ({})),
  syncMock: vi.fn(async () => ({})),
}));
vi.mock('../src/lib/mercadopago.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/mercadopago.js')>()),
  updatePreapproval: updatePreapprovalMock,
}));
vi.mock('../src/modules/tenant/subscriptionService.js', () => ({
  syncSubscriptionAndTenant: syncMock,
}));

import { handleMercadoPagoPreapproval } from '../src/modules/tenant/mercadoPagoWebhookService.js';

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

    expect(syncMock).toHaveBeenCalledWith({ tenantId: 't1', provider: 'mercadopago', externalSubscriptionId: 'pre_new', currency: 'ARS' });
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
