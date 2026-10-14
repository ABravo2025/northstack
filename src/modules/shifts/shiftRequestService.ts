import type { Prisma, ShiftChangeRequest, ShiftChangeStatus } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { recordActivity } from '../activity/activityLogService.js';
import type { ShiftEvent } from './shiftEvents.js';
import type { CandidateEvaluation } from './shiftRules.js';
import type { EffectiveShiftsSettings } from './shiftsSettingsService.js';
import { evaluateCandidates, findShiftById, logShift, newResponseToken, type ShiftWithRelations } from './shiftService.js';

// Shifts phase 2, block A (spec-shifts-fase2.md): people fix gaps among themselves.
//   claim — take a free place on a shift a manager opened (openToClaim)
//   give  — hand your shift to whoever covers it (it shows up as available to everyone else)
//   swap  — trade your shift for a colleague's (the colleague accepts first)
// Nothing moves until the request is approved. A manager approves when the settings say so
// (swapNeedsApproval for give/swap, openShiftNeedsApproval for claim) and ALWAYS when the person
// coming in has a warning (rest, availability, time off, skills…). Blocks (overlap, no login,
// shift already started) refuse outright. A request dies when its shift starts.

type Result<T> = { success: true; value: T } | { success: false; error: string; code?: string; details?: unknown };

export const ACTIVE_STATUSES: ShiftChangeStatus[] = ['open', 'pending_peer', 'pending_manager'];
const MAX_REASON = 300;

const REQUEST_INCLUDE = {
  shift: { include: { location: { select: { id: true, name: true, timezone: true } } } },
  targetShift: { include: { location: { select: { id: true, name: true, timezone: true } } } },
  requestedBy: { select: { id: true, firstName: true, lastName: true, userId: true } },
  targetEmployee: { select: { id: true, firstName: true, lastName: true, userId: true } },
} satisfies Prisma.ShiftChangeRequestInclude;

export type LoadedRequest = Prisma.ShiftChangeRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;

export function findRequest(tenantId: string, id: string) {
  return prisma.shiftChangeRequest.findFirst({ where: { id, tenantId }, include: REQUEST_INCLUDE });
}

const toDate = (d: Date) => d.toISOString().slice(0, 10);

function shiftView(s: LoadedRequest['shift']) {
  return {
    id: s.id,
    date: toDate(s.date),
    startMinute: s.startMinute,
    endMinute: s.endMinute,
    startsAt: s.startsAt.toISOString(),
    position: s.position,
    location: { id: s.location.id, name: s.location.name },
  };
}

export function serializeRequest(r: LoadedRequest) {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    shift: shiftView(r.shift),
    targetShift: r.targetShift ? shiftView(r.targetShift) : null,
    requestedBy: { id: r.requestedBy.id, firstName: r.requestedBy.firstName, lastName: r.requestedBy.lastName },
    targetEmployee: r.targetEmployee ? { id: r.targetEmployee.id, firstName: r.targetEmployee.firstName, lastName: r.targetEmployee.lastName } : null,
    reason: r.reason,
    warnings: (r.warnings as string[] | null) ?? [],
    decisionNote: r.decisionNote,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------------------------
// Pure rules (tested)

export function parseReason(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, MAX_REASON) : null;
}

// Who decides after the peer/taker is known: the manager when the settings ask, or when the
// incoming person has warnings; otherwise it goes straight through.
export function needsManager(type: 'claim' | 'give' | 'swap', settings: Pick<EffectiveShiftsSettings, 'swapNeedsApproval' | 'openShiftNeedsApproval'>, warnings: string[]): boolean {
  if (warnings.length > 0) return true;
  return type === 'claim' ? settings.openShiftNeedsApproval : settings.swapNeedsApproval;
}

export function filledPlaces(assignments: { status: string }[]): number {
  return assignments.filter((a) => a.status !== 'declined').length;
}

export function hasStarted(shift: { startsAt: Date }, now: Date): boolean {
  return shift.startsAt.getTime() <= now.getTime();
}

// ---------------------------------------------------------------------------------------------

async function logRequest(r: Pick<ShiftChangeRequest, 'id' | 'tenantId' | 'type'>, label: string, actorUserId: string, before: Record<string, unknown> | null, after: Record<string, unknown>) {
  await recordActivity({
    tenantId: r.tenantId,
    entityType: 'shiftRequest',
    entityId: r.id,
    entityLabel: `${r.type} · ${label}`,
    action: before ? 'update' : 'create',
    changedByUserId: actorUserId,
    before,
    after,
    fieldConfig: { status: { label: 'Status' }, decisionNote: { label: 'Note' } },
  });
}

const name = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;

// Re-evaluates the incoming people right before a request moves (state may have changed since it
// was asked), leaving out the shift each one is giving up.
async function evaluateIncoming(
  request: Pick<ShiftChangeRequest, 'type' | 'shiftId' | 'requestedByEmployeeId' | 'targetEmployeeId' | 'targetShiftId'>,
  settings: EffectiveShiftsSettings,
  skillsEnabled: boolean,
): Promise<{ blocks: string[]; warnings: string[]; shift: ShiftWithRelations; targetShift: ShiftWithRelations | null } | null> {
  const shift = await findShiftById(request.shiftId);
  if (!shift) return null;
  const targetShift = request.targetShiftId ? await findShiftById(request.targetShiftId) : null;
  const checks: { evaluation: CandidateEvaluation | undefined }[] = [];
  if (request.type === 'claim') {
    const ev = await evaluateCandidates(shift, [request.requestedByEmployeeId], settings, skillsEnabled);
    checks.push({ evaluation: ev.get(request.requestedByEmployeeId) });
  } else if (request.type === 'give' && request.targetEmployeeId) {
    const ev = await evaluateCandidates(shift, [request.targetEmployeeId], settings, skillsEnabled);
    checks.push({ evaluation: ev.get(request.targetEmployeeId) });
  } else if (request.type === 'swap' && request.targetEmployeeId && targetShift) {
    const a = await evaluateCandidates(targetShift, [request.requestedByEmployeeId], settings, skillsEnabled, undefined, { [request.requestedByEmployeeId]: [shift.id] });
    const b = await evaluateCandidates(shift, [request.targetEmployeeId], settings, skillsEnabled, undefined, { [request.targetEmployeeId]: [targetShift.id] });
    checks.push({ evaluation: a.get(request.requestedByEmployeeId) }, { evaluation: b.get(request.targetEmployeeId) });
  }
  const blocks = [...new Set(checks.flatMap((c) => c.evaluation?.blocks ?? ['no_user']))];
  const warnings = [...new Set(checks.flatMap((c) => c.evaluation?.warnings ?? []))];
  return { blocks, warnings, shift, targetShift };
}

// Applies an approved request: replaces the places and returns the calendar/notice events.
// The person leaving gets a quiet event (calendar only); the person coming in gets the usual
// "new shift" notice with the .ics, already accepted (they asked for it).
async function execute(request: LoadedRequest, shift: ShiftWithRelations, targetShift: ShiftWithRelations | null, actorUserId: string): Promise<Result<ShiftEvent[]>> {
  const now = new Date();
  const events: ShiftEvent[] = [];
  const moves: { leaveAssignmentId: string | null; leaveEmployeeId: string | null; shift: ShiftWithRelations; incomingEmployeeId: string }[] = [];
  if (request.type === 'claim') {
    if (filledPlaces(shift.assignments) >= shift.headcount) return { success: false, error: 'This shift is already covered', code: 'full' };
    moves.push({ leaveAssignmentId: null, leaveEmployeeId: null, shift, incomingEmployeeId: request.requestedByEmployeeId });
  } else if (request.type === 'give') {
    moves.push({ leaveAssignmentId: request.fromAssignmentId, leaveEmployeeId: request.requestedByEmployeeId, shift, incomingEmployeeId: request.targetEmployeeId! });
  } else {
    moves.push({ leaveAssignmentId: request.fromAssignmentId, leaveEmployeeId: request.requestedByEmployeeId, shift, incomingEmployeeId: request.targetEmployeeId! });
    moves.push({ leaveAssignmentId: request.targetAssignmentId, leaveEmployeeId: request.targetEmployeeId, shift: targetShift!, incomingEmployeeId: request.requestedByEmployeeId });
  }
  for (const m of moves) {
    if (m.leaveAssignmentId && !m.shift.assignments.some((a) => a.id === m.leaveAssignmentId && a.status !== 'declined')) {
      return { success: false, error: 'Someone in this request is no longer on that shift', code: 'stale' };
    }
  }

  const calendar = new Map<string, { userId: string; googleCalendarEventId: string }[]>();
  for (const m of moves) {
    if (!m.leaveAssignmentId) continue;
    calendar.set(
      m.leaveAssignmentId,
      await prisma.shiftCalendarSync.findMany({ where: { assignmentId: m.leaveAssignmentId }, select: { userId: true, googleCalendarEventId: true } }),
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const m of moves) {
      if (m.leaveAssignmentId) await tx.shiftAssignment.delete({ where: { id: m.leaveAssignmentId } });
    }
    for (const m of moves) {
      const token = newResponseToken();
      const created = await tx.shiftAssignment.create({
        data: { tenantId: m.shift.tenantId, shiftId: m.shift.id, employeeId: m.incomingEmployeeId, status: 'accepted', respondedAt: now, notifiedAt: now, responseTokenHash: token.hash },
      });
      if (m.leaveAssignmentId) {
        events.push({ kind: 'unassigned', tenantId: m.shift.tenantId, shiftId: m.shift.id, assignmentId: m.leaveAssignmentId, employeeId: m.leaveEmployeeId!, calendarEvents: calendar.get(m.leaveAssignmentId), quiet: true });
      }
      events.push({ kind: 'assigned', tenantId: m.shift.tenantId, shiftId: m.shift.id, assignmentId: created.id, employeeId: m.incomingEmployeeId, responseToken: token.token });
    }
  });
  for (const m of moves) {
    const after = await findShiftById(m.shift.id);
    if (after) await logShift('update', m.shift, after, actorUserId);
  }
  return { success: true, value: events };
}

export type RequestOutcome = {
  request: LoadedRequest;
  events: ShiftEvent[];
  notice: 'manager' | 'peer' | 'done' | 'declined' | 'none';
  // 'declined' only: who to tell, and how (the request may no longer name them).
  declined?: { key: 'declinedByPeer' | 'declinedByManager' | 'declinedCover'; employeeIds: string[] };
};

async function reload(id: string): Promise<LoadedRequest> {
  return (await prisma.shiftChangeRequest.findUnique({ where: { id }, include: REQUEST_INCLUDE }))!;
}

// Moves a request whose people are all known to either the manager or done.
async function advance(request: LoadedRequest, settings: EffectiveShiftsSettings, skillsEnabled: boolean, actorUserId: string): Promise<Result<RequestOutcome>> {
  const check = await evaluateIncoming(request, settings, skillsEnabled);
  if (!check) return { success: false, error: 'Shift not found', code: 'not_found' };
  if (check.blocks.length > 0) return { success: false, error: 'This change breaks a rule that can\'t be skipped', code: 'blocked', details: check.blocks };
  if (needsManager(request.type, settings, check.warnings)) {
    await prisma.shiftChangeRequest.update({ where: { id: request.id }, data: { status: 'pending_manager', warnings: check.warnings } });
    await logRequest(request, name(request.requestedBy), actorUserId, { status: request.status }, { status: 'pending_manager' });
    return { success: true, value: { request: await reload(request.id), events: [], notice: 'manager' } };
  }
  const done = await execute(request, check.shift, check.targetShift, actorUserId);
  if (!done.success) return done;
  await prisma.shiftChangeRequest.update({ where: { id: request.id }, data: { status: 'approved', decidedAt: new Date(), warnings: check.warnings } });
  await logRequest(request, name(request.requestedBy), actorUserId, { status: request.status }, { status: 'approved' });
  return { success: true, value: { request: await reload(request.id), events: done.value, notice: 'done' } };
}

async function hasActiveRequest(where: Prisma.ShiftChangeRequestWhereInput): Promise<boolean> {
  return (await prisma.shiftChangeRequest.count({ where: { ...where, status: { in: ACTIVE_STATUSES } } })) > 0;
}

// --- claim ------------------------------------------------------------------------------------

export async function claimOpenShift(shift: ShiftWithRelations, employeeId: string, settings: EffectiveShiftsSettings, skillsEnabled: boolean, actorUserId: string): Promise<Result<RequestOutcome>> {
  const now = new Date();
  if (!shift.openToClaim || shift.status !== 'published') return { success: false, error: 'This shift isn\'t open to take', code: 'not_open' };
  if (hasStarted(shift, now)) return { success: false, error: 'This shift already started', code: 'started' };
  if (filledPlaces(shift.assignments) >= shift.headcount) return { success: false, error: 'This shift is already covered', code: 'full' };
  if (shift.assignments.some((a) => a.employeeId === employeeId)) return { success: false, error: 'You are already on this shift', code: 'already_assigned' };
  if (await hasActiveRequest({ shiftId: shift.id, requestedByEmployeeId: employeeId, type: 'claim' })) return { success: false, error: 'You already asked for this shift', code: 'duplicate' };
  // Rules that can't be skipped refuse before anything is recorded.
  const pre = (await evaluateCandidates(shift, [employeeId], settings, skillsEnabled)).get(employeeId);
  if (!pre || pre.blocks.length > 0) return { success: false, error: "This change breaks a rule that can't be skipped", code: 'blocked', details: pre?.blocks ?? ['no_user'] };
  const created = await prisma.shiftChangeRequest.create({
    data: { tenantId: shift.tenantId, type: 'claim', status: 'pending_manager', shiftId: shift.id, requestedByEmployeeId: employeeId },
    include: REQUEST_INCLUDE,
  });
  await logRequest(created, name(created.requestedBy), actorUserId, null, { status: 'requested' });
  const result = await advance(created, settings, skillsEnabled, actorUserId);
  if (!result.success) await prisma.shiftChangeRequest.delete({ where: { id: created.id } });
  return result;
}

// --- give -------------------------------------------------------------------------------------

export async function giveAwayShift(shift: ShiftWithRelations, assignmentId: string, employeeId: string, reason: string | null, actorUserId: string): Promise<Result<RequestOutcome>> {
  const assignment = shift.assignments.find((a) => a.id === assignmentId && a.employeeId === employeeId);
  if (!assignment || assignment.status === 'declined') return { success: false, error: 'That shift is not yours', code: 'not_found' };
  if (shift.status !== 'published' || hasStarted(shift, new Date())) return { success: false, error: 'This shift can\'t be handed over any more', code: 'started' };
  if (await hasActiveRequest({ fromAssignmentId: assignmentId })) return { success: false, error: 'There is already a request for this shift', code: 'duplicate' };
  const created = await prisma.shiftChangeRequest.create({
    data: { tenantId: shift.tenantId, type: 'give', status: 'open', shiftId: shift.id, requestedByEmployeeId: employeeId, fromAssignmentId: assignmentId, reason },
    include: REQUEST_INCLUDE,
  });
  await logRequest(created, name(created.requestedBy), actorUserId, null, { status: 'open' });
  return { success: true, value: { request: created, events: [], notice: 'none' } };
}

export async function takeGivenShift(request: LoadedRequest, employeeId: string, settings: EffectiveShiftsSettings, skillsEnabled: boolean, actorUserId: string): Promise<Result<RequestOutcome>> {
  if (request.type !== 'give' || request.status !== 'open') return { success: false, error: 'This shift is no longer available', code: 'not_open' };
  if (request.requestedByEmployeeId === employeeId) return { success: false, error: 'This is your own shift', code: 'own' };
  if (hasStarted(request.shift, new Date())) return { success: false, error: 'This shift already started', code: 'started' };
  // Claim the request first (only one taker wins a race).
  const taken = await prisma.shiftChangeRequest.updateMany({ where: { id: request.id, status: 'open' }, data: { targetEmployeeId: employeeId, status: 'pending_manager' } });
  if (taken.count === 0) return { success: false, error: 'Someone else took it first', code: 'not_open' };
  const fresh = await reload(request.id);
  const result = await advance({ ...fresh, status: 'open' }, settings, skillsEnabled, actorUserId);
  if (!result.success) await prisma.shiftChangeRequest.update({ where: { id: request.id }, data: { targetEmployeeId: null, status: 'open' } });
  return result;
}

// --- swap -------------------------------------------------------------------------------------

export async function proposeSwap(
  shift: ShiftWithRelations,
  assignmentId: string,
  employeeId: string,
  target: { shift: ShiftWithRelations; assignmentId: string },
  reason: string | null,
  actorUserId: string,
): Promise<Result<RequestOutcome>> {
  const mine = shift.assignments.find((a) => a.id === assignmentId && a.employeeId === employeeId);
  const theirs = target.shift.assignments.find((a) => a.id === target.assignmentId);
  if (!mine || mine.status === 'declined') return { success: false, error: 'That shift is not yours', code: 'not_found' };
  if (!theirs || theirs.status === 'declined' || theirs.employeeId === employeeId) return { success: false, error: 'Pick a colleague\'s shift', code: 'not_found' };
  if (target.shift.tenantId !== shift.tenantId) return { success: false, error: 'Pick a colleague\'s shift', code: 'not_found' };
  const now = new Date();
  if ([shift, target.shift].some((s) => s.status !== 'published' || hasStarted(s, now))) return { success: false, error: 'One of these shifts already started', code: 'started' };
  if (await hasActiveRequest({ OR: [{ fromAssignmentId: assignmentId }, { targetAssignmentId: target.assignmentId }, { fromAssignmentId: target.assignmentId }] })) {
    return { success: false, error: 'There is already a request for one of these shifts', code: 'duplicate' };
  }
  const created = await prisma.shiftChangeRequest.create({
    data: {
      tenantId: shift.tenantId,
      type: 'swap',
      status: 'pending_peer',
      shiftId: shift.id,
      requestedByEmployeeId: employeeId,
      fromAssignmentId: assignmentId,
      targetEmployeeId: theirs.employeeId,
      targetShiftId: target.shift.id,
      targetAssignmentId: target.assignmentId,
      reason,
    },
    include: REQUEST_INCLUDE,
  });
  await logRequest(created, name(created.requestedBy), actorUserId, null, { status: 'pending_peer' });
  return { success: true, value: { request: created, events: [], notice: 'peer' } };
}

export async function answerSwap(request: LoadedRequest, employeeId: string, accept: boolean, settings: EffectiveShiftsSettings, skillsEnabled: boolean, actorUserId: string): Promise<Result<RequestOutcome>> {
  if (request.type !== 'swap' || request.status !== 'pending_peer' || request.targetEmployeeId !== employeeId) return { success: false, error: 'Nothing to answer here', code: 'not_pending' };
  if (!accept) {
    await prisma.shiftChangeRequest.update({ where: { id: request.id }, data: { status: 'declined', decidedAt: new Date() } });
    await logRequest(request, name(request.requestedBy), actorUserId, { status: 'pending_peer' }, { status: 'declined' });
    return { success: true, value: { request: await reload(request.id), events: [], notice: 'declined', declined: { key: 'declinedByPeer', employeeIds: [request.requestedByEmployeeId] } } };
  }
  return advance(request, settings, skillsEnabled, actorUserId);
}

// --- manager ----------------------------------------------------------------------------------

export async function decideRequest(request: LoadedRequest, approve: boolean, note: string | null, settings: EffectiveShiftsSettings, skillsEnabled: boolean, actorUserId: string): Promise<Result<RequestOutcome>> {
  if (request.status !== 'pending_manager') return { success: false, error: 'This request is not waiting for approval', code: 'not_pending' };
  if (!approve) {
    // A declined hand-over goes back to the board; anything else ends.
    const back = request.type === 'give';
    await prisma.shiftChangeRequest.update({
      where: { id: request.id },
      data: back ? { status: 'open', targetEmployeeId: null, decisionNote: note } : { status: 'declined', decidedById: actorUserId, decidedAt: new Date(), decisionNote: note },
    });
    await logRequest(request, name(request.requestedBy), actorUserId, { status: 'pending_manager' }, { status: back ? 'open' : 'declined', decisionNote: note });
    const declined = back
      ? { key: 'declinedCover' as const, employeeIds: [request.targetEmployeeId].filter((x): x is string => !!x) }
      : { key: 'declinedByManager' as const, employeeIds: [request.requestedByEmployeeId] };
    return { success: true, value: { request: await reload(request.id), events: [], notice: 'declined', declined } };
  }
  const check = await evaluateIncoming(request, settings, skillsEnabled);
  if (!check) return { success: false, error: 'Shift not found', code: 'not_found' };
  if (check.blocks.length > 0) return { success: false, error: 'This change breaks a rule that can\'t be skipped', code: 'blocked', details: check.blocks };
  const done = await execute(request, check.shift, check.targetShift, actorUserId);
  if (!done.success) return done;
  await prisma.shiftChangeRequest.update({ where: { id: request.id }, data: { status: 'approved', decidedById: actorUserId, decidedAt: new Date(), decisionNote: note } });
  await logRequest(request, name(request.requestedBy), actorUserId, { status: 'pending_manager' }, { status: 'approved', decisionNote: note });
  return { success: true, value: { request: await reload(request.id), events: done.value, notice: 'done' } };
}

export async function cancelRequest(request: LoadedRequest, employeeId: string, actorUserId: string): Promise<Result<null>> {
  if (request.requestedByEmployeeId !== employeeId) return { success: false, error: 'Only who asked can cancel it', code: 'forbidden' };
  if (!ACTIVE_STATUSES.includes(request.status)) return { success: false, error: 'This request is already closed', code: 'closed' };
  await prisma.shiftChangeRequest.update({ where: { id: request.id }, data: { status: 'cancelled' } });
  await logRequest(request, name(request.requestedBy), actorUserId, { status: request.status }, { status: 'cancelled' });
  return { success: true, value: null };
}

export async function setOpenToClaim(shift: ShiftWithRelations, open: boolean, actorUserId: string) {
  await prisma.shift.update({ where: { id: shift.id }, data: { openToClaim: open } });
  const after = (await findShiftById(shift.id))!;
  await logShift('update', shift, after, actorUserId);
  return after;
}

// Daily cron: requests whose shift started are closed as expired (and their people told).
export async function expireStartedRequests(now: Date = new Date(), tenantId?: string): Promise<LoadedRequest[]> {
  const stale = await prisma.shiftChangeRequest.findMany({
    where: { status: { in: ACTIVE_STATUSES }, shift: { startsAt: { lte: now } }, ...(tenantId ? { tenantId } : {}) },
    include: REQUEST_INCLUDE,
  });
  if (stale.length) await prisma.shiftChangeRequest.updateMany({ where: { id: { in: stale.map((r) => r.id) } }, data: { status: 'expired', decidedAt: now } });
  return stale;
}

// --- lists ------------------------------------------------------------------------------------

// What this person can take: open places, and shifts colleagues are handing over. Each with the
// rules this person would hit, so the screen can say "needs approval" before they tap.
export async function listAvailable(tenantId: string, employeeId: string, settings: EffectiveShiftsSettings, skillsEnabled: boolean, now: Date = new Date()) {
  const [open, gives] = await Promise.all([
    prisma.shift.findMany({
      where: { tenantId, status: 'published', openToClaim: true, startsAt: { gt: now }, assignments: { none: { employeeId } } },
      select: { id: true },
      orderBy: { startsAt: 'asc' },
      take: 100,
    }),
    prisma.shiftChangeRequest.findMany({
      where: { tenantId, type: 'give', status: 'open', shift: { startsAt: { gt: now } }, requestedByEmployeeId: { not: employeeId } },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
  ]);
  const out: { kind: 'open' | 'give'; request: ReturnType<typeof serializeRequest> | null; shift: ReturnType<typeof shiftView> & { headcount: number; filled: number }; blocks: string[]; warnings: string[] }[] = [];
  for (const { id } of open) {
    const shift = await findShiftById(id);
    if (!shift || filledPlaces(shift.assignments) >= shift.headcount) continue;
    const ev = (await evaluateCandidates(shift, [employeeId], settings, skillsEnabled)).get(employeeId)!;
    out.push({ kind: 'open', request: null, shift: { ...shiftView({ ...shift, location: shift.location } as LoadedRequest['shift']), headcount: shift.headcount, filled: filledPlaces(shift.assignments) }, blocks: ev.blocks, warnings: ev.warnings });
  }
  for (const r of gives) {
    const shift = await findShiftById(r.shiftId);
    if (!shift || shift.assignments.some((a) => a.employeeId === employeeId)) continue;
    const ev = (await evaluateCandidates(shift, [employeeId], settings, skillsEnabled)).get(employeeId)!;
    out.push({ kind: 'give', request: serializeRequest(r), shift: { ...shiftView(r.shift), headcount: shift.headcount, filled: filledPlaces(shift.assignments) }, blocks: ev.blocks, warnings: ev.warnings });
  }
  return out.sort((a, b) => a.shift.startsAt.localeCompare(b.shift.startsAt));
}

// Mine: requests I made or that wait for my answer. Manage: requests waiting for a manager, at
// the locations this person schedules (null = all), plus the last 30 days of decided ones.
export async function listRequests(tenantId: string, opts: { employeeId?: string | null; locationIds?: string[] | null; scope: 'mine' | 'manage' }) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const where: Prisma.ShiftChangeRequestWhereInput =
    opts.scope === 'mine'
      ? { tenantId, OR: [{ requestedByEmployeeId: opts.employeeId ?? '' }, { targetEmployeeId: opts.employeeId ?? '' }], updatedAt: { gte: since } }
      : {
          tenantId,
          ...(opts.locationIds ? { shift: { locationId: { in: opts.locationIds } } } : {}),
          OR: [{ status: 'pending_manager' }, { status: { in: ['approved', 'declined'] }, decidedAt: { gte: since } }],
        };
  const rows = await prisma.shiftChangeRequest.findMany({ where, include: REQUEST_INCLUDE, orderBy: { createdAt: 'desc' }, take: 200 });
  return rows.map(serializeRequest);
}

// Colleagues' upcoming shifts (same location, next 30 days) I could offer mine for.
export async function listSwapTargets(shift: ShiftWithRelations, employeeId: string, now: Date = new Date()) {
  const rows = await prisma.shiftAssignment.findMany({
    where: {
      tenantId: shift.tenantId,
      employeeId: { not: employeeId },
      status: { not: 'declined' },
      shift: { status: 'published', locationId: shift.location.id, startsAt: { gt: now, lt: new Date(now.getTime() + 30 * 86_400_000) }, id: { not: shift.id } },
    },
    include: { employee: { select: { id: true, firstName: true, lastName: true } }, shift: { include: { location: { select: { id: true, name: true, timezone: true } } } } },
    orderBy: { shift: { startsAt: 'asc' } },
    take: 100,
  });
  return rows.map((a) => ({ assignmentId: a.id, employee: a.employee, shift: shiftView(a.shift) }));
}
