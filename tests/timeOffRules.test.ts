import { describe, expect, it } from 'vitest';
import { allocatedDays, buildDayOffMap, closeYear, computeBalance, countRequestDays, resolveDayCount, type HolidayRow } from '../src/modules/hr/timeOffRules.js';

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const MON_FRI = [1, 2, 3, 4, 5];

describe('Time Off rules — day counting', () => {
  const holidays: HolidayRow[] = [
    { date: D('2026-10-12'), name: 'Diversidad Cultural', kind: 'national', religion: null, isOff: true },
    { date: D('2026-12-07'), name: 'Feriado puente', kind: 'non_working', religion: null, isOff: false },
    { date: D('2026-12-24'), name: 'Nochebuena', kind: 'company', religion: null, isOff: true },
    { date: D('2026-09-21'), name: 'Yom Kippur', kind: 'religious', religion: 'jewish', isOff: true },
  ];

  it('counts every day in calendar mode, holidays and weekends included', () => {
    const map = buildDayOffMap(holidays, [], []);
    expect(countRequestDays(D('2026-10-09'), D('2026-10-13'), 'calendar', MON_FRI, map).days).toBe(5);
  });

  it('skips weekends and national holidays in business mode', () => {
    const map = buildDayOffMap(holidays, [], []);
    // Fri 9, (Sat 10, Sun 11 off), (Mon 12 holiday), Tue 13
    const r = countRequestDays(D('2026-10-09'), D('2026-10-13'), 'business', MON_FRI, map);
    expect(r.days).toBe(2);
    expect(r.excluded.map((e) => e.reason)).toEqual(['non_working_weekday', 'non_working_weekday', 'national']);
  });

  it('only skips a día no laborable when the company gives it off', () => {
    expect(countRequestDays(D('2026-12-07'), D('2026-12-07'), 'business', MON_FRI, buildDayOffMap(holidays, [], [])).days).toBe(1);
    const given = holidays.map((h) => (h.kind === 'non_working' ? { ...h, isOff: true } : h));
    expect(countRequestDays(D('2026-12-07'), D('2026-12-07'), 'business', MON_FRI, buildDayOffMap(given, [], [])).days).toBe(0);
  });

  it('applies a religious holiday only to people with that religion, and only if the company enabled it', () => {
    const yomKippur = (religions: string[], enabled: string[]) =>
      countRequestDays(D('2026-09-21'), D('2026-09-21'), 'business', MON_FRI, buildDayOffMap(holidays, religions, enabled)).days;
    expect(yomKippur(['jewish'], ['jewish'])).toBe(0);
    expect(yomKippur([], ['jewish'])).toBe(1);
    expect(yomKippur(['jewish'], [])).toBe(1);
  });

  it('respects a six-day work week', () => {
    const map = buildDayOffMap([], [], []);
    expect(countRequestDays(D('2026-10-05'), D('2026-10-11'), 'business', [1, 2, 3, 4, 5, 6], map).days).toBe(6);
  });

  it('lets a policy override the company default', () => {
    expect(resolveDayCount('inherit', 'business')).toBe('business');
    expect(resolveDayCount('calendar', 'business')).toBe('calendar');
  });
});

describe('Time Off rules — balances (never negative)', () => {
  const base = {
    accrualMethod: 'monthly' as const,
    daysPerYear: 12,
    assignedAt: new Date(2025, 0, 1),
    year: 2026,
    now: new Date(2026, 4, 15), // May → 5 months accrued
    used: 2,
    pending: 0,
    carriedIn: 0,
    adjusted: 0,
  };

  it('monthly accrual: only accrued days unless asking in advance is allowed', () => {
    const noAdvance = computeBalance({ ...base, allowAdvance: false });
    expect(noAdvance.allocated).toBe(5);
    expect(noAdvance.available).toBe(3);
    expect(noAdvance.maxRequestable).toBe(3);
    const advance = computeBalance({ ...base, allowAdvance: true });
    expect(advance.maxRequestable).toBe(10); // up to the full year (12) minus used
  });

  it('adds carried-over and adjusted days', () => {
    const b = computeBalance({ ...base, allowAdvance: false, carriedIn: 3, adjusted: 1 });
    expect(b.available).toBe(7);
  });

  it('never reports a negative balance', () => {
    const b = computeBalance({ ...base, allowAdvance: false, used: 9 });
    expect(b.available).toBe(0);
    expect(b.maxRequestable).toBe(0);
  });

  it('fixed annual grants everything from January', () => {
    expect(allocatedDays('fixed_annual', 14, new Date(2025, 5, 1), 2026, new Date(2026, 0, 2))).toBe(14);
  });

  it('prorates a mid-year monthly assignment for the full year', () => {
    // assigned Jul 1: Jul..Dec = 6 months of 12/12
    expect(allocatedDays('monthly', 12, new Date(2026, 6, 1), 2026, new Date(2026, 11, 31, 23, 59, 59))).toBe(6);
  });
});

describe('Time Off rules — year end', () => {
  it('carries unused days up to the limit and records the rest as expired', () => {
    expect(closeYear(14, 2, 0, 9, 'carry', 5)).toEqual({ unusedDays: 7, carriedDays: 5, expiredDays: 2 });
  });
  it('carries everything with no limit', () => {
    expect(closeYear(14, 0, 1, 10, 'carry', null)).toEqual({ unusedDays: 5, carriedDays: 5, expiredDays: 0 });
  });
  it('expires everything when the policy says so, still recording it', () => {
    expect(closeYear(14, 0, 0, 10, 'expire', null)).toEqual({ unusedDays: 4, carriedDays: 0, expiredDays: 4 });
  });
});
