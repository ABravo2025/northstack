import { describe, expect, it } from 'vitest';
import { parseAvailabilityInput } from '../src/modules/shifts/availabilityService.js';

describe('parseAvailabilityInput', () => {
  it('accepts a recurring weekday stretch', () => {
    expect(parseAvailabilityInput({ weekday: 1, startMinute: 480, endMinute: 840, kind: 'available' })).toEqual({
      success: true,
      value: { weekday: 1, date: null, startMinute: 480, endMinute: 840, kind: 'available', note: null },
    });
  });

  it('accepts a one-off date until midnight', () => {
    const r = parseAvailabilityInput({ date: '2026-10-17', startMinute: 0, endMinute: 1440, kind: 'unavailable', note: ' Exam ' });
    expect(r).toEqual({ success: true, value: { weekday: null, date: '2026-10-17', startMinute: 0, endMinute: 1440, kind: 'unavailable', note: 'Exam' } });
  });

  it('needs exactly one of weekday / date', () => {
    expect(parseAvailabilityInput({ startMinute: 0, endMinute: 60, kind: 'available' }).success).toBe(false);
    expect(parseAvailabilityInput({ weekday: 1, date: '2026-10-17', startMinute: 0, endMinute: 60, kind: 'available' }).success).toBe(false);
  });

  it('rejects an end before the start, a bad weekday and an unknown kind', () => {
    expect(parseAvailabilityInput({ weekday: 1, startMinute: 600, endMinute: 600, kind: 'available' }).success).toBe(false);
    expect(parseAvailabilityInput({ weekday: 7, startMinute: 0, endMinute: 60, kind: 'available' }).success).toBe(false);
    expect(parseAvailabilityInput({ weekday: 1, startMinute: 0, endMinute: 60, kind: 'maybe' }).success).toBe(false);
  });
});
