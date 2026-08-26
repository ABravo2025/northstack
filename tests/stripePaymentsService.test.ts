import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptStripeSecret } from '../src/lib/stripeEncryption.js';

process.env.STRIPE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');

let connections: any[] = [];
let contacts: any[] = [];
let companies: any[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    stripeConnection: {
      findUnique: vi.fn(async ({ where }: any) => connections.find((c) => c.tenantId === where.tenantId) ?? null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = connections.filter(
          (c) => c.tenantId === where.tenantId && (where.disconnectedAt === undefined || c.disconnectedAt === where.disconnectedAt),
        );
        for (const match of matches) Object.assign(match, data);
        return { count: matches.length };
      }),
    },
    contact: {
      findMany: vi.fn(async ({ where }: any) =>
        contacts.filter(
          (c) => c.tenantId === where.tenantId && c.companyId === where.companyId && c.isActive === where.isActive,
        ),
      ),
    },
    company: {
      findMany: vi.fn(async ({ where }: any) =>
        companies.filter((c) => c.tenantId === where.tenantId && (where.stripeCustomerId ? c.stripeCustomerId != null : true)),
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const existing = companies.find((c) => c.id === where.id);
        if (!existing) throw new Error('not found');
        Object.assign(existing, data);
        return existing;
      }),
    },
  },
}));

const { listCustomersMock, listChargesMock, listSubscriptionsMock } = vi.hoisted(() => ({
  listCustomersMock: vi.fn(async () => ({ data: [], has_more: false })),
  listChargesMock: vi.fn(async () => ({ data: [], has_more: false })),
  listSubscriptionsMock: vi.fn(async () => ({ data: [], has_more: false })),
}));
vi.mock('../src/lib/stripe.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/stripe.js')>('../src/lib/stripe.js');
  return {
    ...actual,
    listCustomers: listCustomersMock,
    listCharges: listChargesMock,
    listSubscriptions: listSubscriptionsMock,
  };
});

import { StripeApiError } from '../src/lib/stripe.js';
import {
  getCompanyPaymentEvents,
  getCompanyPaymentSummary,
  getPaymentsOverview,
  linkCompanyToStripeCustomer,
  searchStripeCustomersForCompany,
} from '../src/modules/integrations/stripePaymentsService.js';

function activeConnection(tenantId: string) {
  return {
    tenantId,
    apiKeyEncrypted: encryptStripeSecret('sk_test_abc'),
    apiKeyMode: 'test',
    disconnectedAt: null,
    needsAttention: false,
  };
}

function resetMocks() {
  connections = [activeConnection('t1')];
  contacts = [];
  companies = [];
  listCustomersMock.mockReset().mockResolvedValue({ data: [], has_more: false });
  listChargesMock.mockReset().mockResolvedValue({ data: [], has_more: false });
  listSubscriptionsMock.mockReset().mockResolvedValue({ data: [], has_more: false });
}

describe('searchStripeCustomersForCompany', () => {
  beforeEach(resetMocks);

  it('consolidates the same customer matched via two different Contacts into one entry', async () => {
    contacts = [
      { tenantId: 't1', companyId: 'c1', isActive: true, email: 'a@example.com' },
      { tenantId: 't1', companyId: 'c1', isActive: true, email: 'b@example.com' },
    ];
    listCustomersMock.mockResolvedValue({ data: [{ id: 'cus_1', email: 'a@example.com', name: 'A Co' }], has_more: false });

    const matches = await searchStripeCustomersForCompany('t1', 'c1');

    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ id: 'cus_1', email: 'a@example.com', name: 'A Co', matchedViaEmail: 'a@example.com' });
  });

  it('ignores inactive/deactivated Contacts', async () => {
    contacts = [{ tenantId: 't1', companyId: 'c1', isActive: false, email: 'gone@example.com' }];

    const matches = await searchStripeCustomersForCompany('t1', 'c1');

    expect(matches).toEqual([]);
    expect(listCustomersMock).not.toHaveBeenCalled();
  });

  it('rejects when the tenant has no active Stripe connection', async () => {
    connections = [];
    contacts = [{ tenantId: 't1', companyId: 'c1', isActive: true, email: 'a@example.com' }];

    await expect(searchStripeCustomersForCompany('t1', 'c1')).rejects.toThrow(/no active Stripe connection/);
  });

  it('marks the connection as needing attention on a 401 from Stripe', async () => {
    contacts = [{ tenantId: 't1', companyId: 'c1', isActive: true, email: 'a@example.com' }];
    listCustomersMock.mockRejectedValueOnce(new StripeApiError(401, 'revoked'));

    await expect(searchStripeCustomersForCompany('t1', 'c1')).rejects.toThrow();
    expect(connections[0].needsAttention).toBe(true);
  });
});

describe('linkCompanyToStripeCustomer', () => {
  beforeEach(resetMocks);

  it('saves the customer id and the matched-via email', async () => {
    companies = [{ id: 'c1', tenantId: 't1', stripeCustomerId: null, stripeCustomerMatchedVia: null }];

    const updated = await linkCompanyToStripeCustomer({
      companyId: 'c1',
      stripeCustomerId: 'cus_1',
      matchedViaEmail: 'a@example.com',
    });

    expect(updated.stripeCustomerId).toBe('cus_1');
    expect(updated.stripeCustomerMatchedVia).toBe('a@example.com');
  });
});

describe('getCompanyPaymentSummary', () => {
  beforeEach(resetMocks);

  it('reports "not linked" without ever calling Stripe when the Company has no stripeCustomerId', async () => {
    const summary = await getCompanyPaymentSummary('t1', { stripeCustomerId: null });

    expect(summary).toEqual({ linked: false, refundsCount: 0, refundsAmountCents: 0, currency: null, failedCount: 0, subscriptionStatus: null });
    expect(listChargesMock).not.toHaveBeenCalled();
  });

  it('counts refunds (by amount_refunded > 0) and failed charges from the same Charges list', async () => {
    listChargesMock.mockResolvedValue({
      data: [
        { id: 'ch_1', amount: 1000, currency: 'usd', status: 'succeeded', refunded: false, amount_refunded: 0, created: 1 },
        { id: 'ch_2', amount: 2000, currency: 'usd', status: 'succeeded', refunded: true, amount_refunded: 500, created: 2 }, // partial refund
        { id: 'ch_3', amount: 3000, currency: 'usd', status: 'failed', refunded: false, amount_refunded: 0, created: 3 },
      ],
      has_more: false,
    });
    listSubscriptionsMock.mockResolvedValue({ data: [{ id: 'sub_1', status: 'active', customer: 'cus_1', created: 1 }], has_more: false });

    const summary = await getCompanyPaymentSummary('t1', { stripeCustomerId: 'cus_1' });

    expect(summary).toEqual({
      linked: true,
      refundsCount: 1,
      refundsAmountCents: 500,
      currency: 'usd',
      failedCount: 1,
      subscriptionStatus: 'active',
    });
    expect(listChargesMock).toHaveBeenCalledWith('sk_test_abc', { customer: 'cus_1', limit: 100 });
    expect(listSubscriptionsMock).toHaveBeenCalledWith('sk_test_abc', { customer: 'cus_1', status: 'all', limit: 10 });
  });

  it('prefers an active/trialing/past_due subscription over a canceled one, regardless of order', async () => {
    listSubscriptionsMock.mockResolvedValue({
      data: [
        { id: 'sub_old', status: 'canceled', customer: 'cus_1', created: 1 },
        { id: 'sub_new', status: 'past_due', customer: 'cus_1', created: 2 },
      ],
      has_more: false,
    });

    const summary = await getCompanyPaymentSummary('t1', { stripeCustomerId: 'cus_1' });
    expect(summary.subscriptionStatus).toBe('past_due');
  });

  it('falls back to the most recent subscription of any status when none are active/trialing/past_due', async () => {
    listSubscriptionsMock.mockResolvedValue({ data: [{ id: 'sub_old', status: 'canceled', customer: 'cus_1', created: 1 }], has_more: false });

    const summary = await getCompanyPaymentSummary('t1', { stripeCustomerId: 'cus_1' });
    expect(summary.subscriptionStatus).toBe('canceled');
  });

  it('reports null subscriptionStatus when the customer has no subscriptions at all', async () => {
    const summary = await getCompanyPaymentSummary('t1', { stripeCustomerId: 'cus_1' });
    expect(summary.subscriptionStatus).toBeNull();
  });
});

describe('getCompanyPaymentEvents', () => {
  beforeEach(resetMocks);

  it('classifies each charge and builds the correct dashboard link for test mode', async () => {
    listChargesMock.mockResolvedValue({
      data: [
        { id: 'ch_ok', amount: 1000, currency: 'usd', status: 'succeeded', refunded: false, amount_refunded: 0, created: 1700000000 },
        { id: 'ch_refunded', amount: 2000, currency: 'usd', status: 'succeeded', refunded: true, amount_refunded: 2000, created: 1700000001 },
        { id: 'ch_failed', amount: 3000, currency: 'usd', status: 'failed', refunded: false, amount_refunded: 0, created: 1700000002 },
      ],
      has_more: true,
    });

    const page = await getCompanyPaymentEvents('t1', { stripeCustomerId: 'cus_1' });

    expect(page.events).toEqual([
      {
        id: 'ch_ok',
        type: 'charge_succeeded',
        amountCents: 1000,
        currency: 'usd',
        createdAt: new Date(1700000000 * 1000).toISOString(),
        dashboardUrl: 'https://dashboard.stripe.com/test/payments/ch_ok',
      },
      {
        id: 'ch_refunded',
        type: 'charge_refunded',
        amountCents: 2000,
        currency: 'usd',
        createdAt: new Date(1700000001 * 1000).toISOString(),
        dashboardUrl: 'https://dashboard.stripe.com/test/payments/ch_refunded',
      },
      {
        id: 'ch_failed',
        type: 'charge_failed',
        amountCents: 3000,
        currency: 'usd',
        createdAt: new Date(1700000002 * 1000).toISOString(),
        dashboardUrl: 'https://dashboard.stripe.com/test/payments/ch_failed',
      },
    ]);
    expect(page.nextCursor).toBe('ch_failed');
  });

  it('uses a live-mode dashboard URL (no /test/ prefix) for a live connection', async () => {
    connections = [{ ...activeConnection('t1'), apiKeyMode: 'live' }];
    listChargesMock.mockResolvedValue({
      data: [{ id: 'ch_1', amount: 1000, currency: 'usd', status: 'succeeded', refunded: false, amount_refunded: 0, created: 1 }],
      has_more: false,
    });

    const page = await getCompanyPaymentEvents('t1', { stripeCustomerId: 'cus_1' });
    expect(page.events[0].dashboardUrl).toBe('https://dashboard.stripe.com/payments/ch_1');
  });

  it('nextCursor is null when Stripe reports no more pages', async () => {
    listChargesMock.mockResolvedValue({
      data: [{ id: 'ch_1', amount: 1000, currency: 'usd', status: 'succeeded', refunded: false, amount_refunded: 0, created: 1 }],
      has_more: false,
    });
    const page = await getCompanyPaymentEvents('t1', { stripeCustomerId: 'cus_1' });
    expect(page.nextCursor).toBeNull();
  });

  it('passes the cursor through to the Charges call unchanged', async () => {
    await getCompanyPaymentEvents('t1', { stripeCustomerId: 'cus_1' }, 'ch_prev');
    expect(listChargesMock).toHaveBeenCalledWith('sk_test_abc', { customer: 'cus_1', limit: 20, starting_after: 'ch_prev' });
  });
});

describe('getPaymentsOverview', () => {
  beforeEach(resetMocks);

  it('returns a clean "not connected" shape without querying any Company when there is no active connection', async () => {
    connections = [];
    companies = [{ id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: 'cus_1' }];

    const overview = await getPaymentsOverview('t1');

    expect(overview).toEqual({
      connected: false,
      totals: { refundsCount: 0, refundsAmountCents: 0, currency: null, failedCount: 0, activeSubscriptions: 0 },
      companies: [],
    });
  });

  it('only includes Companies that have a stripeCustomerId, and aggregates totals across all of them', async () => {
    companies = [
      { id: 'c1', tenantId: 't1', name: 'Linked Co', stripeCustomerId: 'cus_1' },
      { id: 'c2', tenantId: 't1', name: 'Unlinked Co', stripeCustomerId: null },
    ];
    listChargesMock.mockResolvedValue({
      data: [{ id: 'ch_1', amount: 1000, currency: 'usd', status: 'failed', refunded: false, amount_refunded: 0, created: 1 }],
      has_more: false,
    });
    listSubscriptionsMock.mockResolvedValue({ data: [{ id: 'sub_1', status: 'active', customer: 'cus_1', created: 1 }], has_more: false });

    const overview = await getPaymentsOverview('t1');

    expect(overview.connected).toBe(true);
    expect(overview.companies).toHaveLength(1);
    expect(overview.companies[0]).toMatchObject({ companyId: 'c1', companyName: 'Linked Co' });
    expect(overview.totals).toEqual({ refundsCount: 0, refundsAmountCents: 0, currency: 'usd', failedCount: 1, activeSubscriptions: 1 });
  });

  it('never mixes Companies across tenants', async () => {
    companies = [
      { id: 'c1', tenantId: 't1', name: 'Tenant 1 Co', stripeCustomerId: 'cus_1' },
      { id: 'c2', tenantId: 't2', name: 'Tenant 2 Co', stripeCustomerId: 'cus_2' },
    ];

    const overview = await getPaymentsOverview('t1');
    expect(overview.companies.map((c) => c.companyId)).toEqual(['c1']);
  });
});
