import { rangesOverlap } from './shiftTime.js';

// Shifts module, Unidad 3 (spec-shifts.md §3) — the checks run every time someone is assigned to a
// shift, as pure functions over already-loaded data so they're testable without a database.
// shiftService.ts loads the data (one batch for every candidate) and calls evaluateCandidate.
//
// BLOCKS can't be overridden: the assignment would be wrong, not just inadvisable.
// WARNINGS are shown to the scheduler, who can confirm and assign anyway.

export type AssignmentBlock = 'no_user' | 'overlap' | 'already_assigned';
export type AssignmentWarning =
  | 'time_off'
  | 'holiday'
  | 'unavailable'
  | 'outside_availability'
  | 'rest'
  | 'missing_skill'
  | 'expired_skill';

export interface ShiftWindow {
  id: string;
  date: string; // local start day, YYYY-MM-DD
  endDate: string; // local end day (the next day for an overnight shift)
  startMinute: number;
  endMinute: number;
  startsAt: Date;
  endsAt: Date;
  requiredSkillIds: string[];
}

// Another shift this person already holds (any status but declined, any shift status but cancelled).
export interface HeldShift {
  shiftId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface AvailabilityRow {
  weekday: number | null;
  date: string | null;
  startMinute: number;
  endMinute: number;
  kind: 'available' | 'unavailable';
}

export interface CandidateContext {
  hasActiveUser: boolean;
  alreadyAssigned: boolean;
  heldShifts: HeldShift[];
  // Approved time off, as inclusive local-day ranges.
  timeOff: { startDate: string; endDate: string }[];
  // Days off that apply to this person (company-wide ones plus their own religious holidays).
  holidayDates: string[];
  availability: AvailabilityRow[];
  // skillId → expiry day (null = never expires). Only skills the person holds.
  skills: Map<string, string | null>;
}

export interface RuleSettings {
  minRestHours: number | null;
  // Skills are a Growth feature; on Starter a shift's requiredSkillIds are ignored entirely.
  skillsEnabled: boolean;
}

export interface CandidateEvaluation {
  blocks: AssignmentBlock[];
  warnings: AssignmentWarning[];
}

const MS_PER_HOUR = 3_600_000;

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

// The minute ranges a shift occupies on each local day it touches.
function dayRanges(shift: ShiftWindow): { date: string; start: number; end: number }[] {
  if (shift.endDate === shift.date) return [{ date: shift.date, start: shift.startMinute, end: shift.endMinute }];
  return [
    { date: shift.date, start: shift.startMinute, end: 24 * 60 },
    { date: shift.endDate, start: 0, end: shift.endMinute },
  ].filter((r) => r.end > r.start);
}

// A date's own one-off rows replace that weekday's recurring rows, so "I'm free this Saturday"
// overrides "I never work Saturdays".
function availabilityFor(date: string, rows: AvailabilityRow[]): AvailabilityRow[] {
  const oneOff = rows.filter((r) => r.date === date);
  if (oneOff.length > 0) return oneOff;
  const weekday = weekdayOf(date);
  return rows.filter((r) => r.date === null && r.weekday === weekday);
}

export function availabilityWarnings(shift: ShiftWindow, rows: AvailabilityRow[]): AssignmentWarning[] {
  const warnings = new Set<AssignmentWarning>();
  for (const range of dayRanges(shift)) {
    const day = availabilityFor(range.date, rows);
    if (day.some((r) => r.kind === 'unavailable' && r.startMinute < range.end && range.start < r.endMinute)) {
      warnings.add('unavailable');
    }
    const windows = day.filter((r) => r.kind === 'available');
    // Only someone who said when they ARE available can be "outside" it; no rows = no opinion.
    if (windows.length > 0 && !windows.some((r) => r.startMinute <= range.start && range.end <= r.endMinute)) {
      warnings.add('outside_availability');
    }
  }
  return [...warnings];
}

// Gap to the closest held shift before and after, against minRestHours. Overlaps are a block,
// handled separately.
export function restViolated(shift: ShiftWindow, held: HeldShift[], minRestHours: number | null): boolean {
  if (minRestHours === null) return false;
  const min = minRestHours * MS_PER_HOUR;
  return held.some((h) => {
    if (h.shiftId === shift.id || rangesOverlap(h.startsAt, h.endsAt, shift.startsAt, shift.endsAt)) return false;
    const gap = h.endsAt <= shift.startsAt ? shift.startsAt.getTime() - h.endsAt.getTime() : h.startsAt.getTime() - shift.endsAt.getTime();
    return gap < min;
  });
}

export function evaluateCandidate(shift: ShiftWindow, ctx: CandidateContext, settings: RuleSettings): CandidateEvaluation {
  const blocks: AssignmentBlock[] = [];
  const warnings: AssignmentWarning[] = [];

  if (ctx.alreadyAssigned) blocks.push('already_assigned');
  if (!ctx.hasActiveUser) blocks.push('no_user');
  if (ctx.heldShifts.some((h) => h.shiftId !== shift.id && rangesOverlap(h.startsAt, h.endsAt, shift.startsAt, shift.endsAt))) {
    blocks.push('overlap');
  }

  const days = shift.endDate === shift.date ? [shift.date] : [shift.date, shift.endDate];
  if (ctx.timeOff.some((t) => days.some((d) => t.startDate <= d && d <= t.endDate))) warnings.push('time_off');
  if (ctx.holidayDates.some((d) => days.includes(d))) warnings.push('holiday');
  warnings.push(...availabilityWarnings(shift, ctx.availability));
  if (restViolated(shift, ctx.heldShifts, settings.minRestHours)) warnings.push('rest');

  if (settings.skillsEnabled) {
    for (const skillId of shift.requiredSkillIds) {
      if (!ctx.skills.has(skillId)) {
        if (!warnings.includes('missing_skill')) warnings.push('missing_skill');
        continue;
      }
      const expires = ctx.skills.get(skillId);
      if (expires !== null && expires !== undefined && expires < shift.date && !warnings.includes('expired_skill')) {
        warnings.push('expired_skill');
      }
    }
  }

  return { blocks, warnings };
}
