import { describe, expect, it } from 'vitest';
import { isEditableStatus, parseAdjustmentInput, parseEntryInput, parseReason, weekDates, weekStartFor } from '../src/modules/shifts/timesheetService.js';

describe('weekStartFor', () => {
  // 2026-10-12 is a Monday.
  it('weeks starting Monday', () => {
    expect(weekStartFor('2026-10-12', 1)).toBe('2026-10-12');
    expect(weekStartFor('2026-10-18', 1)).toBe('2026-10-12');
    expect(weekStartFor('2026-10-19', 1)).toBe('2026-10-19');
  });

  it('weeks starting Sunday, across a month end', () => {
    expect(weekStartFor('2026-10-12', 0)).toBe('2026-10-11');
    expect(weekStartFor('2026-11-01', 0)).toBe('2026-11-01');
    expect(weekStartFor('2026-10-31', 0)).toBe('2026-10-25');
  });

  it('lists the seven days', () => {
    expect(weekDates('2026-10-26')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });
});

describe('parseEntryInput', () => {
  it('a manual entry needs a date and 1..1440 minutes', () => {
    expect(parseEntryInput({ date: '2026-10-12', minutes: 90 }, 'create', true)).toEqual({
      success: true,
      value: { date: '2026-10-12', minutes: 90, source: 'manual', sourceId: null, description: null, billable: false, companyId: null, projectId: null },
    });
    expect(parseEntryInput({ date: '2026-10-12', minutes: 0 }, 'create', true).success).toBe(false);
    expect(parseEntryInput({ date: '2026-10-12', minutes: 1441 }, 'create', true).success).toBe(false);
    expect(parseEntryInput({ date: '2026-10-12', minutes: 1.5 }, 'create', true).success).toBe(false);
    expect(parseEntryInput({ minutes: 60 }, 'create', true).success).toBe(false);
  });

  it('a suggested entry carries its source id', () => {
    expect(parseEntryInput({ date: '2026-10-12', minutes: 60, source: 'shift' }, 'create', true).success).toBe(false);
    const ok = parseEntryInput({ date: '2026-10-12', minutes: 60, source: 'shift', sourceId: 'a1' }, 'create', true);
    expect(ok.success && ok.value.sourceId).toBe('a1');
    expect(parseEntryInput({ date: '2026-10-12', minutes: 60, source: 'adjustment', sourceId: 'x' }, 'create', true).success).toBe(false);
  });

  it('billable only on plans that have it', () => {
    const r = parseEntryInput({ date: '2026-10-12', minutes: 60, billable: true }, 'create', false);
    expect(r.success).toBe(false);
    expect(!r.success && r.code).toBe('plan_limit_billable');
  });

  it('an update takes only what changed', () => {
    expect(parseEntryInput({ minutes: 45 }, 'update', true)).toEqual({ success: true, value: { minutes: 45 } });
  });
});

describe('adjustments and reasons', () => {
  it('minutes can be negative but not zero; a reason is required', () => {
    expect(parseAdjustmentInput({ minutes: -30, reason: 'Logged twice' })).toEqual({ success: true, value: { minutes: -30, reason: 'Logged twice', description: null } });
    expect(parseAdjustmentInput({ minutes: 0, reason: 'x' }).success).toBe(false);
    expect(parseAdjustmentInput({ minutes: 60, reason: '  ' }).success).toBe(false);
    expect(parseAdjustmentInput({ minutes: 24 * 60 * 7 + 1, reason: 'x' }).success).toBe(false);
  });

  it('optional and required reasons', () => {
    expect(parseReason('', 'note', false)).toEqual({ success: true, value: null });
    expect(parseReason('', 'note', true).success).toBe(false);
  });

  it('only open and returned weeks can be edited', () => {
    expect(isEditableStatus('open')).toBe(true);
    expect(isEditableStatus('returned')).toBe(true);
    expect(isEditableStatus('submitted')).toBe(false);
    expect(isEditableStatus('approved')).toBe(false);
  });
});
