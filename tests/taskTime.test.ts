import { describe, expect, it } from 'vitest';
import { addElapsed, elapsedMinutes, parseTimeSpent } from '../src/modules/tasks/taskTime.js';

describe('task time spent', () => {
  it('accepts whole minutes or null, rejects the rest', () => {
    expect(parseTimeSpent(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseTimeSpent(null)).toEqual({ ok: true, value: null });
    expect(parseTimeSpent(45)).toEqual({ ok: true, value: 45 });
    expect(parseTimeSpent(-1).ok).toBe(false);
    expect(parseTimeSpent(2.5).ok).toBe(false);
    expect(parseTimeSpent('30').ok).toBe(false);
    expect(parseTimeSpent(60_001).ok).toBe(false);
  });

  it('the timer rounds to minutes and counts at least one', () => {
    const start = new Date('2026-10-12T10:00:00Z');
    expect(elapsedMinutes(start, new Date('2026-10-12T10:00:20Z'))).toBe(1);
    expect(elapsedMinutes(start, new Date('2026-10-12T10:44:40Z'))).toBe(45);
    expect(addElapsed(null, start, new Date('2026-10-12T10:30:00Z'))).toBe(30);
    expect(addElapsed(15, start, new Date('2026-10-12T10:30:00Z'))).toBe(45);
  });
});
