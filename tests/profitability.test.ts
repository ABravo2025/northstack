import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    companyProduct: { findMany: vi.fn() },
    project: { findMany: vi.fn() },
    timeEntry: { findMany: vi.fn() },
    employeeCompensation: { findMany: vi.fn() },
    expenseMovement: { findMany: vi.fn() },
    tenant: { findUnique: vi.fn() },
  },
}));

import prisma from '../src/lib/prisma.js';
import { encryptAmountCents } from '../src/lib/expenseEncryption.js';
import { getProfitability, hourlyCostCents } from '../src/modules/crm/profitabilityService.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const period = { from: d('2026-10-01'), to: new Date('2026-10-31T23:59:59Z') };
let previousKey: string | undefined;

beforeAll(() => {
  previousKey = process.env.EXPENSES_DATA_ENCRYPTION_KEY;
  process.env.EXPENSES_DATA_ENCRYPTION_KEY = '9'.repeat(64);
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.EXPENSES_DATA_ENCRYPTION_KEY;
  else process.env.EXPENSES_DATA_ENCRYPTION_KEY = previousKey;
});
beforeEach(() => {
  vi.clearAllMocks();
  db.companyProduct.findMany.mockResolvedValue([
    { companyId: 'co1', startDate: d('2026-01-01'), cancelledAt: null, quantity: 1, unitPriceCents: 100000, product: { billing: 'monthly', currency: 'USD' } },
  ]);
  db.project.findMany.mockResolvedValue([{ id: 'p1', companyId: 'co1' }]);
  db.timeEntry.findMany.mockResolvedValue([
    { employeeId: 'e1', date: d('2026-10-10'), minutes: 600, companyId: null, projectId: 'p1' },
    { employeeId: 'e2', date: d('2026-10-11'), minutes: 120, companyId: 'co1', projectId: null },
  ]);
  db.employeeCompensation.findMany.mockResolvedValue([
    { employeeId: 'e1', compensationType: 'hourly', rateCents: 2000, currency: 'USD', effectiveFrom: d('2026-01-01'), effectiveTo: null, payFrequency: { cadence: 'monthly' } },
    { employeeId: 'e2', compensationType: 'fixed', rateCents: 320000, currency: 'USD', effectiveFrom: d('2026-01-01'), effectiveTo: null, payFrequency: { cadence: 'monthly' } },
  ]);
  db.expenseMovement.findMany.mockResolvedValue([
    { companyId: 'co1', amountEnc: encryptAmountCents(15000), direction: 'debit' },
    { companyId: 'co1', amountEnc: encryptAmountCents(5000), direction: 'credit' },
  ]);
  db.tenant.findUnique.mockResolvedValue({ currency: 'USD' });
});

describe('profitability per client', () => {
  it('turns a fixed monthly salary into an hourly cost', () => {
    expect(hourlyCostCents({ compensationType: 'fixed', rateCents: 320000, cadence: 'monthly' })).toBe(2000);
    expect(hourlyCostCents({ compensationType: 'hourly', rateCents: 2500, cadence: null })).toBe(2500);
  });

  it('revenue (from products) − labor on the client and its projects − assigned expenses', async () => {
    const r = (await getProfitability('t1', ['co1'], period, { canSeeLabor: true, canSeeExpenses: true })).get('co1')!;
    expect(r.revenueSource).toBe('products');
    expect(r.revenue[0].cents).toBeGreaterThan(99000);
    expect(r.labor).toEqual([{ currency: 'USD', cents: 24000 }]); // 10 h × 20 + 2 h × 20
    expect(r.laborMinutes).toBe(720);
    expect(r.expenses).toEqual([{ currency: 'USD', cents: 10000 }]); // 150 − 50 refund
    expect(r.profit[0].cents).toBe(r.revenue[0].cents - 24000 - 10000);
  });

  it('leaves out what the person may not see', async () => {
    const r = (await getProfitability('t1', ['co1'], period, { canSeeLabor: false, canSeeExpenses: false })).get('co1')!;
    expect(r.labor).toBeNull();
    expect(r.expenses).toBeNull();
    expect(db.employeeCompensation.findMany).not.toHaveBeenCalled();
    expect(db.expenseMovement.findMany).not.toHaveBeenCalled();
  });

  it('prefers Stripe revenue when given', async () => {
    const r = (await getProfitability('t1', ['co1'], period, { canSeeLabor: false, canSeeExpenses: false, stripeRevenue: new Map([['co1', [{ currency: 'USD', cents: 50000 }]]]) })).get('co1')!;
    expect(r).toMatchObject({ revenueSource: 'stripe', revenue: [{ currency: 'USD', cents: 50000 }], profit: [{ currency: 'USD', cents: 50000 }] });
  });
});
