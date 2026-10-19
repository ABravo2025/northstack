import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Two-step verification (spec-2fa.md): time-based one-time codes, RFC 6238 (TOTP over RFC 4226
// HOTP), the scheme Google Authenticator, Microsoft Authenticator, Authy, 1Password etc. all use:
// HMAC-SHA1, 6 digits, 30-second steps. Pure functions, no database — tested with the RFC vectors.

export const STEP_SECONDS = 30;
const DIGITS = 6;
// ±1 step: tolerates a phone clock up to ~30 s off, and a code typed as it rolls over.
const WINDOW = 1;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// 20 random bytes = 160 bits, the size RFC 4226 recommends for HMAC-SHA1.
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function stepAt(now: Date): number {
  return Math.floor(now.getTime() / 1000 / STEP_SECONDS);
}

export function hotp(secret: Buffer, counter: number, digits = DIGITS, algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha1'): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm, secret).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totpCode(secretBase32: string, now: Date): string {
  return hotp(base32Decode(secretBase32), stepAt(now));
}

function sameCode(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// The step the code matched (to store as "last used", so the same code can't be replayed), or
// null. Steps at or before lastStep are never accepted.
export function verifyTotp(secretBase32: string, code: string, now: Date, lastStep: number | null): number | null {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return null;
  const secret = base32Decode(secretBase32);
  const current = stepAt(now);
  for (let delta = -WINDOW; delta <= WINDOW; delta++) {
    const step = current + delta;
    if (lastStep !== null && step <= lastStep) continue;
    if (sameCode(hotp(secret, step), clean)) return step;
  }
  return null;
}

// What the QR encodes; authenticator apps show "Northstack (person@company.com)".
export function otpauthUrl(secretBase32: string, account: string, issuer = 'Northstack'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// Recovery codes: 10 of "xxxx-xxxx" (lowercase letters and digits without look-alikes).
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(8);
    const chars = [...bytes].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
