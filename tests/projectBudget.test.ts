import { describe, expect, it } from 'vitest';
import { budgetLevel, parseBudgetMinutes } from '../src/modules/projects/projectBudget.js';

describe('project hour budget (phase 2, block C)', () => {
  it('thresholds: none, 80 %, 100 %', () => {
    expect(budgetLevel(100, null)).toBe(0);
    expect(budgetLevel(470, 600)).toBe(0);
    expect(budgetLevel(480, 600)).toBe(80);
    expect(budgetLevel(600, 600)).toBe(100);
    expect(budgetLevel(900, 600)).toBe(100);
  });

  it('budget input', () => {
    expect(parseBudgetMinutes(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseBudgetMinutes(null)).toEqual({ ok: true, value: null });
    expect(parseBudgetMinutes(2400)).toEqual({ ok: true, value: 2400 });
    expect(parseBudgetMinutes(0).ok).toBe(false);
    expect(parseBudgetMinutes(1.5).ok).toBe(false);
  });
});
