import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptStripeSecret } from '../src/lib/stripeEncryption.js';

process.env.STRIPE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');

let connections: any[] = [];
let contacts: any[] = [];
let companies: any[] = [];
let users: any[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    stripeConnection: {
      findUnique: vi.fn(async ({ where }: any) => connections.find((c) => c.tenantId === where.tenantId) ?? null),
      findMany: vi.fn(async ({ where }: any) =>
        connections.filter((c) => where?.disconnectedAt === undefined || c.disconnectedAt === where.disconnectedAt),
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const existing = connections.find((c) => c.tenantId === where.tenantId);
        if (!existing) throw new Error('not found');
        Object.assign(existing, data);
        return existing;
      }),
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
        companies.filter((c) => {
          if (c.tenantId !== where.tenantId) return false;
          if (where.stripeCustomerId === null) return c.stripeCustomerId == null;
          if (where.stripeCustomerId?.not === null) return c.stripeCustomerId != null;
          return true;
        }),
      ),
      findFirst: vi.fn(async ({ where }: any) =>
        companies.find((c) => c.tenantId === where.tenantId && c.stripeCustomerId === where.stripeCustomerId) ?? null,
      ),
      update: vi.fn(async ({ where, data }: any) => {
        const existing = companies.find((c) => c.id === where.id);
        if (!existing) throw new Error('not found');
        Object.assign(existing, data);
        return existing;
      }),
    },
    user: {
      findFirst: vi.fn(async ({ where }: any) =>
        users.find((u) => u.tenantId === where.tenantId && u.role === where.role && u.status === where.status) ?? null,
      ),
    },
  },
}));

const { createNotificationMock } = vi.hoisted(() => ({
  createNotificationMock: vi.fn(async (input: any) => ({ id: 'notif_1', ...input })),
}));
vi.mock('../src/modules/notifications/notificationService.js', () => ({
  createNotification: createNotificationMock,
}));

const { listCustomersMock, listChargesMock, listSubscriptionsMock, listEventsMock } = vi.hoisted(() => ({
  listCustomersMock: vi.fn(async () => ({ data: [], has_more: false })),
  listChargesMock: vi.fn(async () => ({ data: [], has_more: false })),
  listSubscriptionsMock: vi.fn(async () => ({ data: [], has_more: false })),
  listEventsMock: vi.fn(async () => ({ data: [], has_more: false })),
}));
vi.mock('../src/lib/stripe.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/stripe.js')>('../src/lib/stripe.js');
  return {
    ...actual,
    listCustomers: listCustomersMock,
    listCharges: listChargesMock,
    listSubscriptions: listSubscriptionsMock,
    listEvents: listEventsMock,
  };
});

import { StripeApiError } from '../src/lib/stripe.js';
import {
  autoLinkUnmatchedCompanies,
  getCompanyPaymentEvents,
  getCompanyPaymentSummary,
  getPaymentsOverview,
  linkCompanyToStripeCustomer,
  notifyCompanyStripeEvent,
  processStripeWebhookEvent,
  runStripeEventPolling,
  searchStripeCustomersForCompany,
} from '../src/modules/integrations/stripePaymentsService.js';

function activeConnection(tenantId: string) {
  return {
    tenantId,
    apiKeyEncrypted: encryptStripeSecret('sk_test_abc'),
    apiKeyMode: 'test',
    disconnectedAt: null,
    needsAttention: false,
    connectedAt: new Date('2026-08-01T00:00:00Z'),
    lastEventPollAt: null as Date | null,
  };
}

function resetMocks() {
  connections = [activeConnection('t1')];
  contacts = [];
  companies = [];
  users = [];
  listCustomersMock.mockReset().mockResolvedValue({ data: [], has_more: false });
  listChargesMock.mockReset().mockResolvedValue({ data: [], has_more: false });
  listSubscriptionsMock.mockReset().mockResolvedValue({ data: [], has_more: false });
  listEventsMock.mockReset().mockResolvedValue({ data: [], has_more: false });
  createNotificationMock.mockClear();
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
        { id: 'ch_ok', amount: 1000, currency: 'usd', status: 'succeeded', refunded: false, amount_refunded: 0, created: 1700000000, receipt_url: 'https://pay.stripe.com/receipts/ch_ok' },
        { id: 'ch_refunded', amount: 2000, currency: 'usd', status: 'succeeded', refunded: true, amount_refunded: 2000, created: 1700000001, receipt_url: 'https://pay.stripe.com/receipts/ch_refunded' },
        { id: 'ch_failed', amount: 3000, currency: 'usd', status: 'failed', refunded: false, amount_refunded: 0, created: 1700000002, receipt_url: null },
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
        receiptUrl: 'https://pay.stripe.com/receipts/ch_ok',
      },
      {
        id: 'ch_refunded',
        type: 'charge_refunded',
        amountCents: 2000,
        currency: 'usd',
        createdAt: new Date(1700000001 * 1000).toISOString(),
        dashboardUrl: 'https://dashboard.stripe.com/test/payments/ch_refunded',
        receiptUrl: 'https://pay.stripe.com/receipts/ch_refunded',
      },
      {
        id: 'ch_failed',
        type: 'charge_failed',
        amountCents: 3000,
        currency: 'usd',
        createdAt: new Date(1700000002 * 1000).toISOString(),
        dashboardUrl: 'https://dashboard.stripe.com/test/payments/ch_failed',
        receiptUrl: null,
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

describe('notifyCompanyStripeEvent', () => {
  beforeEach(resetMocks);

  it('notifies the Company\'s Account Owner when one is set', async () => {
    await notifyCompanyStripeEvent('t1', { id: 'c1', accountOwnerId: 'u-account-owner' }, 'stripe_charge_refunded', 'A payment was refunded');

    expect(createNotificationMock).toHaveBeenCalledWith({
      tenantId: 't1',
      userId: 'u-account-owner',
      type: 'stripe_charge_refunded',
      entityType: 'company',
      entityId: 'c1',
      message: 'A payment was refunded',
    });
  });

  it('falls back to the tenant\'s active owner when there is no Account Owner', async () => {
    users = [{ id: 'u-owner', tenantId: 't1', role: 'owner', status: 'active' }];

    await notifyCompanyStripeEvent('t1', { id: 'c1', accountOwnerId: null }, 'stripe_charge_failed', 'A payment failed');

    expect(createNotificationMock).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u-owner' }));
  });

  it('never falls back to an admin — silently skips if no active owner exists either', async () => {
    users = [{ id: 'u-admin', tenantId: 't1', role: 'admin', status: 'active' }];

    await notifyCompanyStripeEvent('t1', { id: 'c1', accountOwnerId: null }, 'stripe_charge_failed', 'A payment failed');

    expect(createNotificationMock).not.toHaveBeenCalled();
  });
});

describe('processStripeWebhookEvent', () => {
  beforeEach(resetMocks);

  function stripeEvent(type: string, dataObject: Record<string, unknown>, previousAttributes?: Record<string, unknown>) {
    return { type, data: { object: dataObject, ...(previousAttributes ? { previous_attributes: previousAttributes } : {}) } };
  }

  it('discards an event with no customer on it, without ever looking up a Company', async () => {
    const result = await processStripeWebhookEvent('t1', stripeEvent('charge.refunded', {}));
    expect(result).toBe('no customer on event');
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('discards an event whose customer matches no Company in this tenant', async () => {
    const result = await processStripeWebhookEvent('t1', stripeEvent('charge.refunded', { customer: 'cus_unknown' }));
    expect(result).toBe('no matching Company');
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('never matches a customer id belonging to a different tenant', async () => {
    companies = [{ id: 'c1', tenantId: 't2', name: 'Other tenant Co', stripeCustomerId: 'cus_1', accountOwnerId: null }];
    const result = await processStripeWebhookEvent('t1', stripeEvent('charge.refunded', { customer: 'cus_1' }));
    expect(result).toBe('no matching Company');
  });

  it('notifies on charge.refunded with the refunded amount in the message', async () => {
    companies = [{ id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: 'cus_1', accountOwnerId: 'u1' }];
    const result = await processStripeWebhookEvent(
      't1',
      stripeEvent('charge.refunded', { customer: 'cus_1', amount_refunded: 2500, currency: 'usd' }),
    );
    expect(result).toBe('notified');
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'stripe_charge_refunded', message: 'A payment was refunded for Acme (25.00 USD)' }),
    );
  });

  it('notifies on charge.failed with the charge amount in the message', async () => {
    companies = [{ id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: 'cus_1', accountOwnerId: 'u1' }];
    const result = await processStripeWebhookEvent('t1', stripeEvent('charge.failed', { customer: 'cus_1', amount: 5000, currency: 'usd' }));
    expect(result).toBe('notified');
    expect(createNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'stripe_charge_failed', message: 'A payment failed for Acme (50.00 USD)' }),
    );
  });

  it('notifies on payment_intent.payment_failed', async () => {
    companies = [{ id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: 'cus_1', accountOwnerId: 'u1' }];
    const result = await processStripeWebhookEvent('t1', stripeEvent('payment_intent.payment_failed', { customer: 'cus_1' }));
    expect(result).toBe('notified');
    expect(createNotificationMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'stripe_payment_failed' }));
  });

  it('notifies on customer.subscription.deleted', async () => {
    companies = [{ id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: 'cus_1', accountOwnerId: 'u1' }];
    const result = await processStripeWebhookEvent('t1', stripeEvent('customer.subscription.deleted', { customer: 'cus_1' }));
    expect(result).toBe('notified');
    expect(createNotificationMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'stripe_subscription_canceled' }));
  });

  it('notifies on customer.subscription.updated only when status just transitioned into past_due', async () => {
    companies = [{ id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: 'cus_1', accountOwnerId: 'u1' }];
    const result = await processStripeWebhookEvent(
      't1',
      stripeEvent('customer.subscription.updated', { customer: 'cus_1', status: 'past_due' }, { status: 'active' }),
    );
    expect(result).toBe('notified');
    expect(createNotificationMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'stripe_subscription_past_due' }));
  });

  it('does NOT re-notify on an unrelated update to a subscription that is already past_due', async () => {
    companies = [{ id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: 'cus_1', accountOwnerId: 'u1' }];
    // previous_attributes has no `status` key at all — nothing about the status changed in this
    // particular update (e.g. a quantity or metadata change on an already-past_due subscription).
    const result = await processStripeWebhookEvent(
      't1',
      stripeEvent('customer.subscription.updated', { customer: 'cus_1', status: 'past_due' }, { quantity: 2 }),
    );
    expect(result).toBe('no relevant status transition');
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('does not notify on customer.subscription.updated when the new status is not past_due', async () => {
    companies = [{ id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: 'cus_1', accountOwnerId: 'u1' }];
    const result = await processStripeWebhookEvent(
      't1',
      stripeEvent('customer.subscription.updated', { customer: 'cus_1', status: 'active' }, { status: 'past_due' }),
    );
    expect(result).toBe('no relevant status transition');
    expect(createNotificationMock).not.toHaveBeenCalled();
  });

  it('acknowledges an event type it does not handle, without erroring', async () => {
    companies = [{ id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: 'cus_1', accountOwnerId: 'u1' }];
    const result = await processStripeWebhookEvent('t1', stripeEvent('customer.created', { customer: 'cus_1' }));
    expect(result).toBe('unhandled event type');
    expect(createNotificationMock).not.toHaveBeenCalled();
  });
});

// Twice-daily cron replacement for the per-tenant manual webhook (backlog QA, 2026-08-28) — feeds
// polled Events through the exact same processStripeWebhookEvent tested above, so these tests
// focus on the polling mechanics (cursor, pagination, per-tenant isolation) rather than
// re-covering event-type handling.
describe('runStripeEventPolling', () => {
  beforeEach(resetMocks);

  function stripeEvent(type: string, dataObject: Record<string, unknown>) {
    return { id: `evt_${Math.random()}`, type, data: { object: dataObject } };
  }

  it('polls from connectedAt when lastEventPollAt has never been set, and advances the cursor after', async () => {
    companies = [{ id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: 'cus_1', accountOwnerId: 'u1' }];
    listEventsMock.mockResolvedValueOnce({ data: [stripeEvent('charge.refunded', { customer: 'cus_1' })], has_more: false });

    const result = await runStripeEventPolling();

    expect(result).toEqual({ tenantsPolled: 1, eventsProcessed: 1, companiesLinked: 0, failed: 0 });
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
    const [, params] = listEventsMock.mock.calls[0];
    expect(params.createdGte).toBe(Math.floor(connections[0].connectedAt.getTime() / 1000));
    expect(connections[0].lastEventPollAt).toBeInstanceOf(Date);
  });

  it('polls from lastEventPollAt, not connectedAt, once a previous run has happened', async () => {
    const lastPoll = new Date('2026-08-15T00:00:00Z');
    connections[0].lastEventPollAt = lastPoll;

    await runStripeEventPolling();

    const [, params] = listEventsMock.mock.calls[0];
    expect(params.createdGte).toBe(Math.floor(lastPoll.getTime() / 1000));
  });

  it('follows pagination (starting_after/has_more) to collect every event before processing', async () => {
    companies = [{ id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: 'cus_1', accountOwnerId: 'u1' }];
    listEventsMock
      .mockResolvedValueOnce({ data: [stripeEvent('charge.refunded', { customer: 'cus_1' })], has_more: true })
      .mockResolvedValueOnce({ data: [stripeEvent('charge.failed', { customer: 'cus_1' })], has_more: false });

    const result = await runStripeEventPolling();

    expect(result.eventsProcessed).toBe(2);
    expect(listEventsMock).toHaveBeenCalledTimes(2);
    expect(createNotificationMock).toHaveBeenCalledTimes(2);
  });

  it('skips disconnected connections entirely', async () => {
    connections = [{ ...activeConnection('t1'), disconnectedAt: new Date() }];

    const result = await runStripeEventPolling();

    expect(result).toEqual({ tenantsPolled: 0, eventsProcessed: 0, companiesLinked: 0, failed: 0 });
    expect(listEventsMock).not.toHaveBeenCalled();
  });

  it('marks needsAttention on a revoked/expired key (401/403), without throwing', async () => {
    listEventsMock.mockRejectedValueOnce(new StripeApiError(401, 'revoked'));

    const result = await runStripeEventPolling();

    expect(result).toEqual({ tenantsPolled: 1, eventsProcessed: 0, companiesLinked: 0, failed: 1 });
    expect(connections[0].needsAttention).toBe(true);
  });

  it('one tenant failing does not stop the rest from being polled', async () => {
    connections = [activeConnection('t1'), activeConnection('t2')];
    companies = [{ id: 'c2', tenantId: 't2', name: 'Beta', stripeCustomerId: 'cus_2', accountOwnerId: 'u1' }];
    listEventsMock
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({ data: [stripeEvent('charge.refunded', { customer: 'cus_2' })], has_more: false });

    const result = await runStripeEventPolling();

    expect(result).toEqual({ tenantsPolled: 2, eventsProcessed: 1, companiesLinked: 0, failed: 1 });
  });

  it('auto-links an unambiguous Company match before polling, so it can be notified in the same run', async () => {
    companies = [{ id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: null, accountOwnerId: 'u1' }];
    contacts = [{ tenantId: 't1', companyId: 'c1', isActive: true, email: 'a@example.com' }];
    listCustomersMock.mockResolvedValue({ data: [{ id: 'cus_1', email: 'a@example.com', name: 'A Co' }], has_more: false });
    listEventsMock.mockResolvedValueOnce({
      data: [{ id: 'evt_1', type: 'charge.refunded', data: { object: { customer: 'cus_1' } } }],
      has_more: false,
    });

    const result = await runStripeEventPolling();

    expect(result).toEqual({ tenantsPolled: 1, eventsProcessed: 1, companiesLinked: 1, failed: 0 });
    expect(companies[0].stripeCustomerId).toBe('cus_1');
    expect(createNotificationMock).toHaveBeenCalledTimes(1);
  });
});

// Automatic counterpart to the manual "Search on Stripe" flow (routes/payments.ts) — reuses
// searchStripeCustomersForCompany/linkCompanyToStripeCustomer unchanged, so this only tests the
// checked/linked bookkeeping and the 0/1/2+ match decision, not the matching logic itself (already
// covered by searchStripeCustomersForCompany's own tests above).
describe('autoLinkUnmatchedCompanies', () => {
  beforeEach(resetMocks);

  it('auto-links a Company with exactly one Stripe Customer match', async () => {
    companies = [{ id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: null, accountOwnerId: 'u1' }];
    contacts = [{ tenantId: 't1', companyId: 'c1', isActive: true, email: 'a@example.com' }];
    listCustomersMock.mockResolvedValue({ data: [{ id: 'cus_1', email: 'a@example.com', name: 'A Co' }], has_more: false });

    const result = await autoLinkUnmatchedCompanies('t1');

    expect(result).toEqual({ checked: 1, linked: 1 });
    expect(companies[0].stripeCustomerId).toBe('cus_1');
    expect(companies[0].stripeCustomerMatchedVia).toBe('a@example.com');
  });

  it('does not link when there are zero matches', async () => {
    companies = [{ id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: null, accountOwnerId: 'u1' }];
    contacts = [{ tenantId: 't1', companyId: 'c1', isActive: true, email: 'nobody@example.com' }];

    const result = await autoLinkUnmatchedCompanies('t1');

    expect(result).toEqual({ checked: 1, linked: 0 });
    expect(companies[0].stripeCustomerId).toBeNull();
  });

  it('does not link when there are 2+ matches — leaves it for the manual flow to disambiguate', async () => {
    companies = [{ id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: null, accountOwnerId: 'u1' }];
    contacts = [
      { tenantId: 't1', companyId: 'c1', isActive: true, email: 'a@example.com' },
      { tenantId: 't1', companyId: 'c1', isActive: true, email: 'b@example.com' },
    ];
    listCustomersMock
      .mockResolvedValueOnce({ data: [{ id: 'cus_1', email: 'a@example.com', name: 'A Co' }], has_more: false })
      .mockResolvedValueOnce({ data: [{ id: 'cus_2', email: 'b@example.com', name: 'B Co' }], has_more: false });

    const result = await autoLinkUnmatchedCompanies('t1');

    expect(result).toEqual({ checked: 1, linked: 0 });
    expect(companies[0].stripeCustomerId).toBeNull();
  });

  it('ignores Companies that are already linked', async () => {
    companies = [{ id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: 'cus_existing', accountOwnerId: 'u1' }];

    const result = await autoLinkUnmatchedCompanies('t1');

    expect(result).toEqual({ checked: 0, linked: 0 });
    expect(listCustomersMock).not.toHaveBeenCalled();
  });

  it('one Company failing does not stop the others from being checked', async () => {
    companies = [
      { id: 'c1', tenantId: 't1', name: 'Acme', stripeCustomerId: null, accountOwnerId: 'u1' },
      { id: 'c2', tenantId: 't1', name: 'Beta', stripeCustomerId: null, accountOwnerId: 'u1' },
    ];
    contacts = [
      { tenantId: 't1', companyId: 'c1', isActive: true, email: 'broken@example.com' },
      { tenantId: 't1', companyId: 'c2', isActive: true, email: 'b@example.com' },
    ];
    listCustomersMock
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({ data: [{ id: 'cus_2', email: 'b@example.com', name: 'B Co' }], has_more: false });

    const result = await autoLinkUnmatchedCompanies('t1');

    expect(result).toEqual({ checked: 2, linked: 1 });
    expect(companies[1].stripeCustomerId).toBe('cus_2');
  });
});
