import { describe, expect, it } from 'vitest';
import { minutesToHours, parsePeriod } from '../src/modules/hr/payrollHoursService.js';

describe('timesheet hours into payroll', () => {
  it('minutes → hours with two decimals', () => {
    expect(minutesToHours(0)).toBe(0);
    expect(minutesToHours(90)).toBe(1.5);
    expect(minutesToHours(100)).toBe(1.67);
    expect(minutesToHours(9615)).toBe(160.25);
  });

  it('validates the period', () => {
    expect(parsePeriod('2026-10-01', '2026-10-31')).toEqual({ success: true, value: { from: '2026-10-01', to: '2026-10-31' } });
    expect(parsePeriod('2026-10-31', '2026-10-01')).toMatchObject({ success: false, field: 'to' });
    expect(parsePeriod('nope', '2026-10-01')).toMatchObject({ success: false, field: 'from' });
    expect(parsePeriod('2026-01-01', '2026-06-30')).toMatchObject({ success: false, field: 'to' });
  });
});
