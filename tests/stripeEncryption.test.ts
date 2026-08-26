import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { decryptStripeSecret, encryptStripeSecret } from '../src/lib/stripeEncryption.js';

describe('Stripe secret encryption', () => {
  beforeEach(() => {
    process.env.STRIPE_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  });

  it('round-trips plaintext through encrypt/decrypt', () => {
    const plaintext = 'rk_test_51ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const encrypted = encryptStripeSecret(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptStripeSecret(encrypted)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const plaintext = 'whsec_abc123';
    const first = encryptStripeSecret(plaintext);
    const second = encryptStripeSecret(plaintext);
    expect(first).not.toBe(second);
    expect(decryptStripeSecret(second)).toBe(plaintext);
  });

  it('throws if the encryption key is missing', () => {
    delete process.env.STRIPE_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptStripeSecret('secret')).toThrow(/STRIPE_TOKEN_ENCRYPTION_KEY/);
  });

  it('throws if the ciphertext was tampered with', () => {
    const encrypted = encryptStripeSecret('rk_test_someRestrictedKey');
    const tampered = encrypted.slice(0, -4) + (encrypted.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
    expect(() => decryptStripeSecret(tampered)).toThrow();
  });
});
