import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { decryptWebhookSecret, encryptWebhookSecret } from '../src/lib/webhookEncryption.js';

describe('Webhook secret encryption', () => {
  beforeEach(() => {
    process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = randomBytes(32).toString('hex');
  });

  it('round-trips plaintext through encrypt/decrypt', () => {
    const plaintext = 'whsec_abc123def456';
    const encrypted = encryptWebhookSecret(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptWebhookSecret(encrypted)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const plaintext = 'whsec_same_secret';
    const first = encryptWebhookSecret(plaintext);
    const second = encryptWebhookSecret(plaintext);
    expect(first).not.toBe(second);
    expect(decryptWebhookSecret(second)).toBe(plaintext);
  });

  it('throws if the encryption key is missing', () => {
    delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    expect(() => encryptWebhookSecret('secret')).toThrow(/WEBHOOK_SECRET_ENCRYPTION_KEY/);
  });

  it('throws if the ciphertext was tampered with', () => {
    const encrypted = encryptWebhookSecret('whsec_someSecret');
    const tampered = encrypted.slice(0, -4) + (encrypted.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA');
    expect(() => decryptWebhookSecret(tampered)).toThrow();
  });
});
