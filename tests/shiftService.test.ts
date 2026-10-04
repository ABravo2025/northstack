import { describe, expect, it } from 'vitest';
import { hashResponseToken, isShiftResponse, newResponseToken, parseDateRange, parseShiftInput } from '../src/modules/shifts/shiftService.js';

describe('parseShiftInput', () => {
  it('create needs location, date and both times', () => {
    const ok = parseShiftInput({ locationId: 'loc', date: '2026-10-12', startMinute: 420, endMinute: 690, headcount: 2, position: ' Analyst ' }, 'create');
    expect(ok).toEqual({
      success: true,
      value: { locationId: 'loc', date: '2026-10-12', startMinute: 420, endMinute: 690, headcount: 2, position: 'Analyst' },
    });
    const missing = parseShiftInput({ locationId: 'loc', date: '2026-10-12', startMinute: 420 }, 'create');
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.field).toBe('endMinute');
  });

  it('an overnight shift (end before start) is valid', () => {
    expect(parseShiftInput({ locationId: 'l', date: '2026-10-13', startMinute: 1320, endMinute: 360 }, 'create').success).toBe(true);
  });

  it('update validates only what was sent', () => {
    expect(parseShiftInput({ notes: '  ' }, 'update')).toEqual({ success: true, value: { notes: null } });
  });

  it('rejects bad values', () => {
    expect(parseShiftInput({ date: '2026-13-01' }, 'update').success).toBe(false);
    expect(parseShiftInput({ startMinute: 1440 }, 'update').success).toBe(false);
    expect(parseShiftInput({ headcount: 0 }, 'update').success).toBe(false);
    expect(parseShiftInput({ notes: 'x'.repeat(1001) }, 'update').success).toBe(false);
    expect(parseShiftInput({ requiredSkillIds: ['a', 3] }, 'update').success).toBe(false);
  });

  it('dedupes required skills', () => {
    expect(parseShiftInput({ requiredSkillIds: ['a', 'a', 'b'] }, 'update')).toEqual({ success: true, value: { requiredSkillIds: ['a', 'b'] } });
  });
});

describe('parseDateRange', () => {
  it('accepts a week and rejects reversed or huge ranges', () => {
    expect(parseDateRange('2026-10-12', '2026-10-18')).toEqual({ success: true, value: { from: '2026-10-12', to: '2026-10-18' } });
    expect(parseDateRange('2026-10-18', '2026-10-12').success).toBe(false);
    expect(parseDateRange('2026-01-01', '2026-06-01').success).toBe(false);
    expect(parseDateRange('2026-10-12', undefined).success).toBe(false);
  });
});

describe('response tokens', () => {
  it('stores only a hash, and the same token always hashes the same', () => {
    const { token, hash } = newResponseToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hash).not.toContain(token);
    expect(hashResponseToken(token)).toBe(hash);
    expect(newResponseToken().token).not.toBe(token);
  });

  it('only accepted/declined are answers', () => {
    expect(isShiftResponse('accepted')).toBe(true);
    expect(isShiftResponse('declined')).toBe(true);
    expect(isShiftResponse('pending')).toBe(false);
  });
});
