import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatMinute,
  isValidDateString,
  isValidMinute,
  isValidTimeZone,
  offsetMinutes,
  rangesOverlap,
  shiftDurationMinutes,
  shiftInstants,
  zonedDateString,
  zonedToUtc,
} from '../src/modules/shifts/shiftTime.js';

const BA = 'America/Argentina/Buenos_Aires'; // UTC-3, no DST
const NY = 'America/New_York'; // DST: 2026-03-08 02:00 → 03:00, 2026-11-01 02:00 → 01:00

describe('validation', () => {
  it('accepts real IANA zones and rejects junk', () => {
    expect(isValidTimeZone(BA)).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });

  it('minutes must be whole and inside one day', () => {
    expect(isValidMinute(0)).toBe(true);
    expect(isValidMinute(1439)).toBe(true);
    expect(isValidMinute(1440)).toBe(false);
    expect(isValidMinute(-1)).toBe(false);
    expect(isValidMinute(7.5)).toBe(false);
  });

  it('dates must be real YYYY-MM-DD days', () => {
    expect(isValidDateString('2026-10-12')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('12/10/2026')).toBe(false);
  });
});

describe('zonedToUtc', () => {
  it('converts a Buenos Aires wall time to UTC (+3h)', () => {
    expect(zonedToUtc('2026-10-12', 7 * 60, BA).toISOString()).toBe('2026-10-12T10:00:00.000Z');
  });

  it('uses the offset in force on that date, not today: New York summer vs winter', () => {
    expect(zonedToUtc('2026-07-01', 9 * 60, NY).toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(zonedToUtc('2026-12-01', 9 * 60, NY).toISOString()).toBe('2026-12-01T14:00:00.000Z');
  });

  it('a wall time skipped by spring-forward lands after the jump', () => {
    // 02:30 doesn't exist in New York on 2026-03-08; resolves to 03:30 EDT = 07:30Z.
    expect(zonedToUtc('2026-03-08', 2 * 60 + 30, NY).toISOString()).toBe('2026-03-08T07:30:00.000Z');
  });

  it('reports offsets in minutes', () => {
    expect(offsetMinutes(new Date('2026-10-12T12:00:00Z'), BA)).toBe(-180);
    expect(offsetMinutes(new Date('2026-07-01T12:00:00Z'), NY)).toBe(-240);
  });
});

describe('shiftInstants', () => {
  it('same-day shift', () => {
    const { startsAt, endsAt } = shiftInstants('2026-10-12', 7 * 60, 11 * 60 + 30, BA);
    expect(startsAt.toISOString()).toBe('2026-10-12T10:00:00.000Z');
    expect(endsAt.toISOString()).toBe('2026-10-12T14:30:00.000Z');
  });

  it('overnight shift ends the next day', () => {
    const { startsAt, endsAt } = shiftInstants('2026-10-13', 22 * 60, 6 * 60, BA);
    expect(startsAt.toISOString()).toBe('2026-10-14T01:00:00.000Z');
    expect(endsAt.toISOString()).toBe('2026-10-14T09:00:00.000Z');
  });

  it('an overnight shift across fall-back really lasts 9 hours', () => {
    const { startsAt, endsAt } = shiftInstants('2026-10-31', 22 * 60, 6 * 60, NY);
    expect((endsAt.getTime() - startsAt.getTime()) / 3_600_000).toBe(9);
  });
});

describe('helpers', () => {
  it('duration handles overnight', () => {
    expect(shiftDurationMinutes(420, 690)).toBe(270);
    expect(shiftDurationMinutes(1320, 360)).toBe(480);
    expect(shiftDurationMinutes(480, 480)).toBe(1440); // same start and end = a full 24h shift
  });

  it('addDays crosses months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('zonedDateString gives the local day', () => {
    // 02:00Z on the 13th is still the 12th in Buenos Aires.
    expect(zonedDateString(new Date('2026-10-13T02:00:00Z'), BA)).toBe('2026-10-12');
  });

  it('formatMinute pads', () => {
    expect(formatMinute(0)).toBe('00:00');
    expect(formatMinute(7 * 60 + 5)).toBe('07:05');
  });

  it('back-to-back shifts do not overlap; nested ones do', () => {
    const d = (h: number) => new Date(Date.UTC(2026, 9, 12, h));
    expect(rangesOverlap(d(7), d(11), d(11), d(15))).toBe(false);
    expect(rangesOverlap(d(7), d(11), d(10), d(15))).toBe(true);
    expect(rangesOverlap(d(7), d(15), d(9), d(10))).toBe(true);
  });
});
