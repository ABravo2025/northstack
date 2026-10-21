import { describe, expect, it } from 'vitest';
import { TEMPLATES, computeOvertime, parseRules, weekStartOf, type DayInput } from '../src/modules/hr/overtimeRules.js';

const day = (date: string, hours: number, intervals: [number, number][] = [], holiday = false): DayInput => ({
  date,
  minutes: hours * 60,
  holiday,
  intervals: intervals.map(([s, e]) => ({ start: s * 60, end: e * 60 })),
});
const ar = TEMPLATES.ar;
const us = TEMPLATES.us;
// 2026-10-19 is a Monday.

describe('overtime rules', () => {
  it('Argentina: over 8 h a day at 50 %', () => {
    const r = computeOvertime([day('2026-10-19', 10), day('2026-10-20', 8)], ar, 1, '2026-10-19');
    expect(r).toMatchObject({ regularMinutes: 16 * 60, weekdayOvertimeMinutes: 2 * 60, restOvertimeMinutes: 0 });
  });

  it('Argentina: Sunday and holidays are rest-day overtime in full', () => {
    const r = computeOvertime([day('2026-10-25', 6), day('2026-10-21', 5, [], true)], ar, 1, '2026-10-19');
    expect(r).toMatchObject({ regularMinutes: 0, restOvertimeMinutes: 11 * 60 });
  });

  it('Argentina: Saturday from 13:00 counts as rest, only when the time is known', () => {
    const known = computeOvertime([day('2026-10-24', 8, [[9, 17]])], ar, 1, '2026-10-19');
    expect(known).toMatchObject({ regularMinutes: 4 * 60, restOvertimeMinutes: 4 * 60 });
    const unknown = computeOvertime([day('2026-10-24', 8)], ar, 1, '2026-10-19');
    expect(unknown).toMatchObject({ regularMinutes: 8 * 60, restOvertimeMinutes: 0 });
  });

  it('Argentina: over 48 h a week, without counting daily overtime twice', () => {
    // 6 × 9 h Mon–Sat (Saturday morning only): 6 h daily overtime, 48 regular, nothing weekly.
    const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].map((d) => day(d, 9, [[8, 17]]));
    const r = computeOvertime([...days, day('2026-10-24', 9, [[3, 12]])], ar, 1, '2026-10-19');
    expect(r).toMatchObject({ regularMinutes: 48 * 60, weekdayOvertimeMinutes: 6 * 60 });
  });

  it('US: time and a half over 40 hours a week, no daily rule', () => {
    const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].map((d) => day(d, 10));
    const r = computeOvertime(days, us, 1, '2026-10-19');
    expect(r).toMatchObject({ regularMinutes: 40 * 60, weekdayOvertimeMinutes: 10 * 60, restOvertimeMinutes: 0 });
  });

  it('a week that started in the previous period still counts toward the weekly limit', () => {
    // Period starts Thursday; Mon–Wed (30 h) belong to the previous run but fill the 40 h week.
    const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].map((d) => day(d, 10));
    const r = computeOvertime(days, us, 1, '2026-10-22');
    expect(r).toMatchObject({ regularMinutes: 10 * 60, weekdayOvertimeMinutes: 10 * 60 });
  });

  it('night window across midnight, proportional to approved minutes', () => {
    const rules = { ...TEMPLATES.custom, nightPct: 30, nightStartMinute: 21 * 60, nightEndMinute: 6 * 60 };
    // Clocked 20–24 (4 h, 3 of them night), but 3 h approved → 2.25 h night.
    const r = computeOvertime([day('2026-10-20', 3, [[20, 24]])], rules, 1, '2026-10-19');
    expect(r.nightMinutes).toBe(135);
    expect(r.regularMinutes).toBe(180);
  });

  it('weekStartOf', () => {
    expect(weekStartOf('2026-10-25', 1)).toBe('2026-10-19');
    expect(weekStartOf('2026-10-25', 0)).toBe('2026-10-25');
  });

  it('validates rules', () => {
    expect(parseRules({ ...ar }).success).toBe(true);
    expect(parseRules({ ...ar, weekdayPct: -5 })).toMatchObject({ success: false, field: 'weekdayPct' });
    expect(parseRules({ ...ar, nightEndMinute: null })).toMatchObject({ success: false, field: 'nightEndMinute' });
  });
});
