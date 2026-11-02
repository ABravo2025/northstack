import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Formularios y encuestas (spec-clientes-gastos-formularios.md, Fase B). Responses carry personal
// data from people outside the company (leads, clients) and candid survey answers, so they're
// encrypted at rest. Same AES-256-GCM layout as encryption.ts / expenseEncryption.ts (iv + authTag
// + ciphertext, base64) with the module's own key, FORMS_DATA_ENCRYPTION_KEY. The key must never
// be hardcoded or committed.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const KEY_ENV = 'FORMS_DATA_ENCRYPTION_KEY';

function getKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(`${KEY_ENV} is not set — cannot encrypt or decrypt form responses.`);
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error(`${KEY_ENV} must decode to 32 bytes (a 64-character hex string) for AES-256.`);
  }
  return key;
}

// Form routes that store or read responses answer 503 instead of failing when the key is missing.
export function isFormsEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptFormData(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptFormData(payload: string): string {
  const key = getKey();
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LENGTH_BYTES);
  const authTag = raw.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const ciphertext = raw.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// A response's answers ({ questionId: value }) as one encrypted JSON blob.
export function encryptAnswers(answers: Record<string, unknown>): string {
  return encryptFormData(JSON.stringify(answers));
}

export function decryptAnswers(payload: string): Record<string, unknown> {
  const parsed = JSON.parse(decryptFormData(payload));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

// Personal links (FormInvite): a random token goes in the email, only its hash is stored, so a
// database read never yields a working link.
export function newInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInviteToken(token) };
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
