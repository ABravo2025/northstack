import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: { expenseMovement: { findMany: vi.fn() } },
}));

import prisma from '../src/lib/prisma.js';
import { encryptAmountCents, encryptExpenseData } from '../src/lib/expenseEncryption.js';
import { getExpensesDashboard, monthsBetween } from '../src/modules/expenses/expenseDashboardService.js';

const findMany = (prisma as unknown as { expenseMovement: { findMany: ReturnType<typeof vi.fn> } }).expenseMovement.findMany;
let previousKey: string | undefined;

beforeAll(() => {
  previousKey = process.env.EXPENSES_DATA_ENCRYPTION_KEY;
  process.env.EXPENSES_DATA_ENCRYPTION_KEY = 'e'.repeat(64);
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.EXPENSES_DATA_ENCRYPTION_KEY;
  else process.env.EXPENSES_DATA_ENCRYPTION_KEY = previousKey;
});
beforeEach(() => vi.clearAllMocks());

const mv = (desc: string, cents: number, over: Record<string, unknown> = {}) => ({
  date: new Date('2026-10-05T00:00:00Z'),
  descriptionEnc: encryptExpenseData(desc),
  amountEnc: encryptAmountCents(cents),
  direction: 'debit',
  kind: 'expense',
  categoryId: null,
  departmentId: null,
  fixedExpenseId: null,
  isEstimated: false,
  ...over,
});

describe('expenses dashboard', () => {
  it('lists every month in the range, capped to the last 24', () => {
    expect(monthsBetween('2026-09-15', '2026-11-02')).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(monthsBetween('2020-01-01', '2026-11-02')).toHaveLength(24);
  });

  it('never counts internal transfers and filters by tenant and department', async () => {
    findMany.mockResolvedValue([]);
    await getExpensesDashboard('t1', { from: '2026-10-01', to: '2026-10-31', departmentId: 'none' });
    expect(findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', kind: { not: 'internal' }, departmentId: null });
  });

  it('adds up fixed vs variable, nets refunds, keeps credits apart and groups merchants', async () => {
    findMany.mockResolvedValue([
      mv('UBER *TRIP 4821', 1000, { categoryId: 'travel', departmentId: 'sales' }),
      mv('UBER *TRIP 9930', 3000, { categoryId: 'travel', departmentId: 'sales' }),
      mv('UBER *TRIP 9930', 500, { direction: 'credit', categoryId: 'travel', departmentId: 'sales' }),
      mv('Alquiler', 50000, { fixedExpenseId: 'f1', categoryId: 'rent', date: new Date('2026-09-10T00:00:00Z') }),
      mv('TRANSF RECIBIDA', 99999, { direction: 'credit', kind: 'credit' }),
    ]);
    const d = await getExpensesDashboard('t1', { from: '2026-09-01', to: '2026-10-31' });
    expect(d).toMatchObject({ totalCents: 53500, fixedCents: 50000, variableCents: 3500, creditsCents: 99999, expenseCount: 3 });
    expect(d.byCategory).toEqual([
      { categoryId: 'rent', cents: 50000 },
      { categoryId: 'travel', cents: 3500 },
    ]);
    expect(d.topMerchants[1]).toEqual({ name: 'UBER TRIP', cents: 4000, count: 2 });
    expect(d.byMonth).toEqual([
      { month: '2026-09', fixedCents: 50000, variableCents: 0 },
      { month: '2026-10', fixedCents: 0, variableCents: 3500 },
    ]);
  });
});
