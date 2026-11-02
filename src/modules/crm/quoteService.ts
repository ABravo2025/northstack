import { createHash, randomBytes } from 'node:crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Prisma, ProductBilling } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { drawCompanyHeader } from '../../lib/pdfCompanyHeader.js';
import { toTenantBranding } from '../tenant/tenantProfileService.js';
import { updateOpportunity } from './opportunityService.js';

// Cruces D3 (spec-clientes-gastos-formularios.md): quotes built from the product catalog. A quote
// is a snapshot of its lines; "send" makes a private link (only its hash is stored) and a PDF.
// When the client accepts on the link, the deal moves to its pipeline's Won stage and its owner is
// told (the hand-off panel then shows on the deal).

export class QuoteError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string,
  ) {
    super(message);
  }
}

export interface QuoteLine {
  productId?: string | null;
  name: string;
  description?: string | null;
  quantity: number;
  unitPriceCents: number;
  billing: ProductBilling;
}

const DAY = 86_400_000;
export const hashQuoteToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function quoteTotals(lines: QuoteLine[], discountPct: number) {
  const subtotal = lines.reduce((a, l) => a + l.unitPriceCents * l.quantity, 0);
  const pct = Math.min(Math.max(Math.round(discountPct), 0), 100);
  return { subtotalCents: subtotal, discountPct: pct, totalCents: Math.round(subtotal * (1 - pct / 100)) };
}

// Lines from a request: catalog products are priced from the catalog unless a price is given;
// free lines need a name and a price. Everything is checked against the tenant.
async function cleanLines(tenantId: string, raw: unknown): Promise<QuoteLine[]> {
  if (!Array.isArray(raw) || raw.length === 0) throw new QuoteError('Add at least one line', 400, 'no_lines');
  if (raw.length > 50) throw new QuoteError('50 lines at most', 400);
  const ids = raw.map((l) => (l && typeof l === 'object' ? (l as { productId?: unknown }).productId : null)).filter((x): x is string => typeof x === 'string');
  const products = new Map((await prisma.product.findMany({ where: { tenantId, id: { in: ids } } })).map((p) => [p.id, p]));
  return raw.map((item) => {
    const r = (item ?? {}) as Record<string, unknown>;
    const product = typeof r.productId === 'string' ? products.get(r.productId) : undefined;
    if (typeof r.productId === 'string' && !product) throw new QuoteError('Product not found', 404);
    const quantity = Number(r.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100_000) throw new QuoteError('Quantity must be 1 or more', 400);
    const price = r.unitPriceCents === undefined || r.unitPriceCents === null ? product?.unitPriceCents : Number(r.unitPriceCents);
    if (price === undefined || !Number.isSafeInteger(price) || price < 0) throw new QuoteError('Every line needs a price', 400, 'invalid_price');
    const name = (typeof r.name === 'string' && r.name.trim() ? r.name.trim() : product?.name ?? '').slice(0, 200);
    if (!name) throw new QuoteError('Every line needs a name', 400);
    const billing = (['one_time', 'monthly', 'yearly'] as ProductBilling[]).includes(r.billing as ProductBilling) ? (r.billing as ProductBilling) : (product?.billing ?? 'one_time');
    return {
      productId: product?.id ?? null,
      name,
      description: typeof r.description === 'string' ? r.description.trim().slice(0, 500) || null : (product?.description ?? null),
      quantity,
      unitPriceCents: price,
      billing,
    };
  });
}

async function nextNumber(tenantId: string) {
  const last = await prisma.quote.findFirst({ where: { tenantId }, orderBy: { number: 'desc' }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}

export async function listQuotes(tenantId: string, opportunityId: string) {
  return prisma.quote.findMany({ where: { tenantId, opportunityId }, orderBy: { number: 'desc' } });
}

export async function createQuote(
  tenantId: string,
  userId: string,
  input: { opportunityId: string; lines: unknown; discountPct?: number; notes?: string | null; validDays?: number },
) {
  const opp = await prisma.opportunity.findFirst({ where: { id: input.opportunityId, tenantId }, select: { id: true, currency: true } });
  if (!opp) throw new QuoteError('Opportunity not found', 404);
  const lines = await cleanLines(tenantId, input.lines);
  const totals = quoteTotals(lines, input.discountPct ?? 0);
  const validDays = Math.min(Math.max(Number(input.validDays) || 15, 1), 365);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.quote.create({
        data: {
          tenantId,
          opportunityId: opp.id,
          number: await nextNumber(tenantId),
          currency: opp.currency,
          lines: lines as unknown as Prisma.InputJsonArray,
          ...totals,
          notes: input.notes?.trim().slice(0, 3000) || null,
          validUntil: new Date(Date.now() + validDays * DAY),
          createdById: userId,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002' || attempt === 2) throw error;
    }
  }
  throw new QuoteError('Could not number the quote', 500);
}

export async function updateQuote(tenantId: string, id: string, input: { lines?: unknown; discountPct?: number; notes?: string | null; validDays?: number }) {
  const quote = await prisma.quote.findFirst({ where: { id, tenantId } });
  if (!quote) throw new QuoteError('Quote not found', 404);
  if (quote.status !== 'draft') throw new QuoteError('Only a draft can be edited: make a new one', 409, 'not_draft');
  const lines = input.lines !== undefined ? await cleanLines(tenantId, input.lines) : (quote.lines as unknown as QuoteLine[]);
  const totals = quoteTotals(lines, input.discountPct ?? quote.discountPct);
  return prisma.quote.update({
    where: { id },
    data: {
      lines: lines as unknown as Prisma.InputJsonArray,
      ...totals,
      ...(input.notes !== undefined ? { notes: input.notes?.trim().slice(0, 3000) || null } : {}),
      ...(input.validDays !== undefined ? { validUntil: new Date(Date.now() + Math.min(Math.max(Number(input.validDays) || 15, 1), 365) * DAY) } : {}),
    },
  });
}

// Send: freezes the quote and returns the private link's token (shown once, to copy or email).
export async function sendQuote(tenantId: string, id: string) {
  const quote = await prisma.quote.findFirst({ where: { id, tenantId } });
  if (!quote) throw new QuoteError('Quote not found', 404);
  if (quote.status === 'accepted' || quote.status === 'declined') throw new QuoteError('This quote is closed', 409, 'closed');
  const token = randomBytes(32).toString('base64url');
  await prisma.quote.update({ where: { id }, data: { status: 'sent', sentAt: quote.sentAt ?? new Date(), tokenHash: hashQuoteToken(token) } });
  return { token };
}

export async function findQuoteByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) return null;
  return prisma.quote.findUnique({
    where: { tokenHash: hashQuoteToken(token) },
    include: { tenant: true, opportunity: { select: { id: true, name: true, pipelineId: true, company: { select: { name: true } } } } },
  });
}

export async function respondToQuote(token: string, input: { accept: boolean; name: string; reason?: string | null; ip: string }) {
  const quote = await findQuoteByToken(token);
  if (!quote) throw new QuoteError('Quote not found', 404, 'not_found');
  if (quote.status !== 'sent') throw new QuoteError('This quote was already answered', 409, 'already_answered');
  if (quote.validUntil.getTime() < Date.now() - DAY) throw new QuoteError('This quote expired', 410, 'expired');
  const name = input.name.trim().slice(0, 200);
  if (input.accept && !name) throw new QuoteError('Type your name to accept', 400, 'name_required');

  // Only one answer, even with two tabs open.
  const claimed = await prisma.quote.updateMany({
    where: { id: quote.id, status: 'sent' },
    data: input.accept
      ? { status: 'accepted', acceptedAt: new Date(), acceptedName: name, acceptedIp: input.ip.slice(0, 100) }
      : { status: 'declined', declinedAt: new Date(), declineReason: input.reason?.trim().slice(0, 1000) || null },
  });
  if (claimed.count === 0) throw new QuoteError('This quote was already answered', 409, 'already_answered');

  if (input.accept) {
    const won = await prisma.pipelineStageDefinition.findFirst({
      where: { pipelineId: quote.opportunity.pipelineId, outcome: 'won', isActive: true },
      orderBy: { order: 'asc' },
    });
    // Moving it notifies the owner (no changedByUserId: the client did it).
    if (won) await updateOpportunity(quote.opportunity.id, quote.tenantId, { stageId: won.id }, prisma, { skipChecklist: true });
  }
  return { status: input.accept ? 'accepted' : 'declined' };
}

// --- PDF ---------------------------------------------------------------------------------------------

const safe = (t: string) => t.replace(/[^\x20-\x7e\xa0-\xff]/g, '?');

export async function renderQuotePdf(quoteId: string, tenantId: string, lang: 'es' | 'en'): Promise<Uint8Array> {
  const quote = await prisma.quote.findFirst({ where: { id: quoteId, tenantId }, include: { opportunity: { select: { name: true, company: { select: { name: true } } } } } });
  if (!quote) throw new QuoteError('Quote not found', 404);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const L =
    lang === 'es'
      ? { title: 'Presupuesto', for: 'Para', valid: 'Válido hasta', item: 'Detalle', qty: 'Cant.', price: 'Precio', total: 'Total', subtotal: 'Subtotal', discount: 'Descuento', monthly: '/mes', yearly: '/año', notes: 'Notas' }
      : { title: 'Quote', for: 'For', valid: 'Valid until', item: 'Item', qty: 'Qty', price: 'Price', total: 'Total', subtotal: 'Subtotal', discount: 'Discount', monthly: '/month', yearly: '/year', notes: 'Notes' };
  const money = (cents: number) =>
    new Intl.NumberFormat(tenant.country === 'US' ? 'en-US' : 'es-AR', { style: 'currency', currency: quote.currency, currencyDisplay: 'code' }).format(cents / 100);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([612, 792]);
  let y = 740;
  y = await drawCompanyHeader({ doc, page, font, boldFont: bold, branding: toTenantBranding(tenant), y });
  const text = (t: string, x: number, size = 10, isBold = false, color = rgb(0, 0, 0)) => page.drawText(safe(t), { x, y, size, font: isBold ? bold : font, color });
  const right = (t: string, xRight: number, size = 10, isBold = false) => {
    const s = safe(t);
    page.drawText(s, { x: xRight - (isBold ? bold : font).widthOfTextAtSize(s, size), y, size, font: isBold ? bold : font });
  };

  y -= 6;
  text(`${L.title} #${quote.number}`, 50, 16, true);
  y -= 18;
  text(`${L.for}: ${quote.opportunity.company.name} - ${quote.opportunity.name}`, 50, 10, false, rgb(0.3, 0.3, 0.3));
  y -= 14;
  text(`${L.valid}: ${quote.validUntil.toISOString().slice(0, 10)}`, 50, 10, false, rgb(0.3, 0.3, 0.3));
  y -= 24;
  text(L.item, 50, 9, true);
  right(L.qty, 400, 9, true);
  right(L.price, 480, 9, true);
  right(L.total, 562, 9, true);
  y -= 6;
  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  y -= 14;
  for (const l of quote.lines as unknown as QuoteLine[]) {
    if (y < 120) {
      page = doc.addPage([612, 792]);
      y = 740;
    }
    const suffix = l.billing === 'monthly' ? L.monthly : l.billing === 'yearly' ? L.yearly : '';
    let name = safe(l.name);
    while (name.length > 1 && font.widthOfTextAtSize(name, 10) > 290) name = name.slice(0, -2);
    text(name, 50, 10);
    right(String(l.quantity), 400);
    right(`${money(l.unitPriceCents)}${suffix}`, 480, 9);
    right(`${money(l.unitPriceCents * l.quantity)}${suffix}`, 562, 9);
    y -= 14;
  }
  y -= 4;
  page.drawLine({ start: { x: 330, y: y + 8 }, end: { x: 562, y: y + 8 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  if (quote.discountPct) {
    text(L.subtotal, 330, 10);
    right(money(quote.subtotalCents), 562);
    y -= 14;
    text(`${L.discount} (${quote.discountPct}%)`, 330, 10);
    right(`- ${money(quote.subtotalCents - quote.totalCents)}`, 562);
    y -= 14;
  }
  text(L.total, 330, 12, true);
  right(money(quote.totalCents), 562, 12, true);
  y -= 26;
  if (quote.notes) {
    text(L.notes, 50, 10, true);
    y -= 14;
    for (const line of quote.notes.split('\n').slice(0, 20)) {
      text(line.slice(0, 110), 50, 9, false, rgb(0.3, 0.3, 0.3));
      y -= 12;
    }
  }
  return doc.save();
}
