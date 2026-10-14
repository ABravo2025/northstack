import { describe, expect, it } from 'vitest';
import { pickSuggestions, type SuggestShift } from '../src/modules/shifts/suggestService.js';
import type { CandidateEvaluation } from '../src/modules/shifts/shiftRules.js';

const at = (day: number, hour: number) => new Date(Date.UTC(2026, 9, day, hour));
const shift = (id: string, day: number, from: number, to: number, openPlaces = 1): SuggestShift => ({ id, startsAt: at(day, from), endsAt: at(day, to), openPlaces });
const ok: CandidateEvaluation = { blocks: [], warnings: [] };
const evals = (shifts: SuggestShift[], people: Record<string, CandidateEvaluation>, per: Record<string, Record<string, CandidateEvaluation>> = {}) =>
  new Map(shifts.map((s) => [s.id, new Map(Object.entries({ ...people, ...(per[s.id] ?? {}) }))]));

describe('suggested schedule (phase 2, block E)', () => {
  it('spreads hours evenly', () => {
    const shifts = [shift('a', 19, 8, 16), shift('b', 20, 8, 16), shift('c', 21, 8, 16), shift('d', 22, 8, 16)];
    const r = pickSuggestions(shifts, evals(shifts, { ana: ok, bo: ok }), new Map(), null);
    const count = (id: string) => r.suggestions.filter((s) => s.employeeId === id).length;
    expect(r.suggestions).toHaveLength(4);
    expect(count('ana')).toBe(2);
    expect(count('bo')).toBe(2);
  });

  it('counts the hours people already hold this week', () => {
    const shifts = [shift('a', 19, 8, 16)];
    const r = pickSuggestions(shifts, evals(shifts, { ana: ok, bo: ok }), new Map([['ana', 2400]]), null);
    expect(r.suggestions[0].employeeId).toBe('bo');
  });

  it('never suggests blocked people or hard warnings', () => {
    const shifts = [shift('a', 19, 8, 16)];
    const r = pickSuggestions(
      shifts,
      evals(shifts, { ana: { blocks: ['overlap'], warnings: [] }, bo: { blocks: [], warnings: ['time_off'] }, cy: { blocks: [], warnings: ['missing_skill'] } }),
      new Map(),
      null,
    );
    expect(r.suggestions).toHaveLength(0);
    expect(r.unfilled).toEqual([{ shiftId: 'a', places: 1 }]);
  });

  it('outside availability only as a last resort', () => {
    const shifts = [shift('a', 19, 8, 16)];
    const soft: CandidateEvaluation = { blocks: [], warnings: ['outside_availability'] };
    expect(pickSuggestions(shifts, evals(shifts, { ana: soft, bo: ok }), new Map([['bo', 3000]]), null).suggestions[0].employeeId).toBe('bo');
    const only = pickSuggestions(shifts, evals(shifts, { ana: soft }), new Map(), null).suggestions[0];
    expect(only).toEqual({ shiftId: 'a', employeeId: 'ana', warnings: ['outside_availability'] });
  });

  it('does not double-book within the run, and respects minimum rest', () => {
    const shifts = [shift('a', 19, 8, 16), shift('b', 19, 12, 20), shift('night', 19, 22, 23)];
    const r = pickSuggestions(shifts, evals(shifts, { ana: ok }), new Map(), 8);
    // Only one of the overlapping a/b; and 'night' is too close to whichever she got.
    expect(r.suggestions).toHaveLength(1);
    expect(r.unfilled.map((u) => u.shiftId).sort()).toHaveLength(2);
  });

  it('fills several places with different people', () => {
    const shifts = [shift('a', 19, 8, 16, 3)];
    const r = pickSuggestions(shifts, evals(shifts, { ana: ok, bo: ok }), new Map(), null);
    expect(new Set(r.suggestions.map((s) => s.employeeId))).toEqual(new Set(['ana', 'bo']));
    expect(r.unfilled).toEqual([{ shiftId: 'a', places: 1 }]);
  });

  it('serves the scarce shift first', () => {
    // 'early' could take ana or bo; 'late' (same time) only ana. Order by start alone would give 'early' to ana.
    const shifts = [shift('early', 19, 8, 16), shift('late', 19, 9, 17)];
    const r = pickSuggestions(shifts, evals(shifts, { ana: ok, bo: ok }, { late: { bo: { blocks: [], warnings: ['unavailable'] } } }), new Map(), null);
    expect(r.suggestions.find((s) => s.shiftId === 'late')?.employeeId).toBe('ana');
    expect(r.suggestions.find((s) => s.shiftId === 'early')?.employeeId).toBe('bo');
  });
});
