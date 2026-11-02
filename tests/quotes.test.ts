import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    opportunity: { findFirst: vi.fn() },
    product: { findMany: vi.fn() },
    quote: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    pipelineStageDefinition: { findFirst: vi.fn() },
    tenant: { findUniqueOrThrow: vi.fn() },
  },
}));
vi.mock('../src/modules/crm/opportunityService.js', () => ({ updateOpportunity: vi.fn() }));

import prisma from '../src/lib/prisma.js';
import { updateOpportunity } from '../src/modules/crm/opportunityService.js';
import { createQuote, hashQuoteToken, quoteTotals, renderQuotePdf, respondToQuote, sendQuote, updateQuote } from '../src/modules/crm/quoteService.js';
import { renderQuotePage } from '../src/modules/crm/quotePage.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
beforeEach(() => {
  vi.clearAllMocks();
  db.quote.create.mockImplementation(async ({ data }) => data);
});

describe('quotes', () => {
  it('totals with a discount', () => {
    expect(quoteTotals([{ name: 'A', quantity: 2, unitPriceCents: 1000, billing: 'monthly' }, { name: 'B', quantity: 1, unitPriceCents: 500, billing: 'one_time' }], 10)).toEqual({
      subtotalCents: 2500,
      discountPct: 10,
      totalCents: 2250,
    });
  });

  it('prices catalog lines from the catalog, snapshots them, refuses another tenant’s product', async () => {
    db.opportunity.findFirst.mockResolvedValue({ id: 'o1', currency: 'ARS' });
    db.quote.findFirst.mockResolvedValue({ number: 7 });
    db.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Plan Pro', description: null, unitPriceCents: 500000, billing: 'monthly' }]);
    const q = await createQuote('t1', 'u1', { opportunityId: 'o1', lines: [{ productId: 'p1', quantity: 3 }, { name: 'Implementación', unitPriceCents: 200000, quantity: 1 }] });
    expect(q).toMatchObject({ tenantId: 't1', number: 8, currency: 'ARS', subtotalCents: 1700000, totalCents: 1700000 });
    expect((q.lines as { name: string }[]).map((l) => l.name)).toEqual(['Plan Pro', 'Implementación']);
    expect(db.product.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', id: { in: ['p1'] } });

    db.product.findMany.mockResolvedValue([]);
    await expect(createQuote('t1', 'u1', { opportunityId: 'o1', lines: [{ productId: 'p-of-B' }] })).rejects.toMatchObject({ status: 404 });
  });

  it('only a draft can be edited; sending stores just the link hash', async () => {
    db.quote.findFirst.mockResolvedValue({ id: 'q1', status: 'sent', lines: [], discountPct: 0 });
    await expect(updateQuote('t1', 'q1', { notes: 'x' })).rejects.toMatchObject({ code: 'not_draft' });
    db.quote.findFirst.mockResolvedValue({ id: 'q1', status: 'draft', sentAt: null });
    const { token } = await sendQuote('t1', 'q1');
    expect(db.quote.update.mock.calls[0][0].data).toMatchObject({ status: 'sent', tokenHash: hashQuoteToken(token) });
    expect(JSON.stringify(db.quote.update.mock.calls[0][0].data)).not.toContain(token);
  });

  it('accepting wins the deal (checklist skipped) and only once', async () => {
    const token = 'a'.repeat(43);
    db.quote.findUnique.mockResolvedValue({ id: 'q1', tenantId: 't1', status: 'sent', validUntil: new Date(Date.now() + 86_400_000), opportunity: { id: 'o1', pipelineId: 'p1' }, tenant: {} });
    db.quote.updateMany.mockResolvedValueOnce({ count: 1 });
    db.pipelineStageDefinition.findFirst.mockResolvedValue({ id: 's-won' });
    await respondToQuote(token, { accept: true, name: 'Ana Paz', ip: '1.2.3.4' });
    expect(db.quote.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'accepted', acceptedName: 'Ana Paz', acceptedIp: '1.2.3.4' });
    expect(updateOpportunity).toHaveBeenCalledWith('o1', 't1', { stageId: 's-won' }, expect.anything(), { skipChecklist: true });

    db.quote.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(respondToQuote(token, { accept: true, name: 'Ana', ip: 'x' })).rejects.toMatchObject({ code: 'already_answered' });
  });

  it('declining does not move the deal, and accepting needs a name', async () => {
    const token = 'b'.repeat(43);
    db.quote.findUnique.mockResolvedValue({ id: 'q1', tenantId: 't1', status: 'sent', validUntil: new Date(Date.now() + 86_400_000), opportunity: { id: 'o1', pipelineId: 'p1' }, tenant: {} });
    await expect(respondToQuote(token, { accept: true, name: ' ', ip: 'x' })).rejects.toMatchObject({ code: 'name_required' });
    db.quote.updateMany.mockResolvedValue({ count: 1 });
    await respondToQuote(token, { accept: false, name: '', reason: 'Caro', ip: 'x' });
    expect(updateOpportunity).not.toHaveBeenCalled();
  });

  it('the client page escapes every line and runs its script under the nonce', () => {
    const html = renderQuotePage({
      nonce: 'n1',
      lang: 'es',
      token: 't',
      number: 3,
      companyName: '<b>Acme</b>',
      tenantName: 'Atlas',
      dealName: 'Pro',
      logoUrl: null,
      lines: [{ name: '<script>alert(1)</script>', quantity: 1, unitPriceCents: 100, billing: 'one_time' }],
      subtotalCents: 100,
      discountPct: 0,
      totalCents: 100,
      notes: null,
      validUntil: '2026-12-01',
      status: 'sent',
      money: (c) => `$${c / 100}`,
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;b&gt;Acme&lt;/b&gt;');
    expect(html).toContain('<script nonce="n1">');
  });

  it('renders a real PDF, with accents and a discount', async () => {
    db.quote.findFirst.mockResolvedValue({
      id: 'q1',
      number: 12,
      currency: 'ARS',
      lines: [{ name: 'Implementación y capacitación', quantity: 2, unitPriceCents: 150000, billing: 'one_time' }, { name: 'Plan Pro', quantity: 1, unitPriceCents: 500000, billing: 'monthly' }],
      discountPct: 10,
      subtotalCents: 800000,
      totalCents: 720000,
      notes: 'Pago a 30 días.' + String.fromCharCode(10) + 'Incluye soporte.',
      validUntil: new Date('2026-12-01T00:00:00Z'),
      opportunity: { name: 'Acme · Pro', company: { name: 'Acme SA' } },
    });
    db.tenant.findUniqueOrThrow.mockResolvedValue({ id: 't1', name: 'Atlas Consultores', legalName: null, address: 'Av. Siempre Viva 123', phone: null, website: null, country: 'AR', logoData: null, logoMimeType: null, logoUpdatedAt: null });
    const pdf = await renderQuotePdf('q1', 't1', 'es');
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
