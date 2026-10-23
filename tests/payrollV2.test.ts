import { describe, expect, it } from 'vitest';
import { buildLines, layoutFor, maskAccount, newVerifyCode, numberLabel } from '../src/modules/hr/payslipV2Service.js';
import { defaultMethodKinds } from '../src/modules/hr/paymentMethodService.js';
import { variationPct } from '../src/modules/hr/payrollOverviewService.js';

const entry = (type: string, amountCents: number, extra: Partial<{ hoursQty: number; label: string; overtimeKind: string }> = {}) => ({
  type: type as never,
  amountCents,
  hoursQty: extra.hoursQty ?? null,
  label: extra.label ?? null,
  overtimeKind: extra.overtimeKind ?? null,
});

describe('payroll v2', () => {
  it('payslip lines: hourly base, overtime with its %, night surcharge, bonus, deduction', () => {
    const r = buildLines(
      [
        entry('deduction', -15_000_00, { label: 'Adelanto' }),
        entry('overtime', 2_250_00, { hoursQty: 12, overtimeKind: 'weekday' }),
        entry('base', 19_500_00, { hoursQty: 156 }),
        entry('overtime', 1_000_00, { hoursQty: 4, overtimeKind: 'rest' }),
        entry('overtime', 300_00, { hoursQty: 8, overtimeKind: 'night' }),
        entry('bonus', 1_550_00, { label: 'Objetivos' }),
      ],
      { type: 'hourly', rateCents: 125_00 },
    );
    expect(r.earnings.map((l) => [l.kind, l.pct])).toEqual([
      ['base_hours', null],
      ['overtime', 50],
      ['overtime', 100],
      ['night', 30],
      ['bonus', null],
    ]);
    expect(r.earnings[2].note).toBe('rest');
    expect(r.deductions).toHaveLength(1);
    expect(r.grossCents).toBe(24_600_00);
    expect(r.deductionsCents).toBe(-15_000_00);
    expect(r.netCents).toBe(9_600_00);
  });

  it('fixed salary base line has no hours', () => {
    const r = buildLines([entry('base', 280_000_00)], { type: 'fixed', rateCents: null });
    expect(r.earnings[0]).toMatchObject({ kind: 'base_fixed', qty: null, amountCents: 280_000_00 });
  });

  it('layout by country, number label, verify code, masking', () => {
    expect(layoutFor('AR')).toBe('ar');
    expect(layoutFor('ar')).toBe('ar');
    expect(layoutFor('US')).toBe('us');
    expect(layoutFor(null)).toBe('us');
    expect(numberLabel(1, 248)).toBe('0001-000248');
    expect(newVerifyCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(maskAccount('0170 1234 5678 9012 4821')).toBe('···· 4821');
    expect(maskAccount('lucia.fernandez@gmail.com')).toBe('l***@gmail.com');
    expect(maskAccount(null)).toBeNull();
  });

  it('payment methods on by default by country', () => {
    expect(defaultMethodKinds('AR')).toEqual(['bank_ar', 'mercadopago']);
    expect(defaultMethodKinds('US')).toEqual(['bank_intl', 'wise', 'payoneer']);
    expect(defaultMethodKinds(null)).toEqual(['bank_intl', 'wise', 'payoneer']);
  });

  it('variation against the previous run, main currency', () => {
    expect(variationPct({ ARS: 19_560_000_00, USD: 3_380_00 }, { ARS: 18_420_000_00, USD: 3_200_00 })).toBe(6.2);
    expect(variationPct({ ARS: 100 }, null)).toBeNull();
    expect(variationPct({ ARS: 100 }, { USD: 100 })).toBeNull();
  });
});
