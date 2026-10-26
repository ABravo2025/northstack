import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({ default: {} }));

import { suggestPayDate } from '../src/modules/hr/payDateService.js';

const weekdays = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe('suggestPayDate', () => {
  it('monthly last business day: Oct 2026 ends on a Saturday → Friday 30', () => {
    expect(iso(suggestPayDate('monthly', { preset: 'last_business_day' }, d('2026-10-26'), weekdays))).toBe('2026-10-30');
  });

  it('monthly first business day after the 1st → next month, moved forward past the weekend', () => {
    // Nov 1 2026 is a Sunday → Monday Nov 2
    expect(iso(suggestPayDate('monthly', { preset: 'first_business_day' }, d('2026-10-26'), weekdays))).toBe('2026-11-02');
  });

  it('custom day on a weekend moves back, never late', () => {
    // Nov 15 2026 is a Sunday → Friday Nov 13
    expect(iso(suggestPayDate('monthly', { preset: 'custom', day: 15 }, d('2026-11-01'), weekdays))).toBe('2026-11-13');
  });

  it('semimonthly 15th and last: picks the next one', () => {
    expect(iso(suggestPayDate('semimonthly', { preset: 'fifteen_last' }, d('2026-10-10'), weekdays))).toBe('2026-10-15');
    expect(iso(suggestPayDate('semimonthly', { preset: 'fifteen_last' }, d('2026-10-16'), weekdays))).toBe('2026-10-30');
  });

  it('weekly Friday', () => {
    expect(iso(suggestPayDate('weekly', { dayOfWeek: 'friday' }, d('2026-10-26'), weekdays))).toBe('2026-10-30');
  });

  it('company holidays count as days off', () => {
    const offOct30 = (x: Date) => weekdays(x) && iso(x) !== '2026-10-30';
    expect(iso(suggestPayDate('monthly', { preset: 'last_business_day' }, d('2026-10-26'), offOct30))).toBe('2026-10-29');
  });

  it('crosses the year', () => {
    expect(iso(suggestPayDate('monthly', { preset: 'first_business_day' }, d('2026-12-15'), weekdays))).toBe('2027-01-01');
  });
});
