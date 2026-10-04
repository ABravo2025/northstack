import { describe, expect, it } from 'vitest';
import { parseShiftsSettingsInput } from '../src/modules/shifts/shiftsSettingsService.js';

describe('parseShiftsSettingsInput', () => {
  it('accepts a partial update and keeps only what was sent', () => {
    const r = parseShiftsSettingsInput({ requireConfirmation: false, minRestHours: 10 });
    expect(r).toEqual({ success: true, value: { requireConfirmation: false, minRestHours: 10 } });
  });

  it('null minimum rest turns the rule off', () => {
    expect(parseShiftsSettingsInput({ minRestHours: null })).toEqual({ success: true, value: { minRestHours: null } });
  });

  it('rejects out-of-range rest hours', () => {
    for (const bad of [0, 49, 7.5, '12']) {
      const r = parseShiftsSettingsInput({ minRestHours: bad });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.field).toBe('minRestHours');
    }
  });

  it('rejects non-boolean toggles', () => {
    const r = parseShiftsSettingsInput({ showScheduleCost: 'yes' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.field).toBe('showScheduleCost');
  });

  it('week start must be 0-6', () => {
    expect(parseShiftsSettingsInput({ weekStartsOn: 0 }).success).toBe(true);
    expect(parseShiftsSettingsInput({ weekStartsOn: 7 }).success).toBe(false);
  });
});
