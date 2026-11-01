import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    expenseAccount: { findFirst: vi.fn(), update: vi.fn() },
    expenseCategory: { findFirst: vi.fn() },
    fieldCatalogDefinition: { findFirst: vi.fn() },
    expenseMovement: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), createMany: vi.fn() },
    expenseCategoryRule: { create: vi.fn() },
    fixedExpense: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

import prisma from '../src/lib/prisma.js';
import { encryptAmountCents, encryptExpenseData } from '../src/lib/expenseEncryption.js';
import {
  ExpenseError,
  bookDueFixedExpenses,
  createManualMovement,
  deleteMovement,
  markFixedPaid,
  updateAccount,
  updateMovement,
} from '../src/modules/expenses/expenseService.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
let previousKey: string | undefined;

beforeAll(() => {
  previousKey = process.env.EXPENSES_DATA_ENCRYPTION_KEY;
  process.env.EXPENSES_DATA_ENCRYPTION_KEY = 'c'.repeat(64);
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.EXPENSES_DATA_ENCRYPTION_KEY;
  else process.env.EXPENSES_DATA_ENCRYPTION_KEY = previousKey;
});
beforeEach(() => vi.clearAllMocks());

const movementRow = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  accountId: 'acc1',
  date: new Date('2026-10-05T00:00:00Z'),
  descriptionEnc: encryptExpenseData('MERPAGO*UBER TRIP 4821'),
  amountEnc: encryptAmountCents(450000),
  direction: 'debit',
  kind: 'expense',
  categoryId: null,
  departmentId: null,
  source: 'csv_import',
  isEstimated: false,
  fixedExpenseId: null,
  fixedPeriod: null,
  installment: null,
  noteEnc: null,
  ...over,
});

describe('tenant isolation', () => {
  it('looks every record up scoped by tenant, so another tenant’s id is not found', async () => {
    db.expenseAccount.findFirst.mockResolvedValue(null);
    await expect(updateAccount('tenantA', 'acc-of-B', { name: 'x' })).rejects.toMatchObject({ status: 404 });
    expect(db.expenseAccount.findFirst).toHaveBeenCalledWith({ where: { id: 'acc-of-B', tenantId: 'tenantA' } });
    expect(db.expenseAccount.update).not.toHaveBeenCalled();
  });

  it('refuses a manual movement on an account, category or department of another tenant', async () => {
    db.expenseAccount.findFirst.mockResolvedValue({ id: 'acc1' });
    db.expenseCategory.findFirst.mockResolvedValue(null);
    await expect(
      createManualMovement('tenantA', 'u1', { accountId: 'acc1', date: '2026-10-05', description: 'x', amountCents: 100, direction: 'debit', categoryId: 'cat-of-B' }),
    ).rejects.toBeInstanceOf(ExpenseError);
    expect(db.expenseCategory.findFirst).toHaveBeenCalledWith({ where: { id: 'cat-of-B', tenantId: 'tenantA' }, select: { id: true } });
    expect(db.expenseMovement.create).not.toHaveBeenCalled();
  });
});

describe('manual movements', () => {
  it('stores description and amount encrypted, never in clear', async () => {
    db.expenseAccount.findFirst.mockResolvedValue({ id: 'acc1' });
    db.expenseMovement.create.mockImplementation(async ({ data }) => movementRow({ ...data, id: 'new' }));
    const m = await createManualMovement('tenantA', 'u1', {
      accountId: 'acc1',
      date: '2026-10-05',
      description: 'Librería Ávila',
      amountCents: 1250050,
      direction: 'debit',
    });
    const data = db.expenseMovement.create.mock.calls[0][0].data;
    expect(JSON.stringify(data)).not.toContain('Ávila');
    expect(JSON.stringify(data)).not.toContain('1250050');
    expect(data.kind).toBe('expense');
    expect(m.description).toBe('Librería Ávila');
    expect(m.amountCents).toBe(1250050);
  });
});

describe('category corrections', () => {
  it('learn an encrypted rule and recategorise matching uncategorised expenses', async () => {
    db.expenseMovement.findFirst.mockResolvedValue(movementRow());
    db.expenseCategory.findFirst.mockResolvedValue({ id: 'travel' });
    db.expenseMovement.update.mockResolvedValue(movementRow({ categoryId: 'travel' }));
    db.expenseMovement.findMany.mockResolvedValue([
      { id: 'm2', descriptionEnc: encryptExpenseData('MERPAGO*UBER TRIP 1111') },
      { id: 'm3', descriptionEnc: encryptExpenseData('SPOTIFY') },
    ]);
    db.expenseMovement.updateMany.mockResolvedValue({ count: 1 });

    const result = await updateMovement('tenantA', 'u1', 'm1', { categoryId: 'travel' });

    const rule = db.expenseCategoryRule.create.mock.calls[0][0].data;
    expect(rule.patternEnc).not.toContain('UBER');
    expect(db.expenseMovement.updateMany).toHaveBeenCalledWith({ where: { tenantId: 'tenantA', id: { in: ['m2'] } }, data: { categoryId: 'travel' } });
    expect(result.appliedToOthers).toBe(1);
  });
});

describe('fixed expenses', () => {
  it('an automatic charge can’t be deleted from the movement list', async () => {
    db.expenseMovement.findFirst.mockResolvedValue({ source: 'fixed_auto' });
    await expect(deleteMovement('tenantA', 'm1')).rejects.toMatchObject({ status: 409 });
    expect(db.expenseMovement.delete).not.toHaveBeenCalled();
  });

  it('only manual-payment fixed expenses are marked paid by hand', async () => {
    db.fixedExpense.findFirst.mockResolvedValue({ id: 'f1', paymentMethod: 'auto_debit', accountId: 'acc1', amountEnc: encryptAmountCents(100) });
    await expect(markFixedPaid('tenantA', 'u1', 'f1', { period: '2026-10' })).rejects.toMatchObject({ status: 409 });
  });

  it('books due automatic charges once, as estimated, and skips days not reached yet', async () => {
    db.fixedExpense.findMany.mockResolvedValue([
      { id: 'f1', tenantId: 't', nameEnc: encryptExpenseData('Hosting'), amountEnc: encryptAmountCents(2500000), dayOfMonth: 5, paymentMethod: 'card', accountId: 'acc1', categoryId: null, departmentId: null, isActive: true },
      { id: 'f2', tenantId: 't', nameEnc: encryptExpenseData('Luz'), amountEnc: encryptAmountCents(900000), dayOfMonth: 25, paymentMethod: 'auto_debit', accountId: 'acc2', categoryId: null, departmentId: null, isActive: true },
    ]);
    db.expenseMovement.createMany.mockResolvedValue({ count: 1 });

    await bookDueFixedExpenses('2026-10-10');

    const call = db.expenseMovement.createMany.mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data).toHaveLength(1);
    expect(call.data[0]).toMatchObject({ fixedExpenseId: 'f1', fixedPeriod: '2026-10', isEstimated: true, source: 'fixed_auto' });
    expect(call.data[0].date.toISOString().slice(0, 10)).toBe('2026-10-05');
  });
});
