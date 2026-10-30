import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decryptAmountCents,
  decryptExpenseData,
  encryptAmountCents,
  encryptExpenseData,
  expenseAmountHash,
  isExpenseEncryptionConfigured,
} from '../src/lib/expenseEncryption.js';

const KEY = 'a'.repeat(64);

describe('expense data encryption', () => {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.EXPENSES_DATA_ENCRYPTION_KEY;
    process.env.EXPENSES_DATA_ENCRYPTION_KEY = KEY;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.EXPENSES_DATA_ENCRYPTION_KEY;
    else process.env.EXPENSES_DATA_ENCRYPTION_KEY = previous;
  });

  it('round-trips text and never stores it in clear', () => {
    const enc = encryptExpenseData('MERPAGO*DISTRIBUIDORA LOPEZ');
    expect(enc).not.toContain('LOPEZ');
    expect(decryptExpenseData(enc)).toBe('MERPAGO*DISTRIBUIDORA LOPEZ');
  });

  it('uses a fresh IV every time', () => {
    expect(encryptExpenseData('same')).not.toBe(encryptExpenseData('same'));
  });

  it('round-trips amounts in cents and rejects negatives and fractions', () => {
    expect(decryptAmountCents(encryptAmountCents(8450000))).toBe(8450000);
    expect(() => encryptAmountCents(-1)).toThrow();
    expect(() => encryptAmountCents(1.5)).toThrow();
  });

  it('hashes amounts per account, deterministically', () => {
    expect(expenseAmountHash('acc1', 5630000)).toBe(expenseAmountHash('acc1', 5630000));
    expect(expenseAmountHash('acc1', 5630000)).not.toBe(expenseAmountHash('acc2', 5630000));
    expect(expenseAmountHash('acc1', 5630000)).not.toBe(expenseAmountHash('acc1', 5630001));
  });

  it('fails clearly without a key, or with a wrong-size key', () => {
    delete process.env.EXPENSES_DATA_ENCRYPTION_KEY;
    expect(isExpenseEncryptionConfigured()).toBe(false);
    expect(() => encryptExpenseData('x')).toThrow(/EXPENSES_DATA_ENCRYPTION_KEY/);
    process.env.EXPENSES_DATA_ENCRYPTION_KEY = 'abcd';
    expect(isExpenseEncryptionConfigured()).toBe(false);
  });

  it('cannot be read with a different key', () => {
    const enc = encryptExpenseData('secret');
    process.env.EXPENSES_DATA_ENCRYPTION_KEY = 'b'.repeat(64);
    expect(() => decryptExpenseData(enc)).toThrow();
  });
});
