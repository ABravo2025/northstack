import { describe, expect, it } from 'vitest';
import { applyEmailPreferences, EMAIL_CATEGORIES, isEmailCategory } from '../src/lib/emailPreferences.js';

describe('email preferences', () => {
  it('knows its categories', () => {
    expect(isEmailCategory('shifts')).toBe(true);
    expect(isEmailCategory('passwordReset')).toBe(false);
    expect(EMAIL_CATEGORIES).toContain('opportunityStage');
  });

  it('turning a category off adds it to the opt-outs, on removes it', () => {
    expect(applyEmailPreferences([], { shifts: false })).toEqual({ ok: true, value: ['shifts'] });
    expect(applyEmailPreferences(['shifts', 'timeOff'], { shifts: true })).toEqual({ ok: true, value: ['timeOff'] });
    // Kept in a stable order and without unknown leftovers.
    expect(applyEmailPreferences(['legacy', 'timeOff'], { shiftReminders: false })).toEqual({ ok: true, value: ['shiftReminders', 'timeOff'] });
  });

  it('rejects unknown categories and non-boolean values', () => {
    expect(applyEmailPreferences([], { passwordReset: false }).ok).toBe(false);
    expect(applyEmailPreferences([], { shifts: 'no' }).ok).toBe(false);
    expect(applyEmailPreferences([], null).ok).toBe(false);
  });
});
