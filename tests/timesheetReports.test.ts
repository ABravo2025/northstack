import { describe, expect, it } from 'vitest';
import { addCost, costCents, rateOn, type RateRow } from '../src/modules/shifts/timesheetReports.js';

const rate = (over: Partial<RateRow>): RateRow => ({
  employeeId: 'e1',
  compensationType: 'hourly',
  rateCents: 1200,
  currency: 'USD',
  effectiveFrom: new Date('2026-01-01T00:00:00Z'),
  effectiveTo: null,
  ...over,
});

describe('schedule cost', () => {
  it('picks the rate in effect that day', () => {
    const rates = [
      rate({ rateCents: 1000, effectiveFrom: new Date('2026-01-01T00:00:00Z'), effectiveTo: new Date('2026-06-30T00:00:00Z') }),
      rate({ rateCents: 1500, effectiveFrom: new Date('2026-07-01T00:00:00Z') }),
    ];
    expect(rateOn(rates, 'e1', '2026-03-10')?.rateCents).toBe(1000);
    expect(rateOn(rates, 'e1', '2026-06-30')?.rateCents).toBe(1000);
    expect(rateOn(rates, 'e1', '2026-07-01')?.rateCents).toBe(1500);
    expect(rateOn(rates, 'e1', '2025-12-31')).toBeNull();
    expect(rateOn(rates, 'e2', '2026-03-10')).toBeNull();
  });

  it('minutes × hourly rate, rounded to cents, summed per currency', () => {
    expect(costCents(1200, 90)).toBe(1800);
    expect(costCents(1000, 1)).toBe(17);
    const totals = {};
    addCost(totals, 'USD', 1800);
    addCost(totals, 'USD', 200);
    addCost(totals, 'ARS', 50000);
    expect(totals).toEqual({ USD: 2000, ARS: 50000 });
  });
});
