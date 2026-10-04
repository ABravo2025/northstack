import { createHash, randomBytes } from 'node:crypto';
import type { Prisma, ShiftAssignmentStatus, ShiftStatus } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { recordActivity } from '../activity/activityLogService.js';
import { shiftActivityFieldConfig, shiftTemplateActivityFieldConfig } from '../activity/fieldConfigs/shiftFieldConfig.js';
import type { ShiftEvent } from './shiftEvents.js';
import { evaluateCandidate, type CandidateContext, type CandidateEvaluation, type ShiftWindow } from './shiftRules.js';
import type { EffectiveShiftsSettings } from './shiftsSettingsService.js';
import {
  addDays,
  endsNextDay,
  formatMinute,
  isValidDateString,
  isValidMinute,
  shiftInstants,
} from './shiftTime.js';

// Shifts module, Unidad 3 (spec-shifts.md) — shifts, assignments, publishing and answers.
// Access checks live in the route (shiftAccess.ts); every function here assumes the caller already
// confirmed tenant ownership and permission. Writes return ShiftEvents for the route to deliver.

const MAX_POSITION = 120;
const MAX_NOTES = 1000;
const MAX_HEADCOUNT = 100;
const MAX_DECLINE_REASON = 500;
export const MAX_RANGE_DAYS = 62;
// Rest checks look this far either side of a shift for the person's other shifts.
const REST_LOOKAROUND_MS = 72 * 3_600_000;

type Result<T> = { success: true; value: T } | { success: false; error: string; field?: string; code?: string };

const SHIFT_INCLUDE = {
  location: { select: { id: true, name: true, timezone: true, address: true } },
  assignments: {
    include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.ShiftInclude;

export type ShiftWithRelations = Prisma.ShiftGetPayload<{ include: typeof SHIFT_INCLUDE }>;

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

// The shape the API returns. responseTokenHash never leaves the server.
export function serializeShift(shift: ShiftWithRelations) {
  return {
    id: shift.id,
    locationId: shift.locationId,
    location: shift.location,
    date: toDateString(shift.date),
    startMinute: shift.startMinute,
    endMinute: shift.endMinute,
    endsNextDay: endsNextDay(shift.startMinute, shift.endMinute),
    startsAt: shift.startsAt,
    endsAt: shift.endsAt,
    position: shift.position,
    notes: shift.notes,
    headcount: shift.headcount,
    status: shift.status,
    publishedAt: shift.publishedAt,
    requiredSkillIds: shift.requiredSkillIds,
    assignments: shift.assignments.map((a) => ({
      id: a.id,
      employeeId: a.employeeId,
      employee: a.employee,
      status: a.status,
      respondedAt: a.respondedAt,
      declineReason: a.declineReason,
      notifiedAt: a.notifiedAt,
    })),
  };
}

export async function findShiftById(id: string): Promise<ShiftWithRelations | null> {
  return prisma.shift.findUnique({ where: { id }, include: SHIFT_INCLUDE });
}

function window(shift: { id: string; date: Date | string; startMinute: number; endMinute: number; startsAt: Date; endsAt: Date; requiredSkillIds: string[] }): ShiftWindow {
  const date = typeof shift.date === 'string' ? shift.date : toDateString(shift.date);
  return {
    id: shift.id,
    date,
    endDate: endsNextDay(shift.startMinute, shift.endMinute) ? addDays(date, 1) : date,
    startMinute: shift.startMinute,
    endMinute: shift.endMinute,
    startsAt: shift.startsAt,
    endsAt: shift.endsAt,
    requiredSkillIds: shift.requiredSkillIds,
  };
}

function shiftSnapshot(shift: ShiftWithRelations): Record<string, unknown> {
  return {
    locationId: shift.locationId,
    date: toDateString(shift.date),
    start: formatMinute(shift.startMinute),
    end: formatMinute(shift.endMinute),
    position: shift.position,
    notes: shift.notes,
    headcount: shift.headcount,
    status: shift.status,
    assignees: shift.assignments
      .map((a) => `${a.employee.firstName} ${a.employee.lastName}`)
      .sort()
      .join(', ') || null,
  };
}

function shiftLabel(shift: ShiftWithRelations): string {
  return `${shift.location.name} · ${toDateString(shift.date)} ${formatMinute(shift.startMinute)}–${formatMinute(shift.endMinute)}`;
}

async function logShift(action: 'create' | 'update' | 'delete', before: ShiftWithRelations | null, after: ShiftWithRelations | null, changedByUserId: string) {
  const ref = (after ?? before)!;
  await recordActivity({
    tenantId: ref.tenantId,
    entityType: 'shift',
    entityId: ref.id,
    entityLabel: shiftLabel(ref),
    action,
    changedByUserId,
    before: before ? shiftSnapshot(before) : null,
    after: after ? shiftSnapshot(after) : null,
    fieldConfig: shiftActivityFieldConfig,
  });
}

// ---------------------------------------------------------------------------------------------
// One-click answer tokens (emailed links). Only the sha256 is stored, rotated on every
// (re)notification so an email about an older version of the shift can't answer the new one.

export function newResponseToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashResponseToken(token) };
}

export function hashResponseToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------------------------------------
// Input parsing

export interface ShiftInput {
  locationId?: unknown;
  date?: unknown;
  startMinute?: unknown;
  endMinute?: unknown;
  position?: unknown;
  notes?: unknown;
  headcount?: unknown;
  requiredSkillIds?: unknown;
}

export interface ParsedShift {
  locationId?: string;
  date?: string;
  startMinute?: number;
  endMinute?: number;
  position?: string | null;
  notes?: string | null;
  headcount?: number;
  requiredSkillIds?: string[];
}

function optionalText(value: unknown, max: number, field: string): Result<string | null> {
  if (value === null) return { success: true, value: null };
  if (typeof value !== 'string') return { success: false, error: `Invalid ${field}`, field };
  const text = value.trim();
  if (text.length > max) return { success: false, error: `${field} must be ${max} characters or fewer`, field };
  return { success: true, value: text || null };
}

export function parseShiftInput(input: ShiftInput, mode: 'create' | 'update'): Result<ParsedShift> {
  const out: ParsedShift = {};
  const required = mode === 'create';
  if (input.locationId !== undefined || required) {
    if (typeof input.locationId !== 'string' || !input.locationId) return { success: false, error: 'Pick a location', field: 'locationId' };
    out.locationId = input.locationId;
  }
  if (input.date !== undefined || required) {
    if (!isValidDateString(input.date)) return { success: false, error: 'Pick a valid date', field: 'date' };
    out.date = input.date;
  }
  if (input.startMinute !== undefined || required) {
    if (!isValidMinute(input.startMinute)) return { success: false, error: 'Invalid start time', field: 'startMinute' };
    out.startMinute = input.startMinute;
  }
  if (input.endMinute !== undefined || required) {
    if (!isValidMinute(input.endMinute)) return { success: false, error: 'Invalid end time', field: 'endMinute' };
    out.endMinute = input.endMinute;
  }
  if (input.position !== undefined) {
    const r = optionalText(input.position, MAX_POSITION, 'position');
    if (!r.success) return r;
    out.position = r.value;
  }
  if (input.notes !== undefined) {
    const r = optionalText(input.notes, MAX_NOTES, 'notes');
    if (!r.success) return r;
    out.notes = r.value;
  }
  if (input.headcount !== undefined) {
    const h = input.headcount;
    if (typeof h !== 'number' || !Number.isInteger(h) || h < 1 || h > MAX_HEADCOUNT) {
      return { success: false, error: `People needed must be between 1 and ${MAX_HEADCOUNT}`, field: 'headcount' };
    }
    out.headcount = h;
  }
  if (input.requiredSkillIds !== undefined) {
    const ids = input.requiredSkillIds;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !id)) {
      return { success: false, error: 'Invalid skills', field: 'requiredSkillIds' };
    }
    out.requiredSkillIds = [...new Set(ids as string[])];
  }
  return { success: true, value: out };
}

export function parseDateRange(from: unknown, to: unknown): Result<{ from: string; to: string }> {
  if (!isValidDateString(from) || !isValidDateString(to)) return { success: false, error: 'from and to must be YYYY-MM-DD dates' };
  if (to < from) return { success: false, error: 'to must be on or after from' };
  if (addDays(from, MAX_RANGE_DAYS) < to) return { success: false, error: `The range can't be longer than ${MAX_RANGE_DAYS} days` };
  return { success: true, value: { from, to } };
}

async function skillsBelongToTenant(tenantId: string, ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const count = await prisma.skill.count({ where: { tenantId, id: { in: ids } } });
  return count === ids.length;
}

async function loadActiveLocation(tenantId: string, locationId: string) {
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location || location.tenantId !== tenantId) return null;
  return location;
}

// ---------------------------------------------------------------------------------------------
// Reading

export async function listShifts(
  tenantId: string,
  opts: { from: string; to: string; locationIds: string[] | null; includeDrafts: boolean; includeCancelled?: boolean },
): Promise<ShiftWithRelations[]> {
  const statuses: ShiftStatus[] = ['published'];
  if (opts.includeDrafts) statuses.push('draft');
  if (opts.includeCancelled) statuses.push('cancelled');
  return prisma.shift.findMany({
    where: {
      tenantId,
      date: { gte: toDbDate(opts.from), lte: toDbDate(opts.to) },
      status: { in: statuses },
      ...(opts.locationIds ? { locationId: { in: opts.locationIds } } : {}),
    },
    include: SHIFT_INCLUDE,
    orderBy: [{ startsAt: 'asc' }, { createdAt: 'asc' }],
  });
}

// "My shifts": published and cancelled shifts this person is (or was) on — cancelled ones stay
// visible so nobody shows up for a shift that was called off.
export async function listEmployeeShifts(tenantId: string, employeeId: string, from: string, to: string): Promise<ShiftWithRelations[]> {
  return prisma.shift.findMany({
    where: {
      tenantId,
      date: { gte: toDbDate(from), lte: toDbDate(to) },
      status: { in: ['published', 'cancelled'] },
      assignments: { some: { employeeId } },
    },
    include: SHIFT_INCLUDE,
    orderBy: { startsAt: 'asc' },
  });
}

// ---------------------------------------------------------------------------------------------
// Candidate evaluation (spec §3) — one batch of queries for any number of people.

export async function evaluateCandidates(
  shift: ShiftWithRelations,
  employeeIds: string[],
  settings: EffectiveShiftsSettings,
  skillsEnabled: boolean,
  // Evaluate as if the shift had these times (an edit in progress); defaults to the stored ones.
  override?: ShiftWindow,
): Promise<Map<string, CandidateEvaluation>> {
  const target = override ?? window(shift);
  const ids = [...new Set(employeeIds)];
  const result = new Map<string, CandidateEvaluation>();
  if (ids.length === 0) return result;

  const days = target.endDate === target.date ? [target.date] : [target.date, target.endDate];
  const needSkills = skillsEnabled && target.requiredSkillIds.length > 0;

  const [employees, held, timeOff, holidays, religions, availability, skills] = await Promise.all([
    prisma.employee.findMany({
      where: { tenantId: shift.tenantId, id: { in: ids } },
      select: { id: true, user: { select: { status: true } } },
    }),
    prisma.shiftAssignment.findMany({
      where: {
        employeeId: { in: ids },
        status: { not: 'declined' },
        shift: {
          status: { not: 'cancelled' },
          startsAt: { lt: new Date(target.endsAt.getTime() + REST_LOOKAROUND_MS) },
          endsAt: { gt: new Date(target.startsAt.getTime() - REST_LOOKAROUND_MS) },
        },
      },
      select: { employeeId: true, shiftId: true, shift: { select: { startsAt: true, endsAt: true } } },
    }),
    prisma.timeOffRequest.findMany({
      where: { tenantId: shift.tenantId, employeeId: { in: ids }, status: 'approved', startDate: { lte: toDbDate(days[days.length - 1]) }, endDate: { gte: toDbDate(days[0]) } },
      select: { employeeId: true, startDate: true, endDate: true },
    }),
    prisma.timeOffHoliday.findMany({
      where: { tenantId: shift.tenantId, isOff: true, date: { in: days.map(toDbDate) } },
      select: { date: true, kind: true, religion: true },
    }),
    prisma.employeeReligiousHoliday.findMany({ where: { employeeId: { in: ids } }, select: { employeeId: true, religion: true } }),
    prisma.employeeAvailability.findMany({
      where: { employeeId: { in: ids } },
      select: { employeeId: true, weekday: true, date: true, startMinute: true, endMinute: true, kind: true },
    }),
    needSkills
      ? prisma.employeeSkill.findMany({ where: { employeeId: { in: ids }, skillId: { in: target.requiredSkillIds } }, select: { employeeId: true, skillId: true, expiresAt: true } })
      : Promise.resolve([]),
  ]);

  const assignedHere = new Set(shift.assignments.map((a) => a.employeeId));
  const found = new Map(employees.map((e) => [e.id, e]));

  for (const id of ids) {
    const employee = found.get(id);
    const religionSet = new Set(religions.filter((r) => r.employeeId === id).map((r) => r.religion));
    const ctx: CandidateContext = {
      hasActiveUser: employee?.user?.status === 'active',
      alreadyAssigned: !override && assignedHere.has(id),
      heldShifts: held.filter((h) => h.employeeId === id && h.shiftId !== shift.id).map((h) => ({ shiftId: h.shiftId, startsAt: h.shift.startsAt, endsAt: h.shift.endsAt })),
      timeOff: timeOff.filter((t) => t.employeeId === id).map((t) => ({ startDate: toDateString(t.startDate), endDate: toDateString(t.endDate) })),
      holidayDates: holidays
        .filter((h) => h.kind !== 'religious' || (h.religion !== null && religionSet.has(h.religion)))
        .map((h) => toDateString(h.date)),
      availability: availability
        .filter((a) => a.employeeId === id)
        .map((a) => ({ weekday: a.weekday, date: a.date ? toDateString(a.date) : null, startMinute: a.startMinute, endMinute: a.endMinute, kind: a.kind })),
      skills: new Map(skills.filter((s) => s.employeeId === id).map((s) => [s.skillId, s.expiresAt ? toDateString(s.expiresAt) : null])),
    };
    result.set(id, employee ? evaluateCandidate(target, ctx, { minRestHours: settings.minRestHours, skillsEnabled }) : { blocks: ['no_user'], warnings: [] });
  }
  return result;
}

// Everyone who could be put on this shift (people with an active login — spec §0.2), each with
// their blocks/warnings, for the scheduler's picker.
export async function listCandidates(shift: ShiftWithRelations, settings: EffectiveShiftsSettings, skillsEnabled: boolean) {
  const employees = await prisma.employee.findMany({
    where: { tenantId: shift.tenantId, user: { status: 'active' } },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  const evaluations = await evaluateCandidates(shift, employees.map((e) => e.id), settings, skillsEnabled);
  return employees.map((e) => ({ ...e, ...evaluations.get(e.id)! }));
}

// ---------------------------------------------------------------------------------------------
// Writing shifts

export async function createShift(
  tenantId: string,
  input: ShiftInput,
  createdById: string,
  skillsEnabled: boolean,
): Promise<Result<ShiftWithRelations>> {
  const parsed = parseShiftInput(input, 'create');
  if (!parsed.success) return parsed;
  const p = parsed.value;
  const location = await loadActiveLocation(tenantId, p.locationId!);
  if (!location) return { success: false, error: 'Location not found', field: 'locationId' };
  if (!location.isActive) return { success: false, error: 'This location is inactive', field: 'locationId' };
  const requiredSkillIds = skillsEnabled ? (p.requiredSkillIds ?? []) : [];
  if (!(await skillsBelongToTenant(tenantId, requiredSkillIds))) return { success: false, error: 'Skill not found', field: 'requiredSkillIds' };

  const { startsAt, endsAt } = shiftInstants(p.date!, p.startMinute!, p.endMinute!, location.timezone);
  const shift = await prisma.shift.create({
    data: {
      tenantId,
      locationId: location.id,
      date: toDbDate(p.date!),
      startMinute: p.startMinute!,
      endMinute: p.endMinute!,
      startsAt,
      endsAt,
      position: p.position ?? null,
      notes: p.notes ?? null,
      headcount: p.headcount ?? 1,
      requiredSkillIds,
      createdById,
    },
    include: SHIFT_INCLUDE,
  });
  await logShift('create', null, shift, createdById);
  return { success: true, value: shift };
}

// Re-notifies whoever still holds the shift (everyone but people who declined).
function liveAssignments(shift: ShiftWithRelations) {
  return shift.assignments.filter((a) => a.status !== 'declined');
}

export async function updateShift(
  existing: ShiftWithRelations,
  input: ShiftInput,
  changedByUserId: string,
  settings: EffectiveShiftsSettings,
  skillsEnabled: boolean,
): Promise<Result<{ shift: ShiftWithRelations; events: ShiftEvent[] }>> {
  if (existing.status === 'cancelled') return { success: false, error: 'A cancelled shift can\'t be edited' };
  const parsed = parseShiftInput(input, 'update');
  if (!parsed.success) return parsed;
  const p = parsed.value;

  let location = existing.location;
  if (p.locationId && p.locationId !== existing.locationId) {
    const next = await loadActiveLocation(existing.tenantId, p.locationId);
    if (!next) return { success: false, error: 'Location not found', field: 'locationId' };
    if (!next.isActive) return { success: false, error: 'This location is inactive', field: 'locationId' };
    location = { id: next.id, name: next.name, timezone: next.timezone, address: next.address };
  }
  if (p.requiredSkillIds && !skillsEnabled) delete p.requiredSkillIds;
  if (p.requiredSkillIds && !(await skillsBelongToTenant(existing.tenantId, p.requiredSkillIds))) {
    return { success: false, error: 'Skill not found', field: 'requiredSkillIds' };
  }

  const date = p.date ?? toDateString(existing.date);
  const startMinute = p.startMinute ?? existing.startMinute;
  const endMinute = p.endMinute ?? existing.endMinute;
  const timingChanged =
    date !== toDateString(existing.date) || startMinute !== existing.startMinute || endMinute !== existing.endMinute || location.id !== existing.locationId;
  const { startsAt, endsAt } = shiftInstants(date, startMinute, endMinute, location.timezone);

  // A new time can't double-book anyone already on the shift.
  if (timingChanged && liveAssignments(existing).length > 0) {
    const next = window({ id: existing.id, date, startMinute, endMinute, startsAt, endsAt, requiredSkillIds: existing.requiredSkillIds });
    const evaluations = await evaluateCandidates(existing, liveAssignments(existing).map((a) => a.employeeId), settings, skillsEnabled, next);
    const clashing = liveAssignments(existing).filter((a) => evaluations.get(a.employeeId)?.blocks.includes('overlap'));
    if (clashing.length > 0) {
      return {
        success: false,
        code: 'overlap',
        error: `${clashing.map((a) => `${a.employee.firstName} ${a.employee.lastName}`).join(', ')} already ${clashing.length === 1 ? 'has' : 'have'} another shift at that time`,
      };
    }
  }

  const events: ShiftEvent[] = [];
  const now = new Date();
  const published = existing.status === 'published';

  const shift = await prisma.$transaction(async (tx) => {
    await tx.shift.update({
      where: { id: existing.id },
      data: {
        locationId: location.id,
        date: toDbDate(date),
        startMinute,
        endMinute,
        startsAt,
        endsAt,
        ...(p.position !== undefined ? { position: p.position } : {}),
        ...(p.notes !== undefined ? { notes: p.notes } : {}),
        ...(p.headcount !== undefined ? { headcount: p.headcount } : {}),
        ...(p.requiredSkillIds !== undefined ? { requiredSkillIds: p.requiredSkillIds } : {}),
      },
    });
    if (published) {
      for (const a of liveAssignments(existing)) {
        if (timingChanged) {
          const { token, hash } = newResponseToken();
          await tx.shiftAssignment.update({
            where: { id: a.id },
            data: {
              status: settings.requireConfirmation ? 'pending' : 'accepted',
              respondedAt: settings.requireConfirmation ? null : now,
              responseTokenHash: hash,
              notifiedAt: now,
              lastRemindedAt: null,
            },
          });
          events.push({ kind: 'reconfirm', tenantId: existing.tenantId, shiftId: existing.id, assignmentId: a.id, employeeId: a.employeeId, responseToken: token });
        } else {
          events.push({ kind: 'changed', tenantId: existing.tenantId, shiftId: existing.id, assignmentId: a.id, employeeId: a.employeeId });
        }
      }
    }
    return tx.shift.findUniqueOrThrow({ where: { id: existing.id }, include: SHIFT_INCLUDE });
  });

  await logShift('update', existing, shift, changedByUserId);
  // An edit that changed nothing people care about sends nothing.
  const meaningful = timingChanged || p.position !== undefined || p.notes !== undefined || p.headcount !== undefined;
  return { success: true, value: { shift, events: meaningful ? events : [] } };
}

// Drafts only — nobody was ever told about them. A published shift is cancelled instead.
export async function deleteDraftShift(existing: ShiftWithRelations, changedByUserId: string): Promise<Result<null>> {
  if (existing.status !== 'draft') return { success: false, error: 'Only draft shifts can be deleted. Cancel a published shift instead.' };
  await prisma.shift.delete({ where: { id: existing.id } });
  await logShift('delete', existing, null, changedByUserId);
  return { success: true, value: null };
}

export async function cancelShift(existing: ShiftWithRelations, changedByUserId: string): Promise<Result<{ shift: ShiftWithRelations; events: ShiftEvent[] }>> {
  if (existing.status !== 'published') return { success: false, error: 'Only published shifts can be cancelled' };
  const shift = await prisma.shift.update({ where: { id: existing.id }, data: { status: 'cancelled' }, include: SHIFT_INCLUDE });
  await logShift('update', existing, shift, changedByUserId);
  const events: ShiftEvent[] = liveAssignments(existing).map((a) => ({
    kind: 'cancelled',
    tenantId: existing.tenantId,
    shiftId: existing.id,
    assignmentId: a.id,
    employeeId: a.employeeId,
  }));
  return { success: true, value: { shift, events } };
}

// ---------------------------------------------------------------------------------------------
// Assignments

export type AssignResult =
  | { success: true; value: { shift: ShiftWithRelations; events: ShiftEvent[] } }
  | { success: false; error: string; code: 'blocked' | 'warnings' | 'invalid' | 'cancelled'; details?: Record<string, CandidateEvaluation> };

export async function assignEmployees(
  existing: ShiftWithRelations,
  employeeIds: unknown,
  force: boolean,
  changedByUserId: string,
  settings: EffectiveShiftsSettings,
  skillsEnabled: boolean,
): Promise<AssignResult> {
  if (existing.status === 'cancelled') return { success: false, code: 'cancelled', error: 'A cancelled shift can\'t take new people' };
  if (!Array.isArray(employeeIds) || employeeIds.length === 0 || employeeIds.some((id) => typeof id !== 'string' || !id)) {
    return { success: false, code: 'invalid', error: 'Pick at least one person' };
  }
  const ids = [...new Set(employeeIds as string[])];
  const evaluations = await evaluateCandidates(existing, ids, settings, skillsEnabled);
  const details = Object.fromEntries(evaluations);
  if (ids.some((id) => evaluations.get(id)!.blocks.length > 0)) {
    return { success: false, code: 'blocked', error: 'Some people can\'t take this shift', details };
  }
  if (!force && ids.some((id) => evaluations.get(id)!.warnings.length > 0)) {
    return { success: false, code: 'warnings', error: 'Check the warnings before assigning', details };
  }

  const published = existing.status === 'published';
  const now = new Date();
  const events: ShiftEvent[] = [];
  const shift = await prisma.$transaction(async (tx) => {
    for (const employeeId of ids) {
      const token = published ? newResponseToken() : null;
      const status: ShiftAssignmentStatus = published && !settings.requireConfirmation ? 'accepted' : 'pending';
      const created = await tx.shiftAssignment.create({
        data: {
          tenantId: existing.tenantId,
          shiftId: existing.id,
          employeeId,
          status,
          respondedAt: status === 'accepted' ? now : null,
          notifiedAt: published ? now : null,
          responseTokenHash: token?.hash ?? null,
        },
      });
      if (published) {
        events.push({ kind: 'assigned', tenantId: existing.tenantId, shiftId: existing.id, assignmentId: created.id, employeeId, responseToken: token!.token });
      }
    }
    return tx.shift.findUniqueOrThrow({ where: { id: existing.id }, include: SHIFT_INCLUDE });
  });
  await logShift('update', existing, shift, changedByUserId);
  return { success: true, value: { shift, events } };
}

export async function unassignEmployee(
  existing: ShiftWithRelations,
  assignmentId: string,
  changedByUserId: string,
): Promise<Result<{ shift: ShiftWithRelations; events: ShiftEvent[] }>> {
  const assignment = existing.assignments.find((a) => a.id === assignmentId);
  if (!assignment) return { success: false, error: 'Assignment not found', code: 'not_found' };
  if (existing.status === 'cancelled') return { success: false, error: 'A cancelled shift can\'t be changed' };
  await prisma.shiftAssignment.delete({ where: { id: assignment.id } });
  const shift = (await findShiftById(existing.id))!;
  await logShift('update', existing, shift, changedByUserId);
  const events: ShiftEvent[] =
    existing.status === 'published' && assignment.status !== 'declined'
      ? [{ kind: 'unassigned', tenantId: existing.tenantId, shiftId: existing.id, assignmentId: null, employeeId: assignment.employeeId }]
      : [];
  return { success: true, value: { shift, events } };
}

// ---------------------------------------------------------------------------------------------
// Publishing — turns drafts into real shifts and tells everyone on them.

export async function publishShifts(
  drafts: ShiftWithRelations[],
  changedByUserId: string,
  settings: EffectiveShiftsSettings,
): Promise<{ published: ShiftWithRelations[]; events: ShiftEvent[] }> {
  const now = new Date();
  const events: ShiftEvent[] = [];
  const published: ShiftWithRelations[] = [];
  for (const draft of drafts) {
    if (draft.status !== 'draft') continue;
    const shift = await prisma.$transaction(async (tx) => {
      await tx.shift.update({ where: { id: draft.id }, data: { status: 'published', publishedAt: now } });
      for (const a of draft.assignments) {
        const { token, hash } = newResponseToken();
        await tx.shiftAssignment.update({
          where: { id: a.id },
          data: {
            status: settings.requireConfirmation ? 'pending' : 'accepted',
            respondedAt: settings.requireConfirmation ? null : now,
            notifiedAt: now,
            responseTokenHash: hash,
          },
        });
        events.push({ kind: 'assigned', tenantId: draft.tenantId, shiftId: draft.id, assignmentId: a.id, employeeId: a.employeeId, responseToken: token });
      }
      return tx.shift.findUniqueOrThrow({ where: { id: draft.id }, include: SHIFT_INCLUDE });
    });
    await logShift('update', draft, shift, changedByUserId);
    published.push(shift);
  }
  return { published, events };
}

export async function findDraftsForPublish(tenantId: string, shiftIds: string[]): Promise<ShiftWithRelations[]> {
  return prisma.shift.findMany({ where: { tenantId, id: { in: shiftIds }, status: 'draft' }, include: SHIFT_INCLUDE });
}

// ---------------------------------------------------------------------------------------------
// Answering — from the app or the emailed one-click link.

export type ShiftResponse = 'accepted' | 'declined';

export function isShiftResponse(value: unknown): value is ShiftResponse {
  return value === 'accepted' || value === 'declined';
}

export async function respondToAssignment(
  assignmentId: string,
  response: ShiftResponse,
  reason: unknown,
  now: Date = new Date(),
): Promise<Result<{ shift: ShiftWithRelations; events: ShiftEvent[] }>> {
  const assignment = await prisma.shiftAssignment.findUnique({ where: { id: assignmentId }, include: { shift: { include: SHIFT_INCLUDE } } });
  if (!assignment) return { success: false, error: 'Shift not found', code: 'not_found' };
  const shift = assignment.shift;
  if (shift.status === 'cancelled') return { success: false, error: 'This shift was cancelled', code: 'cancelled' };
  if (shift.status !== 'published') return { success: false, error: 'This shift isn\'t published yet', code: 'not_published' };
  if (shift.startsAt <= now) return { success: false, error: 'This shift has already started', code: 'started' };
  if (assignment.status === response) return { success: true, value: { shift, events: [] } };

  let declineReason: string | null = null;
  if (response === 'declined' && reason !== undefined && reason !== null) {
    if (typeof reason !== 'string') return { success: false, error: 'Invalid reason', field: 'reason' };
    declineReason = reason.trim().slice(0, MAX_DECLINE_REASON) || null;
  }
  await prisma.shiftAssignment.update({
    where: { id: assignment.id },
    data: { status: response, respondedAt: now, declineReason },
  });
  const updated = (await findShiftById(shift.id))!;
  // Attributed to the assignee's own login. The emailed link always belongs to someone with one
  // (spec §0.2); if the login was removed since, the answer still counts but isn't logged.
  const assignee = await prisma.employee.findUnique({ where: { id: assignment.employeeId }, select: { userId: true, firstName: true, lastName: true } });
  if (assignee?.userId) {
    await recordActivity({
      tenantId: shift.tenantId,
      entityType: 'shift',
      entityId: shift.id,
      entityLabel: shiftLabel(shift),
      action: 'update',
      changedByUserId: assignee.userId,
      before: { answer: assignment.status },
      after: { answer: response },
      fieldConfig: { answer: { label: `${assignee.firstName} ${assignee.lastName}'s answer` } },
    });
  }
  const events: ShiftEvent[] =
    response === 'declined'
      ? [{ kind: 'declined', tenantId: shift.tenantId, shiftId: shift.id, assignmentId: assignment.id, employeeId: assignment.employeeId }]
      : [];
  return { success: true, value: { shift: updated, events } };
}

export async function findAssignmentByToken(token: unknown) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  return prisma.shiftAssignment.findUnique({
    where: { responseTokenHash: hashResponseToken(token) },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      shift: { include: { location: { select: { name: true, address: true, timezone: true } }, tenant: { select: { name: true } } } },
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Copy a week — every non-cancelled shift (at the given locations) from one week into another as
// drafts, people included. Assignments that would double-book someone, or whose person no longer
// has an active login, are left off and counted.

export async function copyWeek(
  tenantId: string,
  fromWeekStart: string,
  toWeekStart: string,
  locationIds: string[] | null,
  createdById: string,
): Promise<Result<{ created: number; skippedAssignments: number }>> {
  if (!isValidDateString(fromWeekStart) || !isValidDateString(toWeekStart)) return { success: false, error: 'Weeks must be YYYY-MM-DD dates' };
  if (fromWeekStart === toWeekStart) return { success: false, error: 'Pick a different week to copy into' };
  const deltaDays = Math.round((toDbDate(toWeekStart).getTime() - toDbDate(fromWeekStart).getTime()) / 86_400_000);

  const source = await prisma.shift.findMany({
    where: {
      tenantId,
      status: { not: 'cancelled' },
      date: { gte: toDbDate(fromWeekStart), lte: toDbDate(addDays(fromWeekStart, 6)) },
      location: { isActive: true },
      ...(locationIds ? { locationId: { in: locationIds } } : {}),
    },
    include: { location: true, assignments: { where: { status: { not: 'declined' } }, include: { employee: { select: { user: { select: { status: true } } } } } } },
  });

  let created = 0;
  let skippedAssignments = 0;
  for (const s of source) {
    const date = addDays(toDateString(s.date), deltaDays);
    const { startsAt, endsAt } = shiftInstants(date, s.startMinute, s.endMinute, s.location.timezone);
    const keep: string[] = [];
    for (const a of s.assignments) {
      if (a.employee.user?.status !== 'active') {
        skippedAssignments++;
        continue;
      }
      const clash = await prisma.shiftAssignment.findFirst({
        where: { employeeId: a.employeeId, status: { not: 'declined' }, shift: { status: { not: 'cancelled' }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } },
        select: { id: true },
      });
      if (clash) skippedAssignments++;
      else keep.push(a.employeeId);
    }
    const shift = await prisma.shift.create({
      data: {
        tenantId,
        locationId: s.locationId,
        date: toDbDate(date),
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        startsAt,
        endsAt,
        position: s.position,
        notes: s.notes,
        headcount: s.headcount,
        requiredSkillIds: s.requiredSkillIds,
        createdById,
        assignments: { create: keep.map((employeeId) => ({ tenantId, employeeId })) },
      },
      include: SHIFT_INCLUDE,
    });
    await logShift('create', null, shift, createdById);
    created++;
  }
  return { success: true, value: { created, skippedAssignments } };
}

// ---------------------------------------------------------------------------------------------
// Templates ("Morning 07:00–15:00") — pre-filled times for new shifts.

export async function listTemplates(tenantId: string) {
  return prisma.shiftTemplate.findMany({ where: { tenantId }, orderBy: [{ startMinute: 'asc' }, { name: 'asc' }] });
}

export async function createTemplate(
  tenantId: string,
  input: { name?: unknown; startMinute?: unknown; endMinute?: unknown; locationId?: unknown; position?: unknown },
  createdById: string,
): Promise<Result<Awaited<ReturnType<typeof prisma.shiftTemplate.create>>>> {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 80) return { success: false, error: 'Name is required (80 characters max)', field: 'name' };
  if (!isValidMinute(input.startMinute)) return { success: false, error: 'Invalid start time', field: 'startMinute' };
  if (!isValidMinute(input.endMinute)) return { success: false, error: 'Invalid end time', field: 'endMinute' };
  let locationId: string | null = null;
  if (input.locationId !== undefined && input.locationId !== null) {
    if (typeof input.locationId !== 'string' || !(await loadActiveLocation(tenantId, input.locationId))) {
      return { success: false, error: 'Location not found', field: 'locationId' };
    }
    locationId = input.locationId;
  }
  const position = input.position === undefined ? { success: true as const, value: null } : optionalText(input.position, MAX_POSITION, 'position');
  if (!position.success) return position;
  const template = await prisma.shiftTemplate.create({
    data: { tenantId, name, startMinute: input.startMinute, endMinute: input.endMinute, locationId, position: position.value },
  });
  await recordActivity({
    tenantId,
    entityType: 'shiftTemplate',
    entityId: template.id,
    entityLabel: template.name,
    action: 'create',
    changedByUserId: createdById,
    before: null,
    after: { name, start: formatMinute(template.startMinute), end: formatMinute(template.endMinute), locationId, position: position.value },
    fieldConfig: shiftTemplateActivityFieldConfig,
  });
  return { success: true, value: template };
}

export async function deleteTemplate(tenantId: string, templateId: string, changedByUserId: string): Promise<boolean> {
  const template = await prisma.shiftTemplate.findUnique({ where: { id: templateId } });
  if (!template || template.tenantId !== tenantId) return false;
  await prisma.shiftTemplate.delete({ where: { id: template.id } });
  await recordActivity({
    tenantId,
    entityType: 'shiftTemplate',
    entityId: template.id,
    entityLabel: template.name,
    action: 'delete',
    changedByUserId,
    before: { name: template.name, start: formatMinute(template.startMinute), end: formatMinute(template.endMinute), locationId: template.locationId, position: template.position },
    after: null,
    fieldConfig: shiftTemplateActivityFieldConfig,
  });
  return true;
}
