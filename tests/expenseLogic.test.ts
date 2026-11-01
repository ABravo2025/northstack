import { describe, expect, it } from 'vitest';
import {
  chargeDate,
  fixedStatus,
  isPeriod,
  parseAmountToCents,
  periodBounds,
  previousPeriod,
  ruleMatches,
  rulePatternFrom,
  sumSpending,
} from '../src/modules/expenses/expenseLogic.js';

describe('expense periods and charge dates', () => {
  it('validates and walks periods', () => {
    expect(isPeriod('2026-10')).toBe(true);
    expect(isPeriod('2026-13')).toBe(false);
    expect(previousPeriod('2026-01')).toBe('2025-12');
    expect(periodBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('charges a 31 on the last day of a shorter month', () => {
    expect(chargeDate('2026-02', 31)).toBe('2026-02-28');
    expect(chargeDate('2026-04', 31)).toBe('2026-04-30');
    expect(chargeDate('2026-10', 5)).toBe('2026-10-05');
  });
});

describe('fixedStatus', () => {
  it('auto debit and card are scheduled until booked, then estimated, then paid', () => {
    expect(fixedStatus('auto_debit', '2026-10', 20, '2026-10-10', null)).toBe('scheduled');
    expect(fixedStatus('card', '2026-10', 5, '2026-10-10', { isEstimated: true })).toBe('estimated');
    expect(fixedStatus('card', '2026-10', 5, '2026-10-10', { isEstimated: false })).toBe('paid');
  });

  it('manual payment becomes due 5 days before and overdue after its day', () => {
    expect(fixedStatus('manual', '2026-10', 20, '2026-10-10', null)).toBe('scheduled');
    expect(fixedStatus('manual', '2026-10', 20, '2026-10-15', null)).toBe('due');
    expect(fixedStatus('manual', '2026-10', 20, '2026-10-21', null)).toBe('overdue');
    expect(fixedStatus('manual', '2026-10', 20, '2026-10-21', { isEstimated: false })).toBe('paid');
  });
});

describe('category rules', () => {
  it('learns a pattern without digits or card noise', () => {
    expect(rulePatternFrom('MERPAGO*UBER TRIP 4821 BSAS')).toBe('MERPAGO UBER TRIP');
    expect(rulePatternFrom('Café Martínez 123')).toBe('CAFE MARTINEZ');
  });

  it('matches whole words, regardless of digits and accents', () => {
    expect(ruleMatches('MERPAGO UBER TRIP', 'merpago*uber trip 9911 caba')).toBe(true);
    expect(ruleMatches('CAFE MARTINEZ', 'CAFÉ MARTÍNEZ 77')).toBe(true);
    expect(ruleMatches('UBER', 'UBEREATS')).toBe(false);
    expect(ruleMatches('', 'anything')).toBe(false);
  });
});

describe('sumSpending', () => {
  it('leaves out internal transfers and credits, and nets refunds', () => {
    const r = sumSpending([
      { amountCents: 10000, direction: 'debit', kind: 'expense', categoryId: 'a', fixedExpenseId: 'f1' },
      { amountCents: 5000, direction: 'debit', kind: 'expense', categoryId: 'b', fixedExpenseId: null },
      { amountCents: 1000, direction: 'credit', kind: 'expense', categoryId: 'b', fixedExpenseId: null },
      { amountCents: 90000, direction: 'debit', kind: 'internal', categoryId: null, fixedExpenseId: null },
      { amountCents: 7000, direction: 'credit', kind: 'credit', categoryId: null, fixedExpenseId: null },
    ]);
    expect(r.total).toBe(14000);
    expect(r.fixed).toBe(10000);
    expect(r.variable).toBe(4000);
    expect(r.credits).toBe(7000);
    expect(r.byCategory.get('b')).toBe(4000);
  });
});

describe('parseAmountToCents', () => {
  it('reads both number conventions', () => {
    expect(parseAmountToCents('12.500,50')).toBe(1250050);
    expect(parseAmountToCents('12,500.50')).toBe(1250050);
    expect(parseAmountToCents('12500')).toBe(1250000);
    expect(parseAmountToCents('12,5')).toBe(1250);
    expect(parseAmountToCents('1.250.000')).toBe(125000000);
    expect(parseAmountToCents('$ 84.500')).toBe(8450000);
    expect(parseAmountToCents(99.99)).toBe(9999);
  });

  it('rejects zero, negatives-as-text noise and garbage', () => {
    expect(parseAmountToCents('0')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents(-5)).toBeNull();
    expect(parseAmountToCents(undefined)).toBeNull();
  });
});
