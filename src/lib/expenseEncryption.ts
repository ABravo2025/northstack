import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

// Gastos / Expenses (spec-clientes-gastos-formularios.md, Fase A). Same AES-256-GCM layout as
// encryption.ts (iv + authTag + ciphertext, base64) but its own key, EXPENSES_DATA_ENCRYPTION_KEY,
// so a leak or rotation of one module's key never touches the other. The key must never be
// hardcoded or committed.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const KEY_ENV = 'EXPENSES_DATA_ENCRYPTION_KEY';

function getKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(`${KEY_ENV} is not set — cannot encrypt or decrypt expense data.`);
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error(`${KEY_ENV} must decode to 32 bytes (a 64-character hex string) for AES-256.`);
  }
  return key;
}

// The Expenses routes answer 503 instead of failing every request when the key is missing.
export function isExpenseEncryptionConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptExpenseData(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptExpenseData(payload: string): string {
  const key = getKey();
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LENGTH_BYTES);
  const authTag = raw.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const ciphertext = raw.subarray(IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// Amounts are stored as integer cents in a string, encrypted.
export function encryptAmountCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error('Expense amounts are stored as non-negative integer cents.');
  }
  return encryptExpenseData(String(cents));
}

export function decryptAmountCents(payload: string): number {
  const cents = Number(decryptExpenseData(payload));
  if (!Number.isSafeInteger(cents)) {
    throw new Error('Corrupt expense amount.');
  }
  return cents;
}

// ExpenseMovement.amountHash: equality lookups (duplicates, confirming an estimated charge)
// without the amount in clear. Keyed with a key derived from the module key, so the hash can't be
// brute-forced over the small space of plausible amounts by anyone without it. Scoped by account:
// the same amount on two accounts hashes differently.
export function expenseAmountHash(accountId: string, cents: number): string {
  const hmacKey = createHmac('sha256', getKey()).update('expense-amount-hash/v1').digest();
  return createHmac('sha256', hmacKey).update(`${accountId}:${cents}`).digest('hex');
}
