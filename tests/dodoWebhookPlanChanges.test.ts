import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

// Dodo webhook route (routes/webhooks.ts) — the plan-change paths that only show up with a
// 100%-off discount (2026-09-30, Javier's case): every charge is $0, so a $0 payment past the trial
// must still renew the period and carry plan changes, and subscription.plan_changed must sync the
// plan even when no payment event arrives at all.

const subscriptions: any[] = [];
const planPrices: any[] = [
  { id: 'pp_starter', plan: 'starter', market: 'international', launchPriceCents: 1900, dodoProductId: 'pdt_starter' },
  { id: 'pp_growth', plan: 'growth', market: 'international', launchPriceCents: 3900, dodoProductId: 'pdt_growth' },
];
const invoices: any[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    processedWebhookEvent: {
      create: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
    subscription: {
      findUnique: vi.fn(async ({ where }: any) => subscriptions.find((s) => s.id === where.id) ?? null),
    },
    planPrice: {
      findUnique: vi.fn(async ({ where }: any) => planPrices.find((p) => p.id === where.id) ?? null),
    },
    invoice: {
      create: vi.fn(async ({ data }: any) => invoices.push(data)),
    },
  },
}));

const { unwrapMock, syncMock } = vi.hoisted(() => ({
  unwrapMock: vi.fn(),
  syncMock: vi.fn(async () => ({})),
}));
vi.mock('../src/lib/dodopayments.js', () => ({
  unwrapDodoWebhookEvent: unwrapMock,
  getNextBillingDate: vi.fn(async () => new Date('2026-10-30T00:00:00Z')),
  getSubscriptionProductId: vi.fn(async () => 'pdt_growth'),
}));
vi.mock('../src/modules/tenant/subscriptionService.js', () => ({
  syncSubscriptionAndTenant: syncMock,
  resolvePlanPriceFromDodoProductId: vi.fn(async (productId: string) => planPrices.find((p) => p.dodoProductId === productId) ?? null),
}));
vi.mock('../src/modules/tenant/seatService.js', () => ({
  syncSeatBilling: vi.fn(async () => {}),
  countActiveSeats: vi.fn(async () => 1),
  extraSeatsFor: vi.fn(() => 0),
}));

import { webhooksRouter } from '../src/routes/webhooks.js';

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use('/api/webhooks/dodopayments', express.raw({ type: '*/*' }));
  app.use(webhooksRouter);
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

let eventCounter = 0;
async function deliver(event: unknown) {
  unwrapMock.mockReturnValueOnce(event);
  eventCounter += 1;
  const res = await fetch(`${base}/api/webhooks/dodopayments`, {
    method: 'POST',
    headers: { 'webhook-id': `evt_${eventCounter}`, 'content-type': 'application/json' },
    body: '{}',
  });
  return { status: res.status, body: await res.json() };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    type: 'payment.succeeded',
    data: {
      payment_id: 'pay_1',
      subscription_id: 'sub_dodo',
      total_amount: 0,
      is_update_payment_method: false,
      discounts: [{ code: 'JAVIER100' }],
      metadata: { subscriptionId: 'sub1' },
      ...overrides,
    },
  };
}

beforeEach(() => {
  subscriptions.length = 0;
  invoices.length = 0;
  syncMock.mockClear();
  subscriptions.push({
    id: 'sub1', tenantId: 't1', provider: 'dodopayments', externalSubscriptionId: 'sub_dodo', plan: 'starter',
    status: 'active', planPriceId: 'pp_starter', pendingPlanPriceId: null, lockedPriceCents: 1900, currency: 'USD',
    trialEndsAt: new Date('2026-09-01T00:00:00Z'),
  });
});

describe('Dodo webhook — 100%-off discount', () => {
  it('a $0 upgrade charge switches the plan and restarts the period, with no invoice', async () => {
    await deliver(payment({ metadata: { subscriptionId: 'sub1', planChange: 'upgrade', planPriceId: 'pp_growth' } }));

    expect(syncMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 't1',
      plan: 'growth',
      planPriceId: 'pp_growth',
      lockedPriceCents: 3900,
      pendingPlanPriceId: null,
      status: 'active',
      currentPeriodStart: expect.any(Date),
      currentPeriodEnd: new Date('2026-10-30T00:00:00Z'),
    }));
    expect(invoices).toHaveLength(0);
  });

  it('a $0 renewal applies a scheduled downgrade and renews the period', async () => {
    subscriptions[0].plan = 'growth';
    subscriptions[0].planPriceId = 'pp_growth';
    subscriptions[0].pendingPlanPriceId = 'pp_starter';

    await deliver(payment());

    expect(syncMock).toHaveBeenCalledWith(expect.objectContaining({ plan: 'starter', pendingPlanPriceId: null, status: 'active' }));
  });

  it('a $0 renewal with nothing scheduled just renews the period', async () => {
    await deliver(payment());

    const fields = (syncMock.mock.calls[0] as any)[0];
    expect(fields).toMatchObject({ status: 'active', currentPeriodEnd: new Date('2026-10-30T00:00:00Z') });
    expect(fields).not.toHaveProperty('plan');
  });

  it("a $0 mandate at the start of a trial still doesn't activate anything", async () => {
    subscriptions[0].status = 'trialing';
    subscriptions[0].trialEndsAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    await deliver(payment());

    const fields = (syncMock.mock.calls[0] as any)?.[0] ?? {};
    expect(fields).not.toHaveProperty('status');
    expect(fields).not.toHaveProperty('currentPeriodStart');
  });

  it('subscription.plan_changed syncs the plan to the new Dodo product even without a payment', async () => {
    await deliver({ type: 'subscription.plan_changed', data: { product_id: 'pdt_growth', metadata: { subscriptionId: 'sub1' } } });

    expect(syncMock).toHaveBeenCalledWith({ tenantId: 't1', plan: 'growth', lockedPriceCents: 3900, planPriceId: 'pp_growth', pendingPlanPriceId: null });
  });

  it('subscription.plan_changed for the same product (a seat update) is a no-op', async () => {
    await deliver({ type: 'subscription.plan_changed', data: { product_id: 'pdt_starter', metadata: { subscriptionId: 'sub1' } } });

    expect(syncMock).not.toHaveBeenCalled();
  });

  it('a failed upgrade charge leaves the subscription as it was (not past_due)', async () => {
    const { body } = await deliver({ type: 'payment.failed', data: { metadata: { subscriptionId: 'sub1', planChange: 'upgrade' } } });

    expect(body.status).toContain('upgrade payment failed');
    expect(syncMock).not.toHaveBeenCalled();
  });
});
