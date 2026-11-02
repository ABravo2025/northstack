import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    tenant: { findUnique: vi.fn() },
    fixedExpense: { findMany: vi.fn() },
    expenseMovement: { findMany: vi.fn() },
    companyProduct: { findMany: vi.fn() },
  },
}));

import prisma from '../src/lib/prisma.js';
import { encryptAmountCents, encryptExpenseData } from '../src/lib/expenseEncryption.js';
import { projectCashflow, weekBuckets } from '../src/modules/expenses/cashflowService.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
let previousKey: string | undefined;
beforeAll(() => {
  previousKey = process.env.EXPENSES_DATA_ENCRYPTION_KEY;
  process.env.EXPENSES_DATA_ENCRYPTION_KEY = '8'.repeat(64);
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.EXPENSES_DATA_ENCRYPTION_KEY;
  else process.env.EXPENSES_DATA_ENCRYPTION_KEY = previousKey;
});
beforeEach(() => {
  vi.clearAllMocks();
  db.tenant.findUnique.mockResolvedValue({ currency: 'ARS', plan: 'growth', planOverride: null });
  db.fixedExpense.findMany.mockResolvedValue([{ nameEnc: encryptExpenseData('Alquiler'), amountEnc: encryptAmountCents(85000000), dayOfMonth: 5 }]);
  db.expenseMovement.findMany.mockResolvedValue([
    { date: new Date('2026-10-09T00:00:00Z'), installment: '03/12', descriptionEnc: encryptExpenseData('NOTEBOOK'), amountEnc: encryptAmountCents(14583333), accountId: 'visa' },
  ]);
  db.companyProduct.findMany.mockResolvedValue([
    { startDate: new Date('2026-06-15T00:00:00Z'), quantity: 1, unitPriceCents: 50000000, company: { name: 'Acme' }, product: { name: 'Pro', billing: 'monthly', currency: 'ARS' } },
    { startDate: new Date('2026-06-15T00:00:00Z'), quantity: 1, unitPriceCents: 10000, company: { name: 'Globex' }, product: { name: 'Pro USD', billing: 'monthly', currency: 'USD' } },
  ]);
});

describe('90-day cash projection', () => {
  it('buckets by week and carries the running balance from the opening', () => {
    const weeks = weekBuckets('2026-11-02', [
      { date: '2026-11-03', label: 'in', cents: 1000, kind: 'revenue' },
      { date: '2026-11-04', label: 'out', cents: -3000, kind: 'fixed' },
      { date: '2026-11-10', label: 'in', cents: 5000, kind: 'revenue' },
    ], 1000);
    expect(weeks[0]).toMatchObject({ inCents: 1000, outCents: 3000, netCents: -2000, balanceCents: -1000 });
    expect(weeks[1]).toMatchObject({ netCents: 5000, balanceCents: 4000 });
    expect(weeks).toHaveLength(13);
  });

  it('fixed expenses each month, remaining installments, and client revenue in the company currency', async () => {
    const r = await projectCashflow('t1', '2026-11-02', 0);
    const all = r.weeks.flatMap((w) => w.items);
    expect(all.filter((i) => i.kind === 'fixed').map((i) => i.date)).toEqual(['2026-11-05', '2026-12-05', '2027-01-05']);
    expect(all.filter((i) => i.kind === 'installment').map((i) => i.label)).toEqual(['NOTEBOOK (04/12)', 'NOTEBOOK (05/12)', 'NOTEBOOK (06/12)']);
    expect(all.filter((i) => i.kind === 'revenue').map((i) => i.date)).toEqual(['2026-11-15', '2026-12-15', '2027-01-15']);
    expect(r.otherCurrencyLines).toBe(1);
    expect(r.negativeWeeks[0]).toBe('2026-11-02'); // rent on the 5th before any revenue
  });

  it('without the Clients module, only what goes out', async () => {
    db.tenant.findUnique.mockResolvedValue({ currency: 'ARS', plan: 'starter', planOverride: null });
    const r = await projectCashflow('t1', '2026-11-02', null);
    expect(r.totalInCents).toBe(0);
    expect(db.companyProduct.findMany).not.toHaveBeenCalled();
  });
});
