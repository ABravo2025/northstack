import prisma from '../../lib/prisma.js';
import { SHIFT_INCLUDE, assignEmployees, evaluateCandidates, toDateString } from './shiftService.js';
import { restViolated, type AssignmentWarning, type CandidateEvaluation, type HeldShift } from './shiftRules.js';
import { addDays, isValidDateString, rangesOverlap } from './shiftTime.js';
import type { EffectiveShiftsSettings } from './shiftsSettingsService.js';

// Shifts phase 2, block E (spec-shifts-fase2.md §E, Growth): "Suggest week". For the week's DRAFT
// shifts with free places, proposes who to put on each — never anyone blocked, never anyone with a
// warning that matters (time off, holiday, unavailable, rest, skills); only "outside the hours they
// gave" is tolerated, and it's last resort. Hours are spread evenly. Nothing is written until the
// scheduler reviews and applies, and even then the shifts stay drafts: publishing is still theirs.
// Published shifts with free places are left to the open-shift marketplace (block A): assigning
// there would notify people straight away.

const MS_PER_MINUTE = 60_000;
const MAX_SHIFTS = 300;

// The only warning a suggestion may carry; anything else rules the person out.
const SOFT_WARNINGS: AssignmentWarning[] = ['outside_availability'];

export interface SuggestShift {
  id: string;
  startsAt: Date;
  endsAt: Date;
  openPlaces: number;
}

export interface Suggestion {
  shiftId: string;
  employeeId: string;
  warnings: AssignmentWarning[];
}

const minutesOf = (s: { startsAt: Date; endsAt: Date }) => Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / MS_PER_MINUTE);

const eligible = (e: CandidateEvaluation | undefined) => !!e && e.blocks.length === 0 && e.warnings.every((w) => SOFT_WARNINGS.includes(w));

// Pure (tested). Greedy: the shifts with the fewest eligible people go first (so the scarce ones
// aren't left without anybody), then by start time; each free place goes to the eligible person
// with the fewest warnings and then the fewest hours this week, counting what was already suggested.
// Suggestions made in this run count as held shifts for the overlap and rest checks.
export function pickSuggestions(
  shifts: SuggestShift[],
  evaluations: Map<string, Map<string, CandidateEvaluation>>,
  weekMinutes: Map<string, number>,
  minRestHours: number | null,
): { suggestions: Suggestion[]; unfilled: { shiftId: string; places: number }[] } {
  const minutes = new Map(weekMinutes);
  const picked = new Map<string, HeldShift[]>();
  const suggestions: Suggestion[] = [];
  const unfilled: { shiftId: string; places: number }[] = [];

  const eligibleCount = (s: SuggestShift) => [...(evaluations.get(s.id)?.values() ?? [])].filter(eligible).length;
  const order = [...shifts].sort((a, b) => eligibleCount(a) - eligibleCount(b) || a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id));

  for (const shift of order) {
    const evals = evaluations.get(shift.id) ?? new Map<string, CandidateEvaluation>();
    const window = { id: shift.id, date: '', endDate: '', startMinute: 0, endMinute: 0, startsAt: shift.startsAt, endsAt: shift.endsAt, requiredSkillIds: [] };
    const here = new Set<string>();
    let left = shift.openPlaces;
    while (left > 0) {
      let best: { id: string; score: number } | null = null;
      for (const [employeeId, evaluation] of evals) {
        if (here.has(employeeId) || !eligible(evaluation)) continue;
        const held = picked.get(employeeId) ?? [];
        if (held.some((h) => rangesOverlap(h.startsAt, h.endsAt, shift.startsAt, shift.endsAt))) continue;
        if (restViolated(window, held, minRestHours)) continue;
        const score = evaluation.warnings.length * 1_000_000 + (minutes.get(employeeId) ?? 0);
        if (!best || score < best.score || (score === best.score && employeeId < best.id)) best = { id: employeeId, score };
      }
      if (!best) break;
      here.add(best.id);
      picked.set(best.id, [...(picked.get(best.id) ?? []), { shiftId: shift.id, startsAt: shift.startsAt, endsAt: shift.endsAt }]);
      minutes.set(best.id, (minutes.get(best.id) ?? 0) + minutesOf(shift));
      suggestions.push({ shiftId: shift.id, employeeId: best.id, warnings: evals.get(best.id)!.warnings });
      left--;
    }
    if (left > 0) unfilled.push({ shiftId: shift.id, places: left });
  }
  return { suggestions, unfilled };
}

export async function suggestWeek(
  tenantId: string,
  weekStart: unknown,
  locationIds: string[] | null,
  settings: EffectiveShiftsSettings,
  skillsEnabled: boolean,
) {
  if (!isValidDateString(weekStart)) return { success: false as const, error: 'Pick a week' };
  const from = new Date(`${weekStart}T00:00:00Z`);
  const to = new Date(`${addDays(weekStart, 6)}T00:00:00Z`);
  const now = new Date();

  const drafts = await prisma.shift.findMany({
    where: { tenantId, status: 'draft', date: { gte: from, lte: to }, startsAt: { gt: now }, ...(locationIds ? { locationId: { in: locationIds } } : {}) },
    include: SHIFT_INCLUDE,
    orderBy: { startsAt: 'asc' },
    take: MAX_SHIFTS,
  });
  const open = drafts
    .map((s) => ({ shift: s, openPlaces: s.headcount - s.assignments.filter((a) => a.status !== 'declined').length }))
    .filter((x) => x.openPlaces > 0);
  if (open.length === 0) return { success: true as const, value: { suggestions: [], unfilled: [], shifts: 0 } };

  const employees = await prisma.employee.findMany({
    where: { tenantId, user: { status: 'active' } },
    select: { id: true, firstName: true, lastName: true },
  });
  const ids = employees.map((e) => e.id);

  // Hours each person already holds this week (any shift but cancelled, any answer but declined).
  const held = await prisma.shiftAssignment.findMany({
    where: { employeeId: { in: ids }, status: { not: 'declined' }, shift: { tenantId, status: { not: 'cancelled' }, date: { gte: from, lte: to } } },
    select: { employeeId: true, shift: { select: { startsAt: true, endsAt: true } } },
  });
  const weekMinutes = new Map<string, number>();
  for (const h of held) weekMinutes.set(h.employeeId, (weekMinutes.get(h.employeeId) ?? 0) + minutesOf(h.shift));

  const evaluations = new Map<string, Map<string, CandidateEvaluation>>();
  for (const { shift } of open) evaluations.set(shift.id, await evaluateCandidates(shift, ids, settings, skillsEnabled));

  const picked = pickSuggestions(
    open.map((x) => ({ id: x.shift.id, startsAt: x.shift.startsAt, endsAt: x.shift.endsAt, openPlaces: x.openPlaces })),
    evaluations,
    weekMinutes,
    settings.minRestHours,
  );

  const names = new Map(employees.map((e) => [e.id, `${e.firstName} ${e.lastName}`]));
  const byId = new Map(open.map((x) => [x.shift.id, x.shift]));
  const describe = (id: string) => {
    const s = byId.get(id)!;
    return { id, date: toDateString(s.date), startMinute: s.startMinute, endMinute: s.endMinute, position: s.position, location: { id: s.location.id, name: s.location.name } };
  };
  const chrono = (a: { shiftId: string }, b: { shiftId: string }) => byId.get(a.shiftId)!.startsAt.getTime() - byId.get(b.shiftId)!.startsAt.getTime();
  return {
    success: true as const,
    value: {
      shifts: open.length,
      suggestions: picked.suggestions.sort(chrono).map((s) => ({ shift: describe(s.shiftId), employee: { id: s.employeeId, name: names.get(s.employeeId) ?? '' }, warnings: s.warnings })),
      unfilled: picked.unfilled.sort(chrono).map((u) => ({ shift: describe(u.shiftId), places: u.places })),
    },
  };
}

// Applies the reviewed suggestions: draft shifts only, re-checked (blocks refuse; the warnings
// were already seen). Shifts stay drafts — nobody is told until the scheduler publishes.
export async function applySuggestions(
  tenantId: string,
  items: unknown,
  allowedLocation: (locationId: string) => Promise<boolean>,
  changedByUserId: string,
  settings: EffectiveShiftsSettings,
  skillsEnabled: boolean,
) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 1000 || items.some((i) => typeof i?.shiftId !== 'string' || typeof i?.employeeId !== 'string')) {
    return { success: false as const, error: 'Nothing to apply' };
  }
  const byShift = new Map<string, string[]>();
  for (const i of items as { shiftId: string; employeeId: string }[]) byShift.set(i.shiftId, [...new Set([...(byShift.get(i.shiftId) ?? []), i.employeeId])]);

  let applied = 0;
  let skipped = 0;
  for (const [shiftId, employeeIds] of byShift) {
    const shift = await prisma.shift.findFirst({ where: { id: shiftId, tenantId }, include: SHIFT_INCLUDE });
    if (!shift || shift.status !== 'draft' || !(await allowedLocation(shift.locationId))) {
      skipped += employeeIds.length;
      continue;
    }
    // Places may have been filled by hand since the suggestion was made: never go over headcount.
    const room = shift.headcount - shift.assignments.filter((a) => a.status !== 'declined').length;
    const take = employeeIds.slice(0, Math.max(0, room));
    skipped += employeeIds.length - take.length;
    // One at a time, so someone who got blocked meanwhile doesn't take the others down with them.
    let current = shift;
    for (const employeeId of take) {
      const result = await assignEmployees(current, [employeeId], true, changedByUserId, settings, skillsEnabled);
      if (result.success) {
        applied++;
        current = result.value.shift;
      } else {
        skipped++;
      }
    }
  }
  return { success: true as const, value: { applied, skipped } };
}
