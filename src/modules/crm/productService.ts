import type { ProductBilling } from '@prisma/client';
import prisma from '../../lib/prisma.js';

// Clientes C4 (spec-clientes-gastos-formularios.md): the product catalog and the products each
// client company has. Prices are integer cents in the product's currency. Every lookup is scoped
// by tenant first.

export class ProductError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string,
  ) {
    super(message);
  }
}

export const BILLINGS: ProductBilling[] = ['one_time', 'monthly', 'yearly'];

// Monthly recurring revenue of one line: yearly ÷ 12, one-time counts nothing.
export function monthlyCents(line: { billing: ProductBilling; unitPriceCents: number; quantity: number }): number {
  const total = line.unitPriceCents * line.quantity;
  if (line.billing === 'monthly') return total;
  if (line.billing === 'yearly') return Math.round(total / 12);
  return 0;
}

export interface ProductInput {
  name?: string;
  sku?: string | null;
  description?: string | null;
  unitPriceCents?: number;
  currency?: string;
  billing?: ProductBilling;
  isActive?: boolean;
}

function clean(input: ProductInput, creating: boolean) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined || creating) {
    const name = (input.name ?? '').trim().slice(0, 200);
    if (!name) throw new ProductError('Name is required', 400, 'name_required');
    data.name = name;
  }
  if (input.unitPriceCents !== undefined || creating) {
    const p = input.unitPriceCents;
    if (typeof p !== 'number' || !Number.isSafeInteger(p) || p < 0) throw new ProductError('Enter a price of zero or more', 400, 'invalid_price');
    data.unitPriceCents = p;
  }
  if (input.currency !== undefined) {
    if (!/^[A-Z]{3}$/.test(input.currency)) throw new ProductError('Invalid currency', 400);
    data.currency = input.currency;
  }
  if (input.billing !== undefined) {
    if (!BILLINGS.includes(input.billing)) throw new ProductError('Invalid billing', 400);
    data.billing = input.billing;
  }
  if (input.sku !== undefined) data.sku = input.sku?.trim().slice(0, 60) || null;
  if (input.description !== undefined) data.description = input.description?.trim().slice(0, 2000) || null;
  if (input.isActive !== undefined) data.isActive = !!input.isActive;
  return data;
}

export async function listProducts(tenantId: string) {
  const rows = await prisma.product.findMany({
    where: { tenantId },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { accounts: { where: { cancelledAt: null } } } } },
  });
  return rows.map(({ _count, ...p }) => ({ ...p, activeAccounts: _count.accounts }));
}

export async function createProduct(tenantId: string, input: ProductInput) {
  const data = clean(input, true);
  const currency = (data.currency as string | undefined) ?? (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } }))?.currency ?? 'USD';
  return prisma.product.create({ data: { ...(data as { name: string; unitPriceCents: number }), currency, tenantId } });
}

export async function updateProduct(tenantId: string, id: string, input: ProductInput) {
  const existing = await prisma.product.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!existing) throw new ProductError('Product not found', 404);
  return prisma.product.update({ where: { id }, data: clean(input, false) });
}

// --- Products of a company ---------------------------------------------------------------------

const lineInclude = { product: { select: { id: true, name: true, billing: true, currency: true, unitPriceCents: true } } };

async function ownedCompany(tenantId: string, companyId: string) {
  const company = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { id: true } });
  if (!company) throw new ProductError('Company not found', 404);
}

const asDate = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);

// What a company has, plus the catalog products it doesn't have (white space for upsell) and its
// monthly recurring revenue by currency.
export async function getCompanyProducts(tenantId: string, companyId: string) {
  await ownedCompany(tenantId, companyId);
  const [lines, catalog] = await Promise.all([
    prisma.companyProduct.findMany({ where: { tenantId, companyId }, include: lineInclude, orderBy: [{ cancelledAt: { sort: 'asc', nulls: 'first' } }, { startDate: 'desc' }] }),
    prisma.product.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } }),
  ]);
  const active = lines.filter((l) => !l.cancelledAt);
  const owned = new Set(active.map((l) => l.productId));
  const mrr = new Map<string, number>();
  for (const l of active) {
    mrr.set(l.product.currency, (mrr.get(l.product.currency) ?? 0) + monthlyCents({ billing: l.product.billing, unitPriceCents: l.unitPriceCents, quantity: l.quantity }));
  }
  return {
    lines,
    whiteSpace: catalog.filter((p) => !owned.has(p.id)),
    mrr: [...mrr.entries()].map(([currency, cents]) => ({ currency, cents })),
  };
}

export async function addCompanyProduct(
  tenantId: string,
  companyId: string,
  input: { productId: string; quantity?: number; unitPriceCents?: number; startDate?: string; renewalDate?: string | null; notes?: string | null },
) {
  await ownedCompany(tenantId, companyId);
  const product = await prisma.product.findFirst({ where: { id: input.productId, tenantId } });
  if (!product) throw new ProductError('Product not found', 404);
  const quantity = Number.isSafeInteger(input.quantity) && input.quantity! > 0 ? input.quantity! : 1;
  const price = input.unitPriceCents ?? product.unitPriceCents;
  if (!Number.isSafeInteger(price) || price < 0) throw new ProductError('Enter a price of zero or more', 400, 'invalid_price');
  return prisma.companyProduct.create({
    data: {
      tenantId,
      companyId,
      productId: product.id,
      quantity,
      unitPriceCents: price,
      startDate: asDate(input.startDate) ?? new Date(new Date().toISOString().slice(0, 10)),
      renewalDate: asDate(input.renewalDate),
      notes: input.notes?.trim().slice(0, 1000) || null,
    },
    include: lineInclude,
  });
}

export async function updateCompanyProduct(
  tenantId: string,
  companyId: string,
  lineId: string,
  input: { quantity?: number; unitPriceCents?: number; renewalDate?: string | null; notes?: string | null; cancelled?: boolean },
) {
  const line = await prisma.companyProduct.findFirst({ where: { id: lineId, tenantId, companyId } });
  if (!line) throw new ProductError('Product not found on this company', 404);
  const data: Record<string, unknown> = {};
  if (input.quantity !== undefined) {
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) throw new ProductError('Quantity must be 1 or more', 400);
    data.quantity = input.quantity;
  }
  if (input.unitPriceCents !== undefined) {
    if (!Number.isSafeInteger(input.unitPriceCents) || input.unitPriceCents < 0) throw new ProductError('Enter a price of zero or more', 400, 'invalid_price');
    data.unitPriceCents = input.unitPriceCents;
  }
  if (input.renewalDate !== undefined) data.renewalDate = asDate(input.renewalDate);
  if (input.notes !== undefined) data.notes = input.notes?.trim().slice(0, 1000) || null;
  if (input.cancelled !== undefined) data.cancelledAt = input.cancelled ? new Date() : null;
  return prisma.companyProduct.update({ where: { id: lineId }, data, include: lineInclude });
}
