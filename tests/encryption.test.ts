import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { decryptPaymentAccountData, encryptPaymentAccountData } from '../src/lib/encryption.js';

describe('payment account data encryption', () => {
  beforeEach(() => {
    process.env.PAYMENT_DATA_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  });

  it('round-trips plaintext through encrypt/decrypt', () => {
    const plaintext = 'DE89370400440532013000';
    const encrypted = encryptPaymentAccountData(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptPaymentAccountData(encrypted)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const plaintext = 'routing:123456789 account:987654321';
    const first = encryptPaymentAccountData(plaintext);
    const second = encryptPaymentAccountData(plaintext);
    expect(first).not.toBe(second);
    expect(decryptPaymentAccountData(second)).toBe(plaintext);
  });

  it('throws if the encryption key is missing', () => {
    delete process.env.PAYMENT_DATA_ENCRYPTION_KEY;
    expect(() => encryptPaymentAccountData('secret')).toThrow(/PAYMENT_DATA_ENCRYPTION_KEY/);
  });

  it('throws if the ciphertext was tampered with', () => {
    const encrypted = encryptPaymentAccountData('some-account-username');
    const tampered = encrypted.slice(0, -4) + (encrypted.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
    expect(() => decryptPaymentAccountData(tampered)).toThrow();
  });
});
