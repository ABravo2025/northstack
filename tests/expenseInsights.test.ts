import { describe, expect, it } from 'vitest';
import { budgetStatus, detectSubscriptions, type Movementish } from '../src/modules/expenses/insightsService.js';

const mv = (date: string, description: string, amountCents: number, over: Partial<Movementish> = {}): Movementish => ({
  accountId: 'visa',
  date,
  description,
  amountCents,
  direction: 'debit',
  kind: 'expense',
  categoryId: 'software',
  fixedExpenseId: null,
  ...over,
});

describe('expense insights', () => {
  it('budget at 80% warns, at 100% is over', () => {
    expect(budgetStatus(70, 100)).toBe('ok');
    expect(budgetStatus(80, 100)).toBe('warn');
    expect(budgetStatus(120, 100)).toBe('over');
  });

  it('suggests a subscription charged in 3+ months at a similar amount', () => {
    const subs = detectSubscriptions(
      [
        mv('2026-08-03', 'GOOGLE *WORKSPACE 4412', 62400),
        mv('2026-09-03', 'GOOGLE *WORKSPACE 9981', 62400),
        mv('2026-10-03', 'GOOGLE *WORKSPACE 1203', 65000),
        mv('2026-10-12', 'YPF SERVICOMPRAS', 38200),
        mv('2026-09-20', 'YPF SERVICOMPRAS', 12000),
        mv('2026-08-11', 'YPF SERVICOMPRAS', 90000),
      ],
      [],
    );
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ accountId: 'visa', amountCents: 62400, dayOfMonth: 3, months: 3, categoryId: 'software' });
  });

  it('skips what is already a fixed expense or already linked to one', () => {
    const list = [mv('2026-08-03', 'CANVA PRO', 12990), mv('2026-09-03', 'CANVA PRO', 12990), mv('2026-10-03', 'CANVA PRO', 12990)];
    expect(detectSubscriptions(list, ['Canva Pro'])).toEqual([]);
    expect(detectSubscriptions(list.map((m) => ({ ...m, fixedExpenseId: 'f1' })), [])).toEqual([]);
  });
});
