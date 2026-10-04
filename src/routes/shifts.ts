import type { Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { getClientIp, validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { isRateLimited } from '../lib/rateLimit.js';
import type { AuthenticatedUser } from '../modules/auth/authService.js';
import { canManageShifts } from '../modules/auth/permissionService.js';
import { getPlanLimits } from '../modules/tenant/planLimits.js';
import {
  canManageLocationShifts,
  canViewLocationShifts,
  findOwnEmployeeIdForShifts,
  managedLocationIds,
  viewableLocationIds,
} from '../modules/shifts/shiftAccess.js';
import { dispatchShiftEvents } from '../modules/shifts/shiftEvents.js';
import {
  assignEmployees,
  cancelShift,
  copyWeek,
  createShift,
  createTemplate,
  deleteDraftShift,
  deleteTemplate,
  findAssignmentByToken,
  findDraftsForPublish,
  findShiftById,
  isShiftResponse,
  listCandidates,
  listEmployeeShifts,
  listShifts,
  listTemplates,
  parseDateRange,
  publishShifts,
  respondToAssignment,
  serializeShift,
  toDateString,
  unassignEmployee,
  updateShift,
} from '../modules/shifts/shiftService.js';
import { getShiftsSettings, updateShiftsSettings } from '../modules/shifts/shiftsSettingsService.js';
import {
  createLocation,
  deleteLocation,
  findLocationById,
  listLocations,
  updateLocation,
} from '../modules/shifts/locationService.js';

// Shifts module (docs/general/spec-shifts.md). Access: view_shifts / manage_shifts cover every
// location; a location's manager schedules that location; everyone sees and answers their own
// shifts (shiftAccess.ts). Module setup (settings, locations) is manage_shifts only.

export const shiftsRouter = createAsyncRouter();

function planLimitError(limit: number) {
  return {
    error: `Your plan allows ${limit} active location${limit === 1 ? '' : 's'}. Deactivate one, or upgrade to Growth for unlimited locations.`,
    code: 'plan_limit_locations',
    limit,
  };
}

// ---- Settings ----
// Readable by anyone in the tenant: the schedule and "My shifts" screens need weekStartsOn and
// whether confirmation is required.
shiftsRouter.get('/api/shifts/settings', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  return res.json(await getShiftsSettings(user.tenantId!));
});

shiftsRouter.patch('/api/shifts/settings', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageShifts(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const result = await updateShiftsSettings(user.tenantId!, req.body ?? {}, user.id);
  if (!result.success) return res.status(400).json({ error: result.error, field: result.field });
  return res.json(result.value);
});

// ---- Locations ----
// Who sees what: whole-schedule roles get every location; a location manager gets the ones they
// manage; anyone else gets an empty list (their own shifts carry their location's name).
// ?includeInactive=true is for the Settings screen and only honoured for manage_shifts.
shiftsRouter.get('/api/shifts/locations', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const ids = await viewableLocationIds(user);
  const includeInactive = req.query.includeInactive === 'true' && canManageShifts(user.roleContext);
  const locations = await listLocations(user.tenantId!, { includeInactive, ids });
  return res.json({ locations, maxActiveLocations: getPlanLimits(user.tenant).maxActiveLocations });
});

shiftsRouter.post('/api/shifts/locations', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageShifts(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const result = await createLocation(user.tenantId!, req.body ?? {}, user.id, getPlanLimits(user.tenant).maxActiveLocations);
  if (!result.success) {
    if (result.error === 'plan_limit' && 'limit' in result) return res.status(403).json(planLimitError(result.limit));
    return res.status(400).json({ error: result.error, field: 'field' in result ? result.field : undefined });
  }
  return res.status(201).json(result.value);
});

shiftsRouter.patch('/api/shifts/locations/:locationId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageShifts(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const existing = await findLocationById(String(req.params.locationId));
  if (!existing || existing.tenantId !== user.tenantId) return res.status(404).json({ error: 'Location not found' });
  const result = await updateLocation(existing, req.body ?? {}, user.id, getPlanLimits(user.tenant).maxActiveLocations);
  if (!result.success) {
    if (result.error === 'plan_limit' && 'limit' in result) return res.status(403).json(planLimitError(result.limit));
    return res.status(400).json({ error: result.error, field: 'field' in result ? result.field : undefined });
  }
  return res.json(result.value);
});

shiftsRouter.delete('/api/shifts/locations/:locationId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageShifts(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const existing = await findLocationById(String(req.params.locationId));
  if (!existing || existing.tenantId !== user.tenantId) return res.status(404).json({ error: 'Location not found' });
  const result = await deleteLocation(existing, user.id);
  if (!result.success) return res.status(409).json({ error: result.error });
  return res.status(204).end();
});

// ---- Shifts ----

const skillsEnabledFor = (user: AuthenticatedUser) => getPlanLimits(user.tenant).shiftSkillsEnabled;

// 404 for a shift the caller can't see at all (so other locations' ids don't leak), 403 for one
// they can see but not schedule.
async function loadShiftForManage(req: Request, res: Response, user: AuthenticatedUser) {
  const shift = await findShiftById(String(req.params.shiftId));
  if (!shift || shift.tenantId !== user.tenantId || !(await canViewLocationShifts(user, shift.locationId))) {
    res.status(404).json({ error: 'Shift not found' });
    return null;
  }
  if (!(await canManageLocationShifts(user, shift.locationId))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return null;
  }
  return shift;
}

// The schedule: published (and cancelled) shifts at every location the caller can view, plus
// drafts at the ones they can schedule. ?locationId narrows to one location.
shiftsRouter.get('/api/shifts', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const range = parseDateRange(req.query.from, req.query.to);
  if (!range.success) return res.status(400).json({ error: range.error });
  const narrow = typeof req.query.locationId === 'string' && req.query.locationId ? [req.query.locationId] : null;
  const intersect = (ids: string[] | null) => (narrow ? (ids ? ids.filter((id) => narrow.includes(id)) : narrow) : ids);

  const viewable = intersect(await viewableLocationIds(user));
  if (viewable && viewable.length === 0) return res.json([]);
  const manageable = intersect(canManageShifts(user.roleContext) ? null : await managedLocationIds(user));

  const published = await listShifts(user.tenantId!, { ...range.value, locationIds: viewable, includeDrafts: false, includeCancelled: true });
  const drafts =
    manageable && manageable.length === 0
      ? []
      : (await listShifts(user.tenantId!, { ...range.value, locationIds: manageable, includeDrafts: true })).filter((s) => s.status === 'draft');
  const all = [...published, ...drafts].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return res.json(all.map(serializeShift));
});

// "My shifts" — whatever the caller's role, their own published (and cancelled) shifts, showing
// only their own assignment row (not who else is on it or why someone declined).
shiftsRouter.get('/api/shifts/mine', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const range = parseDateRange(req.query.from, req.query.to);
  if (!range.success) return res.status(400).json({ error: range.error });
  const employeeId = await findOwnEmployeeIdForShifts(user);
  if (!employeeId) return res.json([]);
  const shifts = await listEmployeeShifts(user.tenantId!, employeeId, range.value.from, range.value.to);
  return res.json(shifts.map((s) => ownView(serializeShift(s), employeeId)));
});

function ownView(serialized: ReturnType<typeof serializeShift>, employeeId: string | null) {
  return { ...serialized, assignments: serialized.assignments.filter((a) => a.employeeId === employeeId) };
}

shiftsRouter.post('/api/shifts', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const locationId = typeof req.body?.locationId === 'string' ? req.body.locationId : '';
  if (!locationId || !(await canManageLocationShifts(user, locationId))) return res.status(403).json({ error: 'Insufficient permissions' });
  const result = await createShift(user.tenantId!, req.body ?? {}, user.id, skillsEnabledFor(user));
  if (!result.success) return res.status(400).json({ error: result.error, field: result.field });
  return res.status(201).json(serializeShift(result.value));
});

shiftsRouter.patch('/api/shifts/:shiftId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const shift = await loadShiftForManage(req, res, user);
  if (!shift) return;
  // Moving a shift to another location needs scheduling rights there too.
  const nextLocation = req.body?.locationId;
  if (typeof nextLocation === 'string' && nextLocation !== shift.locationId && !(await canManageLocationShifts(user, nextLocation))) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const settings = await getShiftsSettings(user.tenantId!);
  const result = await updateShift(shift, req.body ?? {}, user.id, settings, skillsEnabledFor(user));
  if (!result.success) return res.status(result.code === 'overlap' ? 409 : 400).json({ error: result.error, field: result.field, code: result.code });
  await dispatchShiftEvents(result.value.events);
  return res.json(serializeShift(result.value.shift));
});

shiftsRouter.delete('/api/shifts/:shiftId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const shift = await loadShiftForManage(req, res, user);
  if (!shift) return;
  const result = await deleteDraftShift(shift, user.id);
  if (!result.success) return res.status(409).json({ error: result.error });
  return res.status(204).end();
});

shiftsRouter.post('/api/shifts/:shiftId/cancel', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const shift = await loadShiftForManage(req, res, user);
  if (!shift) return;
  const result = await cancelShift(shift, user.id);
  if (!result.success) return res.status(409).json({ error: result.error });
  await dispatchShiftEvents(result.value.events);
  return res.json(serializeShift(result.value.shift));
});

// Everyone who could take this shift, each with their blocks/warnings (spec §3).
shiftsRouter.get('/api/shifts/:shiftId/candidates', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const shift = await loadShiftForManage(req, res, user);
  if (!shift) return;
  const settings = await getShiftsSettings(user.tenantId!);
  return res.json(await listCandidates(shift, settings, skillsEnabledFor(user)));
});

// { employeeIds, force } — without force, any warning sends back 409 + details for the scheduler
// to confirm; blocks always refuse.
shiftsRouter.post('/api/shifts/:shiftId/assignments', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const shift = await loadShiftForManage(req, res, user);
  if (!shift) return;
  const settings = await getShiftsSettings(user.tenantId!);
  const result = await assignEmployees(shift, req.body?.employeeIds, req.body?.force === true, user.id, settings, skillsEnabledFor(user));
  if (!result.success) {
    return res.status(result.code === 'invalid' ? 400 : 409).json({ error: result.error, code: result.code, details: result.details });
  }
  await dispatchShiftEvents(result.value.events);
  return res.status(201).json(serializeShift(result.value.shift));
});

shiftsRouter.delete('/api/shifts/:shiftId/assignments/:assignmentId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const shift = await loadShiftForManage(req, res, user);
  if (!shift) return;
  const result = await unassignEmployee(shift, String(req.params.assignmentId), user.id);
  if (!result.success) return res.status(result.code === 'not_found' ? 404 : 409).json({ error: result.error });
  await dispatchShiftEvents(result.value.events);
  return res.json(serializeShift(result.value.shift));
});

// { shiftIds } — publishes the drafts among them that the caller can schedule; others are skipped.
shiftsRouter.post('/api/shifts/publish', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const ids = req.body?.shiftIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || ids.some((id) => typeof id !== 'string')) {
    return res.status(400).json({ error: 'Pick the shifts to publish' });
  }
  const drafts = await findDraftsForPublish(user.tenantId!, ids as string[]);
  const allowed = canManageShifts(user.roleContext) ? null : new Set(await managedLocationIds(user));
  const mine = allowed ? drafts.filter((d) => allowed.has(d.locationId)) : drafts;
  const settings = await getShiftsSettings(user.tenantId!);
  const { published, events } = await publishShifts(mine, user.id, settings);
  await dispatchShiftEvents(events);
  return res.json({ published: published.length, notified: events.length, shifts: published.map(serializeShift) });
});

// { fromWeekStart, toWeekStart, locationId? } — copies into drafts; nothing is published.
shiftsRouter.post('/api/shifts/copy-week', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const requested = typeof req.body?.locationId === 'string' && req.body.locationId ? [req.body.locationId as string] : null;
  let locationIds: string[] | null;
  if (canManageShifts(user.roleContext)) {
    locationIds = requested;
  } else {
    const managed = await managedLocationIds(user);
    locationIds = requested ? requested.filter((id) => managed.includes(id)) : managed;
    if (locationIds.length === 0) return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = await copyWeek(user.tenantId!, req.body?.fromWeekStart, req.body?.toWeekStart, locationIds, user.id);
  if (!result.success) return res.status(400).json({ error: result.error });
  return res.json(result.value);
});

// The caller answering their own shift from the app.
shiftsRouter.post('/api/shifts/assignments/:assignmentId/respond', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!isShiftResponse(req.body?.response)) return res.status(400).json({ error: 'response must be accepted or declined' });
  const employeeId = await findOwnEmployeeIdForShifts(user);
  const assignmentId = String(req.params.assignmentId);
  const own = employeeId ? await prisma.shiftAssignment.findFirst({ where: { id: assignmentId, employeeId }, select: { id: true } }) : null;
  if (!own) return res.status(404).json({ error: 'Shift not found' });
  const result = await respondToAssignment(assignmentId, req.body.response, req.body.reason);
  if (!result.success) return res.status(result.code === 'not_found' ? 404 : 409).json({ error: result.error, code: result.code });
  await dispatchShiftEvents(result.value.events);
  return res.json(ownView(serializeShift(result.value.shift), employeeId));
});

// ---- Templates ----
shiftsRouter.get('/api/shifts/templates', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  return res.json(await listTemplates(user.tenantId!));
});

shiftsRouter.post('/api/shifts/templates', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageShifts(user.roleContext) && (await managedLocationIds(user)).length === 0) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  const result = await createTemplate(user.tenantId!, req.body ?? {}, user.id);
  if (!result.success) return res.status(400).json({ error: result.error, field: result.field });
  return res.status(201).json(result.value);
});

shiftsRouter.delete('/api/shifts/templates/:templateId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!canManageShifts(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const ok = await deleteTemplate(user.tenantId!, String(req.params.templateId), user.id);
  if (!ok) return res.status(404).json({ error: 'Template not found' });
  return res.status(204).end();
});

// ---- One-click answer from the email (public, no session) ----
// The token is the credential: 32 random bytes, only its sha256 stored, rotated on every
// re-notification. Rate-limited per IP like the other public token pages.
// Three path segments on purpose: a two-segment /api/public/x/:token would be swallowed by
// public.ts's /api/public/:tenantSlug/:formSlug (Public Forms), which is registered first.

const INVALID_LINK = 'This link is no longer valid. The shift may have changed — check your latest email or the app.';

async function publicTokenGuard(req: Request, res: Response): Promise<boolean> {
  if (await isRateLimited(`shift-response:${getClientIp(req)}`, { windowMs: 60_000, maxRequests: 20 })) {
    res.status(429).json({ error: 'Too many attempts. Please try again in a minute.' });
    return false;
  }
  return true;
}

function publicView(assignment: NonNullable<Awaited<ReturnType<typeof findAssignmentByToken>>>) {
  const s = assignment.shift;
  return {
    companyName: s.tenant.name,
    employeeFirstName: assignment.employee.firstName,
    status: assignment.status,
    shift: {
      date: toDateString(s.date),
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      startsAt: s.startsAt,
      position: s.position,
      notes: s.notes,
      status: s.status,
      location: { name: s.location.name, address: s.location.address, timezone: s.location.timezone },
    },
  };
}

shiftsRouter.get('/api/public/shifts/respond/:token', async (req, res) => {
  if (!(await publicTokenGuard(req, res))) return;
  const assignment = await findAssignmentByToken(req.params.token);
  if (!assignment) return res.status(404).json({ error: INVALID_LINK });
  return res.json(publicView(assignment));
});

shiftsRouter.post('/api/public/shifts/respond/:token', async (req, res) => {
  if (!(await publicTokenGuard(req, res))) return;
  if (!isShiftResponse(req.body?.response)) return res.status(400).json({ error: 'response must be accepted or declined' });
  const assignment = await findAssignmentByToken(req.params.token);
  if (!assignment) return res.status(404).json({ error: INVALID_LINK });
  const result = await respondToAssignment(assignment.id, req.body.response, req.body.reason);
  if (!result.success) return res.status(409).json({ error: result.error, code: result.code });
  await dispatchShiftEvents(result.value.events);
  return res.json(publicView((await findAssignmentByToken(req.params.token))!));
});
