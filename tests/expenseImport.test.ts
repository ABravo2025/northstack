import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    expenseAccount: { findFirst: vi.fn(), update: vi.fn() },
    expenseMovement: { findMany: vi.fn(), update: vi.fn(), createMany: vi.fn() },
    fixedExpense: { findMany: vi.fn() },
    expenseCategoryRule: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import prisma from '../src/lib/prisma.js';
import { decryptExpenseData, encryptAmountCents, encryptExpenseData, expenseAmountHash } from '../src/lib/expenseEncryption.js';
import { normalizeInstallment, isInternalTransfer } from '../src/modules/expenses/expenseLogic.js';
import { commitImport, planImport, sanitizeImportProfile } from '../src/modules/expenses/expenseImportService.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>> & ReturnType<typeof vi.fn>>;
let previousKey: string | undefined;

beforeAll(() => {
  previousKey = process.env.EXPENSES_DATA_ENCRYPTION_KEY;
  process.env.EXPENSES_DATA_ENCRYPTION_KEY = 'd'.repeat(64);
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.EXPENSES_DATA_ENCRYPTION_KEY;
  else process.env.EXPENSES_DATA_ENCRYPTION_KEY = previousKey;
});
beforeEach(() => {
  vi.clearAllMocks();
  db.expenseAccount.findFirst.mockResolvedValue({ id: 'acc1' });
  db.expenseMovement.findMany.mockResolvedValue([]);
  db.fixedExpense.findMany.mockResolvedValue([]);
  db.expenseCategoryRule.findMany.mockResolvedValue([]);
  (db.$transaction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

const row = (over: Record<string, unknown> = {}) => ({ date: '2026-10-07', description: 'YPF SERVICOMPRAS', amountCents: 3820000, direction: 'debit', ...over });
const saved = (over: Record<string, unknown> = {}) => {
  const cents = (over.cents as number) ?? 3820000;
  return {
    id: 'm1',
    date: new Date('2026-10-07T00:00:00Z'),
    descriptionEnc: encryptExpenseData('YPF SERVICOMPRAS'),
    amountEnc: encryptAmountCents(cents),
    amountHash: expenseAmountHash('acc1', cents),
    isEstimated: false,
    categoryId: null,
    ...over,
  };
};

describe('import helpers', () => {
  it('reads installments in their usual spellings', () => {
    expect(normalizeInstallment('3/12')).toBe('03/12');
    expect(normalizeInstallment('Cuota 3 de 12')).toBe('03/12');
    expect(normalizeInstallment('13/12')).toBeNull();
    expect(normalizeInstallment('')).toBeNull();
  });

  it('recognises a card payment as an internal transfer', () => {
    expect(isInternalTransfer('SU PAGO EN PESOS')).toBe(true);
    expect(isInternalTransfer('PAGO TARJETA VISA')).toBe(true);
    expect(isInternalTransfer('AWS EMEA')).toBe(false);
  });

  it('keeps only format metadata in the saved profile', () => {
    const p = sanitizeImportProfile({ convention: 'neg_credit', numberFormat: 'ar', dateFormat: 'dmy', columns: { date: 'Fecha', amount: 'Importe', secret: 'x' }, rows: [['a']] });
    expect(p).toEqual({ convention: 'neg_credit', numberFormat: 'ar', dateFormat: 'dmy', columns: { date: 'Fecha', amount: 'Importe' }, label: 'neg_credit' });
    expect(sanitizeImportProfile({ convention: 'bogus', numberFormat: 'ar', dateFormat: 'dmy' })).toBeNull();
  });
});

describe('planImport', () => {
  it('refuses an account of another tenant', async () => {
    db.expenseAccount.findFirst.mockResolvedValue(null);
    await expect(planImport('tenantA', 'acc-of-B', [row()])).rejects.toMatchObject({ status: 404 });
    expect(db.expenseAccount.findFirst).toHaveBeenCalledWith({ where: { id: 'acc-of-B', tenantId: 'tenantA' }, select: { id: true } });
  });

  it('flags a row already saved (same amount, within 3 days) as a duplicate unless forced', async () => {
    db.expenseMovement.findMany.mockResolvedValue([saved({ date: new Date('2026-10-05T00:00:00Z') })]);
    const [dup] = await planImport('t1', 'acc1', [row()]);
    expect(dup.status).toBe('duplicate');
    expect(dup.duplicateOf).toMatchObject({ id: 'm1', date: '2026-10-05' });
    const [forced] = await planImport('t1', 'acc1', [row({ forceImport: true })]);
    expect(forced.status).toBe('expense');
  });

  it('a saved movement matches one row only, so a second identical purchase is imported', async () => {
    db.expenseMovement.findMany.mockResolvedValue([saved()]);
    const plan = await planImport('t1', 'acc1', [row(), row()]);
    expect(plan.map((r) => r.status)).toEqual(['duplicate', 'expense']);
  });

  it('confirms an estimated automatic charge within 15% and 5 days instead of duplicating it', async () => {
    db.expenseMovement.findMany.mockResolvedValue([
      saved({ id: 'est', isEstimated: true, cents: 5000000, date: new Date('2026-10-02T00:00:00Z'), descriptionEnc: encryptExpenseData('Edesur'), categoryId: 'cat-util' }),
    ]);
    const [r] = await planImport('t1', 'acc1', [row({ description: 'DEBITO AUTOMATICO EDESUR', amountCents: 5630000, date: '2026-10-04' })]);
    expect(r.status).toBe('expense');
    expect(r.confirms).toEqual({ movementId: 'est', description: 'Edesur', estimatedCents: 5000000 });
    expect(r.categoryId).toBe('cat-util');
  });

  it('reconciles a manual fixed expense not yet paid that month (±2%)', async () => {
    db.fixedExpense.findMany.mockResolvedValue([
      { id: 'f-rent', nameEnc: encryptExpenseData('Alquiler'), amountEnc: encryptAmountCents(85000000), categoryId: 'cat-rent', movements: [] },
    ]);
    const [r] = await planImport('t1', 'acc1', [row({ description: 'TRANSF ENVIADA - ALQUILER OFICINA', amountCents: 85000000, date: '2026-10-05' })]);
    expect(r.reconciles).toEqual({ fixedExpenseId: 'f-rent', name: 'Alquiler', period: '2026-10' });
    expect(r.categoryId).toBe('cat-rent');
  });

  it('applies a learned category rule and marks card payments internal', async () => {
    db.expenseCategoryRule.findMany.mockResolvedValue([{ patternEnc: encryptExpenseData('YPF SERVICOMPRAS'), categoryId: 'cat-travel' }]);
    const plan = await planImport('t1', 'acc1', [row(), row({ description: 'SU PAGO EN PESOS', direction: 'credit', amountCents: 125000000 }), { date: 'nope' }]);
    expect(plan.map((r) => [r.status, r.categoryId])).toEqual([
      ['expense', 'cat-travel'],
      ['internal', null],
      ['invalid', null],
    ]);
  });
});

describe('commitImport', () => {
  it('stores new rows encrypted, confirms estimates in place and saves the account profile', async () => {
    db.expenseMovement.findMany.mockResolvedValue([saved({ id: 'est', isEstimated: true, cents: 1000000 })]);
    const result = await commitImport(
      't1',
      'u1',
      'acc1',
      [row({ amountCents: 1050000 }), row({ description: 'AWS EMEA', amountCents: 9130000, installment: '3/12' })],
      { convention: 'neg_credit', numberFormat: 'ar', dateFormat: 'dmy', columns: {}, label: 'neg_credit' },
    );
    expect(result).toMatchObject({ imported: 1, confirmed: 1, duplicatesSkipped: 0 });
    expect(db.expenseMovement.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'est' }, data: expect.objectContaining({ isEstimated: false }) }),
    );
    const created = db.expenseMovement.createMany.mock.calls[0][0].data[0];
    expect(created.descriptionEnc).not.toContain('AWS');
    expect(decryptExpenseData(created.descriptionEnc)).toBe('AWS EMEA');
    expect(created).toMatchObject({ source: 'csv_import', installment: '03/12', kind: 'expense' });
    expect(db.expenseAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc1' },
      data: expect.objectContaining({ importProfile: expect.objectContaining({ convention: 'neg_credit' }) }),
    });
  });
});
