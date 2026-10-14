import type { Request, Response } from 'express';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import prisma from '../lib/prisma.js';
import type { AuthenticatedUser } from '../modules/auth/authService.js';
import { canManageShifts } from '../modules/auth/permissionService.js';
import { getPlanLimits } from '../modules/tenant/planLimits.js';
import { canManageLocationShifts, findOwnEmployeeIdForShifts, managedLocationIds } from '../modules/shifts/shiftAccess.js';
import { getShiftsSettings } from '../modules/shifts/shiftsSettingsService.js';
import { notifyOvertime } from '../modules/shifts/clockNotifier.js';
import {
  buildBoard,
  clockIn,
  clockOut,
  correctEntry,
  endBreak,
  findEntry,
  findLocationByCode,
  findOpenEntry,
  findShiftForClockIn,
  listCorrections,
  listForReview,
  methodAllows,
  parseClockConfig,
  parseGeo,
  regenerateClockCode,
  serializeEntry,
  setClockConfig,
  startBreak,
} from '../modules/shifts/clockService.js';

// Shifts phase 2, block B (spec-shifts-fase2.md §B): clock in and out (Growth). The printed QR
// opens /clock/<code> in the app; the person must be signed in on their phone.
export const clockRouter = createAsyncRouter();

type Fail = { success: false; error: string; code?: string; field?: string };
const fail = (res: Response, r: Fail) => res.status(r.code === 'already_in' || r.code === 'not_in' || r.code === 'on_break' || r.code === 'not_on_break' ? 409 : 400).json({ error: r.error, code: r.code, field: r.field });

async function base(req: Request, res: Response) {
  const user = await validateSession(req, res);
  if (!user) return null;
  if (!getPlanLimits(user.tenant).clockInEnabled) {
    res.status(403).json({ error: 'Clocking in is part of the Growth plan', code: 'plan_limit_clock' });
    return null;
  }
  const employeeId = await findOwnEmployeeIdForShifts(user);
  const employee = employeeId ? await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, firstName: true, lastName: true } }) : null;
  return { user, employee };
}

const noEmployee = (res: Response) => res.status(400).json({ error: 'Your user has no employee profile', code: 'no_employee' });

// My state: am I clocked in, and where can I clock in from the app right now.
clockRouter.get('/api/clock/me', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  if (!ctx.employee) return res.json({ open: null, appLocations: [] });
  const now = new Date();
  const [open, locations] = await Promise.all([
    findOpenEntry(ctx.employee.id),
    prisma.location.findMany({ where: { tenantId: ctx.user.tenantId!, isActive: true, clockMethod: { in: ['app', 'qr_or_app'] } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  const appLocations = await Promise.all(
    locations.map(async (l) => {
      const a = await findShiftForClockIn(ctx.employee!.id, l.id, now);
      return { ...l, shiftStartsAt: a?.shift.startsAt.toISOString() ?? null };
    }),
  );
  // Locations with a shift now first.
  appLocations.sort((a, b) => Number(!!b.shiftStartsAt) - Number(!!a.shiftStartsAt));
  return res.json({ open: open ? serializeEntry(open, now) : null, appLocations });
});

// The page the printed QR opens.
clockRouter.get('/api/clock/code/:code', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  const location = await findLocationByCode(req.params.code);
  if (!location || location.tenantId !== ctx.user.tenantId || !location.isActive || !methodAllows(location.clockMethod, 'qr')) {
    return res.status(404).json({ error: 'This QR isn’t valid any more. Ask for the new one at your location.', code: 'invalid_code' });
  }
  const now = new Date();
  const open = ctx.employee ? await findOpenEntry(ctx.employee.id) : null;
  const assignment = ctx.employee && !open ? await findShiftForClockIn(ctx.employee.id, location.id, now) : null;
  return res.json({
    location: { id: location.id, name: location.name },
    requireLocation: location.requireLocation && location.latitude !== null,
    open: open ? serializeEntry(open, now) : null,
    shiftStartsAt: assignment?.shift.startsAt.toISOString() ?? null,
    shiftEndsAt: assignment?.shift.endsAt.toISOString() ?? null,
  });
});

clockRouter.post('/api/clock/in', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  if (!ctx.employee) return noEmployee(res);
  const byCode = typeof req.body?.code === 'string';
  const location = byCode
    ? await findLocationByCode(req.body.code)
    : typeof req.body?.locationId === 'string'
      ? await prisma.location.findFirst({ where: { id: req.body.locationId, tenantId: ctx.user.tenantId! } })
      : null;
  if (!location || location.tenantId !== ctx.user.tenantId) return res.status(404).json({ error: 'Location not found', code: 'invalid_code' });
  const r = await clockIn({ tenantId: ctx.user.tenantId!, employee: ctx.employee, location, method: byCode ? 'qr' : 'app', geo: parseGeo(req.body?.geo), actorUserId: ctx.user.id });
  if (!r.success) return fail(res, r);
  return res.status(201).json(serializeEntry(r.value));
});

clockRouter.post('/api/clock/out', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  if (!ctx.employee) return noEmployee(res);
  const open = await findOpenEntry(ctx.employee.id);
  if (!open) return res.status(409).json({ error: 'You are not clocked in', code: 'not_in' });
  const location = (await prisma.location.findUnique({ where: { id: open.locationId } }))!;
  const r = await clockOut({ entry: open, breakMinutes: req.body?.breakMinutes, geo: parseGeo(req.body?.geo), actorUserId: ctx.user.id, location });
  if (!r.success) return fail(res, r);
  if (r.value.overtime) await notifyOvertime(r.value.entry);
  return res.json({ ...serializeEntry(r.value.entry), overtime: r.value.overtime });
});

clockRouter.post('/api/clock/break/:action', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  if (!ctx.employee) return noEmployee(res);
  const open = await findOpenEntry(ctx.employee.id);
  if (!open) return res.status(409).json({ error: 'You are not clocked in', code: 'not_in' });
  if (req.params.action !== 'start' && req.params.action !== 'end') return res.status(404).json({ error: 'Not found' });
  const r = req.params.action === 'start' ? await startBreak(open) : await endBreak(open);
  if (!r.success) return fail(res, r);
  return res.json(serializeEntry(r.value));
});

// --- schedulers --------------------------------------------------------------------------------

async function schedulableIds(user: AuthenticatedUser): Promise<string[] | null> {
  return canManageShifts(user.roleContext) ? null : managedLocationIds(user);
}

clockRouter.get('/api/clock/board', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  const ids = await schedulableIds(ctx.user);
  if (ids && ids.length === 0) return res.json({ canManage: false, locations: [], review: [] });
  const settings = await getShiftsSettings(ctx.user.tenantId!);
  const narrow = typeof req.query.locationId === 'string' && req.query.locationId ? [req.query.locationId] : null;
  const scope = narrow ? (ids ? ids.filter((i) => narrow.includes(i)) : narrow) : ids;
  const [locations, review] = await Promise.all([buildBoard(ctx.user.tenantId!, scope, new Date(), settings.lateToleranceMinutes), listForReview(ctx.user.tenantId!, scope)]);
  return res.json({ canManage: true, locations, review });
});

clockRouter.patch('/api/clock/entries/:entryId', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  const entry = await findEntry(ctx.user.tenantId!, req.params.entryId);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  if (!(await canManageLocationShifts(ctx.user, entry.locationId))) return res.status(403).json({ error: 'Insufficient permissions' });
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';
  if (!reason) return res.status(400).json({ error: 'A reason is required', field: 'reason' });
  const r = await correctEntry(entry, req.body ?? {}, reason, ctx.user.id);
  if (!r.success) return fail(res, r);
  return res.json(serializeEntry(r.value));
});

clockRouter.get('/api/clock/entries/:entryId/corrections', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  const entry = await findEntry(ctx.user.tenantId!, req.params.entryId);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  if (!(await canManageLocationShifts(ctx.user, entry.locationId))) return res.status(403).json({ error: 'Insufficient permissions' });
  return res.json({ corrections: await listCorrections(entry.id) });
});

// Per-location setup (Settings → Shifts → Locations): method, QR code, position check.
clockRouter.get('/api/clock/locations', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  if (!canManageShifts(ctx.user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const rows = await prisma.location.findMany({
    where: { tenantId: ctx.user.tenantId! },
    select: { id: true, name: true, isActive: true, clockMethod: true, clockCode: true, requireLocation: true, latitude: true, longitude: true, radiusMeters: true },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });
  return res.json({ locations: rows });
});

clockRouter.patch('/api/clock/locations/:locationId', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  if (!canManageShifts(ctx.user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const location = await prisma.location.findFirst({ where: { id: req.params.locationId, tenantId: ctx.user.tenantId! } });
  if (!location) return res.status(404).json({ error: 'Location not found' });
  const parsed = parseClockConfig(req.body ?? {});
  if (!parsed.success) return fail(res, parsed);
  const u = await setClockConfig(location, parsed.value, ctx.user.id);
  return res.json({ id: u.id, clockMethod: u.clockMethod, clockCode: u.clockCode, requireLocation: u.requireLocation, latitude: u.latitude, longitude: u.longitude, radiusMeters: u.radiusMeters });
});

clockRouter.post('/api/clock/locations/:locationId/code', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  if (!canManageShifts(ctx.user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const location = await prisma.location.findFirst({ where: { id: req.params.locationId, tenantId: ctx.user.tenantId! } });
  if (!location) return res.status(404).json({ error: 'Location not found' });
  const u = await regenerateClockCode(location, ctx.user.id);
  return res.json({ id: u.id, clockCode: u.clockCode });
});
