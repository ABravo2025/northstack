import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    expenseMovement: { findFirst: vi.fn() },
    expenseReceipt: { upsert: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
  },
}));

import prisma from '../src/lib/prisma.js';
import { getReceipt, saveReceipt, sniffMime } from '../src/modules/expenses/receiptService.js';
import { sanitizeImportRow } from '../src/modules/expenses/expenseImportService.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
let previousKey: string | undefined;
beforeAll(() => {
  previousKey = process.env.EXPENSES_DATA_ENCRYPTION_KEY;
  process.env.EXPENSES_DATA_ENCRYPTION_KEY = '7'.repeat(64);
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.EXPENSES_DATA_ENCRYPTION_KEY;
  else process.env.EXPENSES_DATA_ENCRYPTION_KEY = previousKey;
});
beforeEach(() => {
  vi.clearAllMocks();
  db.expenseMovement.findFirst.mockResolvedValue({ id: 'm1' });
  db.expenseReceipt.upsert.mockImplementation(async ({ create }) => ({ id: 'r1', mimeType: create.mimeType, sizeBytes: create.sizeBytes, _create: create }));
});

const pdf = Buffer.from('%PDF-1.4 hello receipt');

describe('receipts', () => {
  it('recognises files by their bytes, not their claimed type', () => {
    expect(sniffMime(pdf)).toBe('application/pdf');
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMime(Buffer.from('<html>'))).toBeNull();
  });

  it('stores the file and its name encrypted, scoped to the tenant', async () => {
    await saveReceipt('t1', 'm1', { fileName: 'factura-edesur.pdf', mimeType: 'text/html', dataBase64: pdf.toString('base64') });
    expect(db.expenseMovement.findFirst).toHaveBeenCalledWith({ where: { id: 'm1', tenantId: 't1' }, select: { id: true } });
    const create = db.expenseReceipt.upsert.mock.calls[0][0].create;
    expect(create.mimeType).toBe('application/pdf');
    expect(create.nameEnc).not.toContain('edesur');
    expect(create.dataEnc).not.toContain(pdf.toString('base64'));
  });

  it('refuses other file types and files over 1 MB', async () => {
    await expect(saveReceipt('t1', 'm1', { fileName: 'x', mimeType: 'image/png', dataBase64: Buffer.from('<script>').toString('base64') })).rejects.toMatchObject({ code: 'bad_type' });
    const big = Buffer.concat([pdf, Buffer.alloc(1024 * 1024)]);
    await expect(saveReceipt('t1', 'm1', { fileName: 'x', mimeType: 'application/pdf', dataBase64: big.toString('base64') })).rejects.toMatchObject({ code: 'too_large' });
  });

  it('gives the file back decrypted', async () => {
    await saveReceipt('t1', 'm1', { fileName: 'f.pdf', mimeType: 'application/pdf', dataBase64: pdf.toString('base64') });
    const stored = db.expenseReceipt.upsert.mock.calls[0][0].create;
    db.expenseReceipt.findFirst.mockResolvedValue({ ...stored, id: 'r1' });
    const file = await getReceipt('t1', 'm1');
    expect(file.bytes.equals(pdf)).toBe(true);
    expect(file.fileName).toBe('f.pdf');
  });
});

describe('charges in another currency', () => {
  it('keeps the original amount and rate of an imported row', () => {
    const row = sanitizeImportRow({ date: '2026-10-05', description: 'AWS EMEA', amountCents: 9561000, direction: 'debit', originalCurrency: 'USD', originalAmountCents: 9130, exchangeRate: '1047.19' });
    expect(row).toMatchObject({ amountCents: 9561000, originalCurrency: 'USD', originalAmountCents: 9130, exchangeRate: '1047.19' });
    expect(sanitizeImportRow({ date: '2026-10-05', description: 'X', amountCents: 100, direction: 'debit', originalCurrency: 'usd', originalAmountCents: 1, exchangeRate: 'abc' })).not.toHaveProperty('originalCurrency');
  });
});
