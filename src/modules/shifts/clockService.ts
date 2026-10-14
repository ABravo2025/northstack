import { randomBytes } from 'node:crypto';
import type { ClockEntryMethod, ClockMethod, Location, Prisma } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { recordActivity } from '../activity/activityLogService.js';
import { findShiftById, logShift, newResponseToken } from './shiftService.js';
import { zonedDateString, zonedParts } from './shiftTime.js';

// Shifts phase 2, block B (spec-shifts-fase2.md §B): clocking in and out, with no tablet — a
// printed QR per location scanned with the person's own phone, or a button in the app, whichever
// the location allows. One open punch per person. Clocking in without a shift is allowed: at
// clock-out it becomes an overtime shift on the schedule (Alejandro, 2026-10-14). Breaks are taken
// with buttons or typed at clock-out. Corrections never overwrite: they keep old and new values.

type Result<T> = { success: true; value: T } | { success: false; error: string; code?: string; field?: string };

const MAX_UNSCHEDULED_HOURS = 12;
const EARLY_WINDOW_MS = 2 * 3600_000; // a shift can be clocked into up to 2 h before it starts
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ---------------------------------------------------------------------------------------------
// Pure (tested)

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function isLate(clockInAt: Date, shiftStartsAt: Date, toleranceMinutes: number): boolean {
  return clockInAt.getTime() > shiftStartsAt.getTime() + toleranceMinutes * 60_000;
}

export function workedMinutes(entry: { clockInAt: Date; clockOutAt: Date | null; breakMinutes: number }, now: Date = new Date()): number {
  const end = entry.clockOutAt ?? now;
  return Math.max(0, Math.round((end.getTime() - entry.clockInAt.getTime()) / 60_000) - entry.breakMinutes);
}

export function methodAllows(method: ClockMethod, via: 'qr' | 'app'): boolean {
  return method === 'qr_or_app' || method === via;
}

export function generateClockCode(): string {
  const bytes = randomBytes(12);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export type Geo = { lat: number; lng: number } | null;

export function parseGeo(input: unknown): Geo {
  if (!input || typeof input !== 'object') return null;
  const { lat, lng } = input as { lat?: unknown; lng?: unknown };
  if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// Away from the location when it checks positions and the phone is farther than the radius, or
// didn't share its position. null = this location doesn't check.
export function geoCheck(location: Pick<Location, 'requireLocation' | 'latitude' | 'longitude' | 'radiusMeters'>, geo: Geo): { distance: number | null; away: boolean } | null {
  if (!location.requireLocation || location.latitude === null || location.longitude === null) return null;
  if (!geo) return { distance: null, away: true };
  const distance = distanceMeters(geo, { lat: location.latitude, lng: location.longitude });
  return { distance, away: distance > location.radiusMeters };
}

export interface ClockConfigInput {
  clockMethod: ClockMethod;
  requireLocation: boolean;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
}

export function parseClockConfig(input: Record<string, unknown>): Result<Partial<ClockConfigInput>> {
  const out: Partial<ClockConfigInput> = {};
  if (input.clockMethod !== undefined) {
    if (!['off', 'qr', 'app', 'qr_or_app'].includes(input.clockMethod as string)) return { success: false, error: 'Unknown clock-in method', field: 'clockMethod' };
    out.clockMethod = input.clockMethod as ClockMethod;
  }
  if (input.requireLocation !== undefined) {
    if (typeof input.requireLocation !== 'boolean') return { success: false, error: 'requireLocation must be true or false', field: 'requireLocation' };
    out.requireLocation = input.requireLocation;
  }
  for (const [key, limit] of [['latitude', 90], ['longitude', 180]] as const) {
    if (input[key] === undefined) continue;
    const v = input[key];
    if (v !== null && (typeof v !== 'number' || Math.abs(v) > limit)) return { success: false, error: `Invalid ${key}`, field: key };
    out[key] = v as number | null;
  }
  if (input.radiusMeters !== undefined) {
    const v = input.radiusMeters;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 20 || v > 5000) return { success: false, error: 'Radius must be between 20 and 5000 meters', field: 'radiusMeters' };
    out.radiusMeters = v;
  }
  return { success: true, value: out };
}

// ---------------------------------------------------------------------------------------------

const ENTRY_INCLUDE = {
  location: { select: { id: true, name: true, timezone: true } },
  breaks: { orderBy: { startedAt: 'asc' } },
  employee: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.ClockEntryInclude;
export type LoadedEntry = Prisma.ClockEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;

export function serializeEntry(e: LoadedEntry, now: Date = new Date()) {
  const openBreak = e.breaks.find((b) => !b.endedAt) ?? null;
  return {
    id: e.id,
    employee: e.employee,
    location: { id: e.location.id, name: e.location.name },
    shiftAssignmentId: e.shiftAssignmentId,
    clockInAt: e.clockInAt.toISOString(),
    clockOutAt: e.clockOutAt?.toISOString() ?? null,
    method: e.method,
    breakMinutes: e.breakMinutes,
    onBreakSince: openBreak?.startedAt.toISOString() ?? null,
    breakButtonsUsed: e.breaks.length > 0,
    status: e.status,
    needsReview: e.needsReview,
    awayFromLocation: e.awayFromLocation,
    inDistanceMeters: e.inDistanceMeters,
    workedMinutes: workedMinutes(e, now),
  };
}

export function findEntry(tenantId: string, id: string) {
  return prisma.clockEntry.findFirst({ where: { id, tenantId }, include: ENTRY_INCLUDE });
}

export function findOpenEntry(employeeId: string) {
  return prisma.clockEntry.findFirst({ where: { employeeId, status: 'open' }, include: ENTRY_INCLUDE });
}

export function findLocationByCode(code: string) {
  return prisma.location.findUnique({ where: { clockCode: code.trim().toUpperCase() } });
}

async function logEntry(e: { id: string; tenantId: string }, label: string, actorUserId: string, before: Record<string, unknown> | null, after: Record<string, unknown>) {
  await recordActivity({
    tenantId: e.tenantId,
    entityType: 'clockEntry',
    entityId: e.id,
    entityLabel: label,
    action: before ? 'update' : 'create',
    changedByUserId: actorUserId,
    before,
    after,
    fieldConfig: { clockInAt: { label: 'Clock in' }, clockOutAt: { label: 'Clock out' }, breakMinutes: { label: 'Break (minutes)' }, status: { label: 'Status' } },
  });
}

// The shift this punch belongs to: the person's place (not declined) on a published shift at this
// location that is running now or starts within 2 h. The closest start wins.
export async function findShiftForClockIn(employeeId: string, locationId: string, now: Date) {
  const candidates = await prisma.shiftAssignment.findMany({
    where: {
      employeeId,
      status: { not: 'declined' },
      shift: { status: 'published', locationId, startsAt: { lte: new Date(now.getTime() + EARLY_WINDOW_MS) }, endsAt: { gt: now } },
    },
    include: { shift: { select: { startsAt: true, endsAt: true } } },
  });
  const taken = new Set(
    (await prisma.clockEntry.findMany({ where: { shiftAssignmentId: { in: candidates.map((c) => c.id) } }, select: { shiftAssignmentId: true } })).map((e) => e.shiftAssignmentId),
  );
  return (
    candidates
      .filter((c) => !taken.has(c.id))
      .sort((a, b) => Math.abs(a.shift.startsAt.getTime() - now.getTime()) - Math.abs(b.shift.startsAt.getTime() - now.getTime()))[0] ?? null
  );
}

export async function clockIn(input: {
  tenantId: string;
  employee: { id: string; firstName: string; lastName: string };
  location: Location;
  method: ClockEntryMethod;
  geo: Geo;
  now?: Date;
  actorUserId: string;
}): Promise<Result<LoadedEntry>> {
  const now = input.now ?? new Date();
  if (!input.location.isActive) return { success: false, error: 'This location is not active', code: 'inactive' };
  if (input.method !== 'manager' && !methodAllows(input.location.clockMethod, input.method)) {
    return { success: false, error: 'This location doesn’t take clock-ins that way', code: 'method_not_allowed' };
  }
  const open = await findOpenEntry(input.employee.id);
  if (open) return { success: false, error: 'You are already clocked in', code: 'already_in' };
  const assignment = await findShiftForClockIn(input.employee.id, input.location.id, now);
  const geo = geoCheck(input.location, input.geo);
  const entry = await prisma.clockEntry.create({
    data: {
      tenantId: input.tenantId,
      employeeId: input.employee.id,
      locationId: input.location.id,
      shiftAssignmentId: assignment?.id ?? null,
      clockInAt: now,
      method: input.method,
      inDistanceMeters: geo?.distance ?? null,
      awayFromLocation: geo?.away ?? false,
    },
    include: ENTRY_INCLUDE,
  });
  await logEntry(entry, `${input.employee.firstName} ${input.employee.lastName} · ${input.location.name}`, input.actorUserId, null, { clockInAt: now.toISOString(), status: 'open' });
  return { success: true, value: entry };
}

export async function startBreak(entry: LoadedEntry, now: Date = new Date()): Promise<Result<LoadedEntry>> {
  if (entry.status !== 'open') return { success: false, error: 'You are not clocked in', code: 'not_in' };
  if (entry.breaks.some((b) => !b.endedAt)) return { success: false, error: 'You are already on a break', code: 'on_break' };
  await prisma.clockBreak.create({ data: { clockEntryId: entry.id, startedAt: now } });
  return { success: true, value: (await findEntry(entry.tenantId, entry.id))! };
}

function breakSum(breaks: { startedAt: Date; endedAt: Date | null }[], now: Date): number {
  return breaks.reduce((n, b) => n + Math.round(((b.endedAt ?? now).getTime() - b.startedAt.getTime()) / 60_000), 0);
}

export async function endBreak(entry: LoadedEntry, now: Date = new Date()): Promise<Result<LoadedEntry>> {
  const open = entry.breaks.find((b) => !b.endedAt);
  if (!open) return { success: false, error: 'You are not on a break', code: 'not_on_break' };
  await prisma.clockBreak.update({ where: { id: open.id }, data: { endedAt: now } });
  const breaks = await prisma.clockBreak.findMany({ where: { clockEntryId: entry.id } });
  await prisma.clockEntry.update({ where: { id: entry.id }, data: { breakMinutes: breakSum(breaks, now) } });
  return { success: true, value: (await findEntry(entry.tenantId, entry.id))! };
}

// Turns a punch with no shift into an overtime shift on the schedule (published, accepted), in
// the location's own wall clock.
async function createOvertimeShift(entry: LoadedEntry, clockOutAt: Date, actorUserId: string): Promise<string> {
  const tz = entry.location.timezone;
  const date = zonedDateString(entry.clockInAt, tz);
  const minuteOf = (d: Date) => {
    const p = zonedParts(d, tz);
    return p.hour * 60 + p.minute;
  };
  const startMinute = minuteOf(entry.clockInAt);
  let endMinute = minuteOf(clockOutAt);
  if (endMinute === startMinute) endMinute = (startMinute + 1) % 1440;
  const now = new Date();
  const token = newResponseToken();
  const shift = await prisma.shift.create({
    data: {
      tenantId: entry.tenantId,
      locationId: entry.locationId,
      date: new Date(`${date}T00:00:00Z`),
      startMinute,
      endMinute,
      startsAt: entry.clockInAt,
      endsAt: clockOutAt,
      status: 'published',
      publishedAt: now,
      isOvertime: true,
      createdById: actorUserId,
      assignments: { create: { tenantId: entry.tenantId, employeeId: entry.employeeId, status: 'accepted', respondedAt: now, notifiedAt: now, responseTokenHash: token.hash } },
    },
    include: { assignments: true },
  });
  const loaded = await findShiftById(shift.id);
  if (loaded) await logShift('create', null, loaded, actorUserId);
  return shift.assignments[0].id;
}

export async function clockOut(input: { entry: LoadedEntry; breakMinutes?: unknown; geo: Geo; now?: Date; actorUserId: string; location: Location }): Promise<Result<{ entry: LoadedEntry; overtime: boolean }>> {
  const now = input.now ?? new Date();
  const e = input.entry;
  if (e.status !== 'open') return { success: false, error: 'You are not clocked in', code: 'not_in' };
  // Breaks: the buttons win when used; otherwise the minutes typed now.
  let breakMinutes: number;
  if (e.breaks.length > 0) {
    const open = e.breaks.find((b) => !b.endedAt);
    if (open) await prisma.clockBreak.update({ where: { id: open.id }, data: { endedAt: now } });
    breakMinutes = breakSum(await prisma.clockBreak.findMany({ where: { clockEntryId: e.id } }), now);
  } else {
    const typed = input.breakMinutes;
    if (typed !== undefined && typed !== null && (typeof typed !== 'number' || !Number.isInteger(typed) || typed < 0 || typed > 720)) {
      return { success: false, error: 'Break must be between 0 and 720 minutes', field: 'breakMinutes' };
    }
    breakMinutes = (typed as number | undefined) ?? 0;
  }
  const worked = Math.round((now.getTime() - e.clockInAt.getTime()) / 60_000);
  if (breakMinutes > worked) breakMinutes = Math.max(0, worked);
  const geo = geoCheck(input.location, input.geo);
  let shiftAssignmentId = e.shiftAssignmentId;
  const overtime = !shiftAssignmentId;
  if (overtime) shiftAssignmentId = await createOvertimeShift(e, now, input.actorUserId);
  await prisma.clockEntry.update({
    where: { id: e.id },
    data: {
      clockOutAt: now,
      breakMinutes,
      status: 'closed',
      shiftAssignmentId,
      outDistanceMeters: geo?.distance ?? null,
      awayFromLocation: e.awayFromLocation || (geo?.away ?? false),
      // An overtime punch is for the location's manager to look at.
      needsReview: overtime,
    },
  });
  await logEntry(e, `${e.employee.firstName} ${e.employee.lastName} · ${e.location.name}`, input.actorUserId, { status: 'open' }, { clockOutAt: now.toISOString(), breakMinutes, status: 'closed' });
  return { success: true, value: { entry: (await findEntry(e.tenantId, e.id))!, overtime } };
}

// Daily run: punches still open past their shift's end (or 12 h after clocking in without a
// shift) are closed there, flagged for review.
export async function autoCloseOpenEntries(now: Date = new Date(), tenantId?: string): Promise<LoadedEntry[]> {
  const open = await prisma.clockEntry.findMany({ where: { status: 'open', ...(tenantId ? { tenantId } : {}) }, include: ENTRY_INCLUDE });
  const closed: LoadedEntry[] = [];
  for (const e of open) {
    let closeAt: Date | null = null;
    if (e.shiftAssignmentId) {
      const a = await prisma.shiftAssignment.findUnique({ where: { id: e.shiftAssignmentId }, select: { shift: { select: { endsAt: true } } } });
      if (a && a.shift.endsAt <= now) closeAt = a.shift.endsAt;
    }
    if (!closeAt && e.clockInAt.getTime() + MAX_UNSCHEDULED_HOURS * 3600_000 <= now.getTime()) closeAt = new Date(e.clockInAt.getTime() + MAX_UNSCHEDULED_HOURS * 3600_000);
    if (!closeAt) continue;
    const openBreak = e.breaks.find((b) => !b.endedAt);
    if (openBreak) await prisma.clockBreak.update({ where: { id: openBreak.id }, data: { endedAt: closeAt } });
    const breaks = e.breaks.length ? breakSum(await prisma.clockBreak.findMany({ where: { clockEntryId: e.id } }), closeAt) : e.breakMinutes;
    await prisma.clockEntry.update({ where: { id: e.id }, data: { clockOutAt: closeAt, status: 'auto_closed', needsReview: true, breakMinutes: breaks } });
    closed.push((await findEntry(e.tenantId, e.id))!);
  }
  return closed;
}

// A scheduler fixes a punch: every changed field is kept as old → new with the reason.
export async function correctEntry(entry: LoadedEntry, input: Record<string, unknown>, reason: string, actorUserId: string): Promise<Result<LoadedEntry>> {
  const data: Prisma.ClockEntryUpdateInput = {};
  const changes: { field: string; oldValue: string | null; newValue: string | null }[] = [];
  const asDate = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);
  if (input.clockInAt !== undefined) {
    const d = asDate(input.clockInAt);
    if (!d) return { success: false, error: 'Invalid clock-in time', field: 'clockInAt' };
    data.clockInAt = d;
    changes.push({ field: 'clockInAt', oldValue: entry.clockInAt.toISOString(), newValue: d.toISOString() });
  }
  if (input.clockOutAt !== undefined) {
    const d = asDate(input.clockOutAt);
    if (!d) return { success: false, error: 'Invalid clock-out time', field: 'clockOutAt' };
    data.clockOutAt = d;
    changes.push({ field: 'clockOutAt', oldValue: entry.clockOutAt?.toISOString() ?? null, newValue: d.toISOString() });
  }
  if (input.breakMinutes !== undefined) {
    const v = input.breakMinutes;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 720) return { success: false, error: 'Break must be between 0 and 720 minutes', field: 'breakMinutes' };
    data.breakMinutes = v;
    changes.push({ field: 'breakMinutes', oldValue: String(entry.breakMinutes), newValue: String(v) });
  }
  const inAt = (data.clockInAt as Date | undefined) ?? entry.clockInAt;
  const outAt = (data.clockOutAt as Date | undefined) ?? entry.clockOutAt;
  if (outAt && outAt <= inAt) return { success: false, error: 'Clock-out must be after clock-in', field: 'clockOutAt' };
  if (changes.length === 0 && !input.markReviewed) return { success: false, error: 'Nothing to change', code: 'invalid' };
  await prisma.$transaction([
    prisma.clockEntry.update({ where: { id: entry.id }, data: { ...data, needsReview: false, ...(outAt && entry.status === 'open' ? { status: 'closed' } : {}) } }),
    ...changes.map((c) => prisma.clockCorrection.create({ data: { tenantId: entry.tenantId, clockEntryId: entry.id, ...c, reason, correctedById: actorUserId } })),
  ]);
  await logEntry(
    entry,
    `${entry.employee.firstName} ${entry.employee.lastName} · ${entry.location.name}`,
    actorUserId,
    { clockInAt: entry.clockInAt.toISOString(), clockOutAt: entry.clockOutAt?.toISOString() ?? null, breakMinutes: entry.breakMinutes },
    { clockInAt: inAt.toISOString(), clockOutAt: outAt?.toISOString() ?? null, breakMinutes: (data.breakMinutes as number | undefined) ?? entry.breakMinutes },
  );
  return { success: true, value: (await findEntry(entry.tenantId, entry.id))! };
}

export async function listCorrections(entryId: string) {
  const rows = await prisma.clockCorrection.findMany({ where: { clockEntryId: entryId }, orderBy: { createdAt: 'asc' } });
  return rows.map((c) => ({ field: c.field, oldValue: c.oldValue, newValue: c.newValue, reason: c.reason, correctedById: c.correctedById, createdAt: c.createdAt.toISOString() }));
}

export async function setClockConfig(location: Location, config: Partial<ClockConfigInput>, actorUserId: string) {
  const data: Prisma.LocationUpdateInput = { ...config };
  // Turning clock-in on for the first time gives the location its QR code.
  if (config.clockMethod && config.clockMethod !== 'off' && !location.clockCode) data.clockCode = generateClockCode();
  const updated = await prisma.location.update({ where: { id: location.id }, data });
  await recordActivity({
    tenantId: location.tenantId,
    entityType: 'location',
    entityId: location.id,
    entityLabel: location.name,
    action: 'update',
    changedByUserId: actorUserId,
    before: { clockMethod: location.clockMethod, requireLocation: location.requireLocation, radiusMeters: location.radiusMeters },
    after: { clockMethod: updated.clockMethod, requireLocation: updated.requireLocation, radiusMeters: updated.radiusMeters },
    fieldConfig: { clockMethod: { label: 'Clock-in method' }, requireLocation: { label: 'Check the phone’s position' }, radiusMeters: { label: 'Radius (m)' } },
  });
  return updated;
}

export async function regenerateClockCode(location: Location, actorUserId: string) {
  const updated = await prisma.location.update({ where: { id: location.id }, data: { clockCode: generateClockCode() } });
  await recordActivity({
    tenantId: location.tenantId,
    entityType: 'location',
    entityId: location.id,
    entityLabel: location.name,
    action: 'update',
    changedByUserId: actorUserId,
    before: { clockCode: 'previous QR' },
    after: { clockCode: 'new QR' },
    fieldConfig: { clockCode: { label: 'Clock-in QR' } },
  });
  return updated;
}

// ---------------------------------------------------------------------------------------------
// Today's board: per location, each person on a shift today with their punch state, plus anyone
// clocked in without a shift. Computed on the spot (no real-time alerts — daily cron only).

export type BoardState = 'upcoming' | 'missing' | 'in' | 'on_break' | 'out';

export async function buildBoard(tenantId: string, locationIds: string[] | null, now: Date = new Date(), toleranceMinutes = 5) {
  const locations = await prisma.location.findMany({
    where: { tenantId, isActive: true, ...(locationIds ? { id: { in: locationIds } } : {}) },
    select: { id: true, name: true, timezone: true, clockMethod: true },
    orderBy: { name: 'asc' },
  });
  const out = [];
  for (const loc of locations) {
    const today = zonedDateString(now, loc.timezone);
    const [assignments, entries] = await Promise.all([
      prisma.shiftAssignment.findMany({
        where: { tenantId, status: { not: 'declined' }, shift: { locationId: loc.id, status: 'published', date: new Date(`${today}T00:00:00Z`) } },
        include: { employee: { select: { id: true, firstName: true, lastName: true } }, shift: { select: { id: true, startsAt: true, endsAt: true, startMinute: true, endMinute: true, isOvertime: true } } },
        orderBy: { shift: { startsAt: 'asc' } },
      }),
      prisma.clockEntry.findMany({
        where: { tenantId, locationId: loc.id, OR: [{ status: 'open' }, { clockInAt: { gte: new Date(now.getTime() - 24 * 3600_000) } }] },
        include: ENTRY_INCLUDE,
        orderBy: { clockInAt: 'asc' },
      }),
    ]);
    const byAssignment = new Map(entries.filter((e) => e.shiftAssignmentId).map((e) => [e.shiftAssignmentId!, e]));
    const rows = assignments.map((a) => {
      const e = byAssignment.get(a.id) ?? null;
      const state: BoardState = e
        ? e.status === 'open'
          ? e.breaks.some((b) => !b.endedAt)
            ? 'on_break'
            : 'in'
          : 'out'
        : a.shift.startsAt <= now
          ? 'missing'
          : 'upcoming';
      return {
        employee: a.employee,
        shift: { id: a.shift.id, startMinute: a.shift.startMinute, endMinute: a.shift.endMinute, startsAt: a.shift.startsAt.toISOString(), isOvertime: a.shift.isOvertime },
        state,
        late: !!e && isLate(e.clockInAt, a.shift.startsAt, toleranceMinutes),
        entry: e ? serializeEntry(e, now) : null,
      };
    });
    // Clocked in without a shift (overtime in progress).
    const unscheduled = entries.filter((e) => !e.shiftAssignmentId && e.status === 'open').map((e) => serializeEntry(e, now));
    out.push({ location: { id: loc.id, name: loc.name, clockMethod: loc.clockMethod }, date: today, rows, unscheduled });
  }
  return out;
}

// Entries that need a scheduler's look: auto-closed punches, overtime, away from the location.
export async function listForReview(tenantId: string, locationIds: string[] | null) {
  const rows = await prisma.clockEntry.findMany({
    where: { tenantId, needsReview: true, ...(locationIds ? { locationId: { in: locationIds } } : {}) },
    include: ENTRY_INCLUDE,
    orderBy: { clockInAt: 'desc' },
    take: 100,
  });
  return rows.map((e) => serializeEntry(e));
}
