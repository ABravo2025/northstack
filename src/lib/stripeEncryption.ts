import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM via Node's native crypto module — mirrors lib/encryption.ts and
// lib/googleTokenEncryption.ts exactly, but scoped to its own
// STRIPE_TOKEN_ENCRYPTION_KEY (one key per sensitive-data purpose, same rule those two files
// document). Used for StripeConnection's apiKeyEncrypted/webhookSigningSecretEncrypted — both are
// tenant-pasted Stripe secrets (Payments v1, spec-payments-v1.md), so one pair of functions covers
// both fields rather than one function per field.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // NIST-recommended IV length for GCM
const AUTH_TAG_LENGTH_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.STRIPE_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'STRIPE_TOKEN_ENCRYPTION_KEY is not set — cannot encrypt or decrypt Stripe secrets.'
    );
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error(
      'STRIPE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (a 64-character hex string) for AES-256.'
    );
  }
  return key;
}

// Packs iv + authTag + ciphertext into one base64 string, self-contained so
// decryptStripeSecret needs nothing but this string and the env key.
export function encryptStripeSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptStripeSecret(payload: string): string {
  const key = getKey();
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LENGTH_BYTES);
  const authTag = raw.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const ciphertext = raw.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function isStripeEncryptionConfigured(): boolean {
  return !!process.env.STRIPE_TOKEN_ENCRYPTION_KEY;
}
