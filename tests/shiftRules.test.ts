import { describe, expect, it } from 'vitest';
import { availabilityWarnings, evaluateCandidate, restViolated, type CandidateContext, type ShiftWindow } from '../src/modules/shifts/shiftRules.js';

const utc = (iso: string) => new Date(iso);

// Monday 2026-10-12, 07:00-11:30 local (UTC-3).
const morning: ShiftWindow = {
  id: 's1',
  date: '2026-10-12',
  endDate: '2026-10-12',
  startMinute: 420,
  endMinute: 690,
  startsAt: utc('2026-10-12T10:00:00Z'),
  endsAt: utc('2026-10-12T14:30:00Z'),
  requiredSkillIds: [],
};

// Monday 22:00 → Tuesday 06:00 local.
const overnight: ShiftWindow = {
  id: 's2',
  date: '2026-10-12',
  endDate: '2026-10-13',
  startMinute: 1320,
  endMinute: 360,
  startsAt: utc('2026-10-13T01:00:00Z'),
  endsAt: utc('2026-10-13T09:00:00Z'),
  requiredSkillIds: [],
};

const clean = (): CandidateContext => ({
  hasActiveUser: true,
  alreadyAssigned: false,
  heldShifts: [],
  timeOff: [],
  holidayDates: [],
  availability: [],
  skills: new Map(),
});

const settings = { minRestHours: 12, skillsEnabled: true };

describe('evaluateCandidate', () => {
  it('a free person with a user account passes cleanly', () => {
    expect(evaluateCandidate(morning, clean(), settings)).toEqual({ blocks: [], warnings: [] });
  });

  it('blocks people without an active user (they must be a seat) and repeats', () => {
    const r = evaluateCandidate(morning, { ...clean(), hasActiveUser: false, alreadyAssigned: true }, settings);
    expect(r.blocks).toEqual(['already_assigned', 'no_user']);
  });

  it('blocks an overlapping shift, but back-to-back is fine (rest rule aside)', () => {
    const overlap = evaluateCandidate(morning, { ...clean(), heldShifts: [{ shiftId: 'x', startsAt: utc('2026-10-12T14:00:00Z'), endsAt: utc('2026-10-12T18:00:00Z') }] }, settings);
    expect(overlap.blocks).toEqual(['overlap']);
    const touching = evaluateCandidate(morning, { ...clean(), heldShifts: [{ shiftId: 'x', startsAt: utc('2026-10-12T14:30:00Z'), endsAt: utc('2026-10-12T18:00:00Z') }] }, { ...settings, minRestHours: null });
    expect(touching).toEqual({ blocks: [], warnings: [] });
  });

  it('warns on approved time off covering either day of an overnight shift', () => {
    const r = evaluateCandidate(overnight, { ...clean(), timeOff: [{ startDate: '2026-10-13', endDate: '2026-10-15' }] }, settings);
    expect(r.warnings).toContain('time_off');
  });

  it('warns on a holiday', () => {
    expect(evaluateCandidate(morning, { ...clean(), holidayDates: ['2026-10-12'] }, settings).warnings).toEqual(['holiday']);
  });

  it('skills: missing and expired warn; ignored entirely when the plan has no skills', () => {
    const shift = { ...morning, requiredSkillIds: ['a', 'b'] };
    const ctx = { ...clean(), skills: new Map<string, string | null>([['b', '2026-10-01']]) };
    expect(evaluateCandidate(shift, ctx, settings).warnings).toEqual(['missing_skill', 'expired_skill']);
    expect(evaluateCandidate(shift, ctx, { ...settings, skillsEnabled: false }).warnings).toEqual([]);
    const valid = { ...clean(), skills: new Map<string, string | null>([['a', null], ['b', '2026-12-31']]) };
    expect(evaluateCandidate(shift, valid, settings).warnings).toEqual([]);
  });
});

describe('restViolated', () => {
  it('flags less than the minimum between shifts', () => {
    // Previous shift ended 22:00 the night before (01:00Z) → 9h before a 07:00 start.
    const held = [{ shiftId: 'prev', startsAt: utc('2026-10-11T21:00:00Z'), endsAt: utc('2026-10-12T01:00:00Z') }];
    expect(restViolated(morning, held, 12)).toBe(true);
    expect(restViolated(morning, held, 8)).toBe(false);
    expect(restViolated(morning, held, null)).toBe(false);
  });

  it('checks the gap to the next shift too', () => {
    const held = [{ shiftId: 'next', startsAt: utc('2026-10-12T20:00:00Z'), endsAt: utc('2026-10-12T23:00:00Z') }];
    expect(restViolated(morning, held, 12)).toBe(true);
  });
});

describe('availabilityWarnings', () => {
  it('no availability rows = no opinion', () => {
    expect(availabilityWarnings(morning, [])).toEqual([]);
  });

  it('a recurring "unavailable" on that weekday warns', () => {
    expect(availabilityWarnings(morning, [{ weekday: 1, date: null, startMinute: 600, endMinute: 900, kind: 'unavailable' }])).toEqual(['unavailable']);
  });

  it('outside the stated available window warns; inside it does not', () => {
    const rows = [{ weekday: 1, date: null, startMinute: 480, endMinute: 1080, kind: 'available' as const }];
    expect(availabilityWarnings(morning, rows)).toEqual(['outside_availability']);
    expect(availabilityWarnings(morning, [{ ...rows[0], startMinute: 360 }])).toEqual([]);
  });

  it('a one-off row on the date overrides the weekday rule', () => {
    const rows = [
      { weekday: 1, date: null, startMinute: 0, endMinute: 1440, kind: 'unavailable' as const },
      { weekday: null, date: '2026-10-12', startMinute: 360, endMinute: 720, kind: 'available' as const },
    ];
    expect(availabilityWarnings(morning, rows)).toEqual([]);
  });

  it('checks both days of an overnight shift', () => {
    // Unavailable Tuesday early morning.
    expect(availabilityWarnings(overnight, [{ weekday: 2, date: null, startMinute: 0, endMinute: 300, kind: 'unavailable' }])).toEqual(['unavailable']);
  });
});
