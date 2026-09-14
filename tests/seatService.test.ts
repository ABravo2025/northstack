import { beforeEach, describe, expect, it, vi } from 'vitest';

let tenants: Record<string, any> = {};
let subscriptions: Record<string, any> = {};
let users: { tenantId: string; status: string }[] = [];
let planPrices: any[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    tenant: {
      findUnique: vi.fn(async ({ where }: any) => tenants[where.id] ?? null),
    },
    subscription: {
      findUnique: vi.fn(async ({ where }: any) => subscriptions[where.tenantId] ?? null),
    },
    user: {
      count: vi.fn(async ({ where }: any) => users.filter((u) => u.tenantId === where.tenantId && u.status === where.status).length),
    },
    planPrice: {
      findFirst: vi.fn(async ({ where }: any) => planPrices.find((p) => p.plan === where.plan && p.market === where.market) ?? null),
    },
  },
}));

const { updateSubscriptionSeatsMock } = vi.hoisted(() => ({ updateSubscriptionSeatsMock: vi.fn(async () => {}) }));
vi.mock('../src/lib/dodopayments.js', () => ({
  updateSubscriptionSeats: updateSubscriptionSeatsMock,
}));

const { updatePreapprovalMock } = vi.hoisted(() => ({ updatePreapprovalMock: vi.fn(async () => ({})) }));
vi.mock('../src/lib/mercadopago.js', () => ({
  updatePreapproval: updatePreapprovalMock,
}));

import { countActiveSeats, extraSeatsFor, syncSeatBilling, INCLUDED_SEATS, EXTRA_SEAT_PRICE_CENTS } from '../src/modules/tenant/seatService.js';

function reset() {
  tenants = {};
  subscriptions = {};
  users = [];
  planPrices = [
    { plan: 'starter', market: 'international', launchPriceCents: 1900, dodoProductId: 'pdt_starter' },
    { plan: 'growth', market: 'international', launchPriceCents: 3900, dodoProductId: 'pdt_growth' },
  ];
  updateSubscriptionSeatsMock.mockClear();
  updatePreapprovalMock.mockClear();
}

describe('extraSeatsFor', () => {
  it('is 0 at or under the included count', () => {
    expect(extraSeatsFor('starter', 5)).toBe(0);
    expect(extraSeatsFor('starter', 3)).toBe(0);
  });

  it('is the overage past the included count', () => {
    expect(extraSeatsFor('starter', 8)).toBe(3);
    expect(extraSeatsFor('growth', 12)).toBe(2);
  });

  it('INCLUDED_SEATS/EXTRA_SEAT_PRICE_CENTS match the confirmed 2026-09-14 numbers', () => {
    expect(INCLUDED_SEATS).toEqual({ starter: 5, growth: 10 });
    expect(EXTRA_SEAT_PRICE_CENTS).toBe(400);
  });
});

describe('syncSeatBilling', () => {
  beforeEach(reset);

  it('no-ops for a tenant with no plan chosen yet', async () => {
    tenants.t1 = { plan: null };
    subscriptions.t1 = { provider: 'dodopayments', externalSubscriptionId: 'sub_1', status: 'active' };
    await syncSeatBilling('t1');
    expect(updateSubscriptionSeatsMock).not.toHaveBeenCalled();
  });

  it('no-ops for a tenant with no provider attached yet (never checked out)', async () => {
    tenants.t1 = { plan: 'starter' };
    subscriptions.t1 = { provider: null, externalSubscriptionId: null, status: 'trialing' };
    await syncSeatBilling('t1');
    expect(updateSubscriptionSeatsMock).not.toHaveBeenCalled();
  });

  // 2026-09-14 correction: a card (and provider/externalSubscriptionId) gets attached at trial
  // start via the $0 mandate-authorization payment, well before the base plan's own first real
  // charge — billing seat overage at that point would charge a still-on-trial tenant real money,
  // contradicting the "not charged until the trial ends" promise (ToS 5.1 / Refund Policy 2).
  it('no-ops while status is trialing, even with a provider already attached', async () => {
    tenants.t1 = { plan: 'starter' };
    subscriptions.t1 = { provider: 'dodopayments', externalSubscriptionId: 'sub_1', status: 'trialing' };
    users = Array.from({ length: 8 }, () => ({ tenantId: 't1', status: 'active' })); // 3 over the 5 included
    await syncSeatBilling('t1');
    expect(updateSubscriptionSeatsMock).not.toHaveBeenCalled();
  });

  it('bills the Dodo addon once active, with the current overage and the plan\'s product id', async () => {
    tenants.t1 = { plan: 'starter' };
    subscriptions.t1 = { provider: 'dodopayments', externalSubscriptionId: 'sub_1', status: 'active' };
    users = Array.from({ length: 7 }, () => ({ tenantId: 't1', status: 'active' })); // 2 over the 5 included
    await syncSeatBilling('t1');
    expect(updateSubscriptionSeatsMock).toHaveBeenCalledWith('sub_1', { productId: 'pdt_starter', extraSeats: 2 });
  });

  it('clears the Dodo addon (extraSeats: 0) once back at or under the included count', async () => {
    tenants.t1 = { plan: 'starter' };
    subscriptions.t1 = { provider: 'dodopayments', externalSubscriptionId: 'sub_1', status: 'active' };
    users = Array.from({ length: 4 }, () => ({ tenantId: 't1', status: 'active' }));
    await syncSeatBilling('t1');
    expect(updateSubscriptionSeatsMock).toHaveBeenCalledWith('sub_1', { productId: 'pdt_starter', extraSeats: 0 });
  });

  it('folds the surcharge into Mercado Pago\'s recurring transactionAmount instead (no addon primitive)', async () => {
    tenants.t1 = { plan: 'growth' };
    subscriptions.t1 = { provider: 'mercadopago', externalSubscriptionId: 'preapproval_1', status: 'active' };
    planPrices.push({ plan: 'growth', market: 'ar', launchPriceCents: 5000, dodoProductId: null });
    users = Array.from({ length: 12 }, () => ({ tenantId: 't1', status: 'active' })); // 2 over the 10 included
    await syncSeatBilling('t1');
    expect(updatePreapprovalMock).toHaveBeenCalledWith('preapproval_1', { transactionAmount: (5000 + 2 * 400) / 100 });
    expect(updateSubscriptionSeatsMock).not.toHaveBeenCalled();
  });
});

describe('countActiveSeats', () => {
  beforeEach(reset);

  it('counts only active-status Users for the tenant', async () => {
    users = [
      { tenantId: 't1', status: 'active' },
      { tenantId: 't1', status: 'active' },
      { tenantId: 't1', status: 'inactive' },
      { tenantId: 't2', status: 'active' },
    ];
    expect(await countActiveSeats('t1')).toBe(2);
  });
});
