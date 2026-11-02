import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    product: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    companyProduct: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    company: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
  },
}));

import prisma from '../src/lib/prisma.js';
import { addCompanyProduct, createProduct, getCompanyProducts, monthlyCents } from '../src/modules/crm/productService.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
beforeEach(() => vi.clearAllMocks());

describe('product catalog', () => {
  it('normalizes recurring revenue to a month', () => {
    expect(monthlyCents({ billing: 'monthly', unitPriceCents: 1000, quantity: 3 })).toBe(3000);
    expect(monthlyCents({ billing: 'yearly', unitPriceCents: 12000, quantity: 1 })).toBe(1000);
    expect(monthlyCents({ billing: 'one_time', unitPriceCents: 99900, quantity: 1 })).toBe(0);
  });

  it('creates a product in the company currency unless one is given', async () => {
    db.tenant.findUnique.mockResolvedValue({ currency: 'ARS' });
    db.product.create.mockImplementation(async ({ data }) => data);
    expect(await createProduct('t1', { name: ' Plan Pro ', unitPriceCents: 500000 })).toMatchObject({ tenantId: 't1', name: 'Plan Pro', currency: 'ARS' });
    await expect(createProduct('t1', { name: 'X', unitPriceCents: -1 })).rejects.toMatchObject({ code: 'invalid_price' });
  });

  it('shows what a company has, the white space and its MRR by currency', async () => {
    db.company.findFirst.mockResolvedValue({ id: 'co1' });
    db.companyProduct.findMany.mockResolvedValue([
      { productId: 'p1', quantity: 2, unitPriceCents: 1000, cancelledAt: null, product: { billing: 'monthly', currency: 'USD' } },
      { productId: 'p2', quantity: 1, unitPriceCents: 24000, cancelledAt: null, product: { billing: 'yearly', currency: 'USD' } },
      { productId: 'p3', quantity: 1, unitPriceCents: 5000, cancelledAt: new Date(), product: { billing: 'monthly', currency: 'USD' } },
    ]);
    db.product.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }]);
    const r = await getCompanyProducts('t1', 'co1');
    expect(r.mrr).toEqual([{ currency: 'USD', cents: 4000 }]);
    expect(r.whiteSpace.map((p) => p.id)).toEqual(['p3', 'p4']);
  });

  it('never adds a product or company of another tenant', async () => {
    db.company.findFirst.mockResolvedValueOnce(null);
    await expect(addCompanyProduct('t1', 'co-of-B', { productId: 'p1' })).rejects.toMatchObject({ status: 404 });
    db.company.findFirst.mockResolvedValue({ id: 'co1' });
    db.product.findFirst.mockResolvedValueOnce(null);
    await expect(addCompanyProduct('t1', 'co1', { productId: 'p-of-B' })).rejects.toMatchObject({ status: 404 });
    expect(db.product.findFirst).toHaveBeenLastCalledWith({ where: { id: 'p-of-B', tenantId: 't1' } });
    expect(db.companyProduct.create).not.toHaveBeenCalled();
  });
});
