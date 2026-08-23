import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM via Node's native crypto module — mirrors lib/encryption.ts
// exactly, but scoped to its own GOOGLE_TOKEN_ENCRYPTION_KEY rather than
// reusing PAYMENT_DATA_ENCRYPTION_KEY (that file's key is documented as
// "never for anything else" — one key per sensitive-data purpose). Used only
// for GoogleCalendarConnection's access/refresh tokens.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // NIST-recommended IV length for GCM
const AUTH_TAG_LENGTH_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'GOOGLE_TOKEN_ENCRYPTION_KEY is not set — cannot encrypt or decrypt Google OAuth tokens.'
    );
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error(
      'GOOGLE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (a 64-character hex string) for AES-256.'
    );
  }
  return key;
}

// Packs iv + authTag + ciphertext into one base64 string, self-contained so
// decryptGoogleToken needs nothing but this string and the env key.
export function encryptGoogleToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptGoogleToken(payload: string): string {
  const key = getKey();
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LENGTH_BYTES);
  const authTag = raw.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const ciphertext = raw.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function isGoogleTokenEncryptionConfigured(): boolean {
  return !!process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
}
