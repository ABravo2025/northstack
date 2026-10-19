import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM, same scheme as googleTokenEncryption.ts but with its own key (one key per sensitive-data
// purpose): MFA_ENCRYPTION_KEY, 64 hex chars. Used only for User.totpSecretEnc (spec-2fa.md).
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // NIST-recommended IV length for GCM
const AUTH_TAG_LENGTH_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'MFA_ENCRYPTION_KEY is not set — cannot encrypt or decrypt two-step verification secrets.'
    );
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error(
      'MFA_ENCRYPTION_KEY must decode to 32 bytes (a 64-character hex string) for AES-256.'
    );
  }
  return key;
}

// Packs iv + authTag + ciphertext into one base64 string, self-contained so
// decryptMfaSecret needs nothing but this string and the env key.
export function encryptMfaSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptMfaSecret(payload: string): string {
  const key = getKey();
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LENGTH_BYTES);
  const authTag = raw.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const ciphertext = raw.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function isMfaEncryptionConfigured(): boolean {
  return !!process.env.MFA_ENCRYPTION_KEY;
}
