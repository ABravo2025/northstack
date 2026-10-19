import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, generateRecoveryCodes, generateSecret, hotp, normalizeRecoveryCode, otpauthUrl, totpCode, verifyTotp } from '../src/modules/auth/totp.js';

// RFC 6238 Appendix B: the SHA-1 key is the ASCII "12345678901234567890"; 8-digit codes.
const RFC_KEY = Buffer.from('12345678901234567890');
const RFC_VECTORS: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

describe('TOTP (two-step verification)', () => {
  it('matches the RFC 6238 test vectors', () => {
    for (const [seconds, code] of RFC_VECTORS) expect(hotp(RFC_KEY, Math.floor(seconds / 30), 8)).toBe(code);
  });

  it('matches the RFC 4226 HOTP vectors (6 digits)', () => {
    expect(hotp(RFC_KEY, 0)).toBe('755224');
    expect(hotp(RFC_KEY, 9)).toBe('520489');
  });

  it('base32 round-trips', () => {
    expect(base32Encode(RFC_KEY)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').equals(RFC_KEY)).toBe(true);
    expect(base32Decode('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq').equals(RFC_KEY)).toBe(true);
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
  });

  it('accepts the current code and one step either side, nothing further', () => {
    const secret = generateSecret();
    const now = new Date('2026-10-19T12:00:10Z');
    const code = totpCode(secret, now);
    expect(verifyTotp(secret, code, now, null)).not.toBeNull();
    expect(verifyTotp(secret, code, new Date(now.getTime() + 30_000), null)).not.toBeNull();
    expect(verifyTotp(secret, code, new Date(now.getTime() - 30_000), null)).not.toBeNull();
    expect(verifyTotp(secret, code, new Date(now.getTime() + 90_000), null)).toBeNull();
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now, null)).not.toBeNull();
    expect(verifyTotp(secret, '12345', now, null)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now, null)).toBeNull();
  });

  it('never accepts the same code twice', () => {
    const secret = generateSecret();
    const now = new Date('2026-10-19T12:00:10Z');
    const step = verifyTotp(secret, totpCode(secret, now), now, null)!;
    expect(verifyTotp(secret, totpCode(secret, now), now, step)).toBeNull();
  });

  it('builds the otpauth link authenticator apps read', () => {
    expect(otpauthUrl('ABC', 'ana@acme.com')).toBe('otpauth://totp/Northstack%3Aana%40acme.com?secret=ABC&issuer=Northstack&algorithm=SHA1&digits=6&period=30');
  });

  it('recovery codes: 10, readable, unique, normalized when typed', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
    expect(normalizeRecoveryCode(' ABCD-EF23 ')).toBe('abcdef23');
  });
});
