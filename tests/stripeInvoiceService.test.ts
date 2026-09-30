import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptStripeSecret } from '../src/lib/stripeEncryption.js';

process.env.STRIPE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');

let connections: any[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    stripeConnection: {
      findUnique: vi.fn(async ({ where }: any) => connections.find((c) => c.tenantId === where.tenantId) ?? null),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = connections.filter((c) => c.tenantId === where.tenantId && c.disconnectedAt === null);
        for (const match of matches) Object.assign(match, data);
        return { count: matches.length };
      }),
    },
  },
}));

const { recordActivityMock } = vi.hoisted(() => ({ recordActivityMock: vi.fn(async () => {}) }));
vi.mock('../src/modules/activity/activityLogService.js', () => ({ recordActivity: recordActivityMock }));

const { createInvoiceMock, createInvoiceItemMock, finalizeInvoiceMock, sendInvoiceMock, deleteDraftInvoiceMock, listInvoicesMock } =
  vi.hoisted(() => ({
    createInvoiceMock: vi.fn(),
    createInvoiceItemMock: vi.fn(),
    finalizeInvoiceMock: vi.fn(),
    sendInvoiceMock: vi.fn(),
    deleteDraftInvoiceMock: vi.fn(),
    listInvoicesMock: vi.fn(),
  }));
vi.mock('../src/lib/stripe.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/stripe.js')>('../src/lib/stripe.js');
  return {
    ...actual,
    createInvoice: createInvoiceMock,
    createInvoiceItem: createInvoiceItemMock,
    finalizeInvoice: finalizeInvoiceMock,
    sendInvoice: sendInvoiceMock,
    deleteDraftInvoice: deleteDraftInvoiceMock,
    listInvoices: listInvoicesMock,
  };
});

import { StripeApiError } from '../src/lib/stripe.js';
import {
  CompanyNotLinkedError,
  InvoiceValidationError,
  listCompanyInvoices,
  sendCompanyInvoice,
  StripeKeyPermissionError,
} from '../src/modules/integrations/stripeInvoiceService.js';

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'in_1',
    number: null,
    status: 'draft',
    currency: 'usd',
    amount_due: 0,
    amount_remaining: 0,
    created: 1790000000,
    due_date: null,
    hosted_invoice_url: null,
    description: null,
    metadata: {},
    ...overrides,
  };
}

const FINALIZED = invoice({
  status: 'open',
  number: 'INV-0001',
  amount_due: 15000,
  amount_remaining: 15000,
  due_date: 1792592000,
  hosted_invoice_url: 'https://invoice.stripe.com/i/abc',
});

const company = { id: 'c1', name: 'Acme', stripeCustomerId: 'cus_1' };

function baseInput(overrides: Record<string, unknown> = {}): any {
  return {
    tenantId: 't1',
    userId: 'u1',
    company,
    currency: 'USD',
    lines: [
      { description: 'Consulting', amountCents: 10000 },
      { description: 'Setup fee', amountCents: 5000 },
    ],
    daysUntilDue: 30,
    memo: '  Thanks!  ',
    requestId: 'req-12345678',
    ...overrides,
  };
}

beforeEach(() => {
  connections = [
    {
      tenantId: 't1',
      apiKeyEncrypted: encryptStripeSecret('rk_test_abc'),
      apiKeyMode: 'test',
      disconnectedAt: null,
      needsAttention: false,
    },
  ];
  recordActivityMock.mockClear();
  createInvoiceMock.mockReset().mockResolvedValue(invoice());
  createInvoiceItemMock.mockReset().mockResolvedValue({ id: 'ii_1' });
  finalizeInvoiceMock.mockReset().mockResolvedValue(FINALIZED);
  sendInvoiceMock.mockReset().mockResolvedValue(FINALIZED);
  deleteDraftInvoiceMock.mockReset().mockResolvedValue(undefined);
  listInvoicesMock.mockReset().mockResolvedValue({ data: [], has_more: false });
});

describe('sendCompanyInvoice', () => {
  it('creates a send_invoice draft, attaches every line to it by id, finalizes, and emails it', async () => {
    const result = await sendCompanyInvoice(baseInput());

    expect(createInvoiceMock).toHaveBeenCalledWith(
      'rk_test_abc',
      {
        customer: 'cus_1',
        currency: 'usd',
        daysUntilDue: 30,
        description: 'Thanks!',
        metadata: { northstack_sent: 'true', northstack_company_id: 'c1' },
      },
      'northstack-invoice-req-12345678-create',
    );
    expect(createInvoiceItemMock).toHaveBeenCalledTimes(2);
    expect(createInvoiceItemMock).toHaveBeenNthCalledWith(
      1,
      'rk_test_abc',
      { customer: 'cus_1', invoice: 'in_1', amount: 10000, currency: 'usd', description: 'Consulting' },
      'northstack-invoice-req-12345678-line-0',
    );
    expect(createInvoiceItemMock).toHaveBeenNthCalledWith(
      2,
      'rk_test_abc',
      { customer: 'cus_1', invoice: 'in_1', amount: 5000, currency: 'usd', description: 'Setup fee' },
      'northstack-invoice-req-12345678-line-1',
    );
    expect(finalizeInvoiceMock).toHaveBeenCalledWith('rk_test_abc', 'in_1', 'northstack-invoice-req-12345678-finalize');
    expect(sendInvoiceMock).toHaveBeenCalledWith('rk_test_abc', 'in_1', 'northstack-invoice-req-12345678-send');

    expect(result).toEqual({
      id: 'in_1',
      number: 'INV-0001',
      status: 'open',
      amountDueCents: 15000,
      currency: 'usd',
      dueDate: new Date(1792592000 * 1000).toISOString(),
      hostedInvoiceUrl: 'https://invoice.stripe.com/i/abc',
      dashboardUrl: 'https://dashboard.stripe.com/test/invoices/in_1',
      emailSent: true,
    });
  });

  it("logs the invoice on the Company's Activity tab", async () => {
    await sendCompanyInvoice(baseInput());
    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        entityType: 'stripeInvoice',
        entityId: 'in_1',
        entityLabel: 'INV-0001',
        action: 'create',
        changedByUserId: 'u1',
        parentEntityType: 'company',
        parentEntityId: 'c1',
        after: expect.objectContaining({ total: '150.00 USD', lineCount: 2, memo: 'Thanks!' }),
      }),
    );
  });

  it('sends zero-decimal currencies to Stripe in whole units', async () => {
    await sendCompanyInvoice(baseInput({ currency: 'jpy', lines: [{ description: 'Service', amountCents: 500000 }] }));
    expect(createInvoiceItemMock).toHaveBeenCalledWith(
      'rk_test_abc',
      expect.objectContaining({ amount: 5000, currency: 'jpy' }),
      expect.any(String),
    );
  });

  it('rejects a fractional amount in a zero-decimal currency before calling Stripe', async () => {
    await expect(
      sendCompanyInvoice(baseInput({ currency: 'jpy', lines: [{ description: 'Service', amountCents: 150 }] })),
    ).rejects.toBeInstanceOf(InvoiceValidationError);
    expect(createInvoiceMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no lines', { lines: [] }],
    ['a blank description', { lines: [{ description: '   ', amountCents: 100 }] }],
    ['a zero amount', { lines: [{ description: 'x', amountCents: 0 }] }],
    ['a negative amount', { lines: [{ description: 'x', amountCents: -500 }] }],
    ['a non-integer amount', { lines: [{ description: 'x', amountCents: 10.5 }] }],
    ['an invalid currency', { currency: 'dollars' }],
    ['days until due over a year', { daysUntilDue: 400 }],
    ['a missing requestId', { requestId: undefined }],
    ['more than 20 lines', { lines: Array.from({ length: 21 }, () => ({ description: 'x', amountCents: 100 })) }],
  ])('rejects %s without calling Stripe', async (_label, overrides) => {
    await expect(sendCompanyInvoice(baseInput(overrides))).rejects.toBeInstanceOf(InvoiceValidationError);
    expect(createInvoiceMock).not.toHaveBeenCalled();
  });

  it('refuses a Company that is not linked to a Stripe customer', async () => {
    await expect(
      sendCompanyInvoice(baseInput({ company: { ...company, stripeCustomerId: null } })),
    ).rejects.toBeInstanceOf(CompanyNotLinkedError);
    expect(createInvoiceMock).not.toHaveBeenCalled();
  });

  it('turns a 403 into a "key needs Invoices: Write" error WITHOUT flagging the connection', async () => {
    createInvoiceMock.mockRejectedValue(new StripeApiError(403, 'The provided key does not have the required permissions'));
    await expect(sendCompanyInvoice(baseInput())).rejects.toBeInstanceOf(StripeKeyPermissionError);
    expect(connections[0].needsAttention).toBe(false);
  });

  it('flags the connection as needing attention on a 401 (revoked key)', async () => {
    createInvoiceMock.mockRejectedValue(new StripeApiError(401, 'Invalid API Key'));
    await expect(sendCompanyInvoice(baseInput())).rejects.toBeInstanceOf(StripeApiError);
    expect(connections[0].needsAttention).toBe(true);
  });

  it('deletes the draft when adding a line fails, so no half-built invoice is left in Stripe', async () => {
    createInvoiceItemMock.mockResolvedValueOnce({ id: 'ii_1' }).mockRejectedValueOnce(new StripeApiError(400, 'Invalid currency'));
    await expect(sendCompanyInvoice(baseInput())).rejects.toThrow('Invalid currency');
    expect(deleteDraftInvoiceMock).toHaveBeenCalledWith('rk_test_abc', 'in_1');
    expect(finalizeInvoiceMock).not.toHaveBeenCalled();
    expect(recordActivityMock).not.toHaveBeenCalled();
  });

  it('deletes the draft when finalizing fails', async () => {
    finalizeInvoiceMock.mockRejectedValue(new StripeApiError(400, 'Customer has no address'));
    await expect(sendCompanyInvoice(baseInput())).rejects.toThrow('Customer has no address');
    expect(deleteDraftInvoiceMock).toHaveBeenCalledWith('rk_test_abc', 'in_1');
  });

  it('still reports the original error if deleting the draft also fails', async () => {
    finalizeInvoiceMock.mockRejectedValue(new StripeApiError(400, 'Customer has no address'));
    deleteDraftInvoiceMock.mockRejectedValue(new Error('network down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(sendCompanyInvoice(baseInput())).rejects.toThrow('Customer has no address');
    consoleError.mockRestore();
  });

  it('returns emailSent: false (not an error) when the invoice finalized but Stripe could not email it', async () => {
    sendInvoiceMock.mockRejectedValue(new StripeApiError(400, 'Customer has no email'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await sendCompanyInvoice(baseInput());
    consoleError.mockRestore();
    expect(result.emailSent).toBe(false);
    expect(result.hostedInvoiceUrl).toBe('https://invoice.stripe.com/i/abc');
    expect(deleteDraftInvoiceMock).not.toHaveBeenCalled();
    expect(recordActivityMock).toHaveBeenCalled();
  });

  it('fails cleanly when the tenant has no active Stripe connection', async () => {
    connections = [];
    await expect(sendCompanyInvoice(baseInput())).rejects.toThrow('no active Stripe connection');
    expect(createInvoiceMock).not.toHaveBeenCalled();
  });
});

describe('listCompanyInvoices', () => {
  it('returns nothing without calling Stripe for an unlinked Company', async () => {
    expect(await listCompanyInvoices('t1', { stripeCustomerId: null })).toEqual({ invoices: [], nextCursor: null });
    expect(listInvoicesMock).not.toHaveBeenCalled();
  });

  it('hides drafts, flags Northstack-sent invoices, and pages from the last fetched id', async () => {
    listInvoicesMock.mockResolvedValue({
      data: [
        { ...FINALIZED, id: 'in_a', metadata: { northstack_sent: 'true' } },
        { ...FINALIZED, id: 'in_b', status: 'paid', amount_remaining: 0 },
        invoice({ id: 'in_draft' }),
      ],
      has_more: true,
    });

    const page = await listCompanyInvoices('t1', { stripeCustomerId: 'cus_1' });
    expect(page.invoices.map((i) => i.id)).toEqual(['in_a', 'in_b']);
    expect(page.invoices[0]).toMatchObject({ sentFromNorthstack: true, amountRemainingCents: 15000 });
    expect(page.invoices[1]).toMatchObject({ sentFromNorthstack: false, status: 'paid', amountRemainingCents: 0 });
    expect(page.nextCursor).toBe('in_draft');
  });

  it('reports a read-permission error for a key without Invoices access, without flagging the connection', async () => {
    listInvoicesMock.mockRejectedValue(new StripeApiError(403, 'insufficient permissions'));
    await expect(listCompanyInvoices('t1', { stripeCustomerId: 'cus_1' })).rejects.toMatchObject({ access: 'read' });
    expect(connections[0].needsAttention).toBe(false);
  });
});
