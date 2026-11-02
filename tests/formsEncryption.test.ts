import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decryptAnswers,
  encryptAnswers,
  hashInviteToken,
  isFormsEncryptionConfigured,
  newInviteToken,
} from '../src/lib/formsEncryption.js';

describe('form response encryption', () => {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.FORMS_DATA_ENCRYPTION_KEY;
    process.env.FORMS_DATA_ENCRYPTION_KEY = 'f'.repeat(64);
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.FORMS_DATA_ENCRYPTION_KEY;
    else process.env.FORMS_DATA_ENCRYPTION_KEY = previous;
  });

  it('round-trips answers and never stores them in clear', () => {
    const enc = encryptAnswers({ q1: 'ana@example.com', q2: 9 });
    expect(enc).not.toContain('ana@example.com');
    expect(decryptAnswers(enc)).toEqual({ q1: 'ana@example.com', q2: 9 });
    expect(encryptAnswers({ q1: 'x' })).not.toBe(encryptAnswers({ q1: 'x' }));
  });

  it('reports a missing or malformed key instead of throwing', () => {
    expect(isFormsEncryptionConfigured()).toBe(true);
    process.env.FORMS_DATA_ENCRYPTION_KEY = 'abc';
    expect(isFormsEncryptionConfigured()).toBe(false);
    delete process.env.FORMS_DATA_ENCRYPTION_KEY;
    expect(isFormsEncryptionConfigured()).toBe(false);
  });

  it('stores only the hash of a personal-link token', () => {
    const { token, tokenHash } = newInviteToken();
    expect(token.length).toBeGreaterThan(40);
    expect(tokenHash).toBe(hashInviteToken(token));
    expect(tokenHash).not.toContain(token);
  });
});
