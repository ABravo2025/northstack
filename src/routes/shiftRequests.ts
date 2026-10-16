import type { Request, Response } from 'express';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import type { AuthenticatedUser } from '../modules/auth/authService.js';
import { canManageShifts } from '../modules/auth/permissionService.js';
import { getPlanLimits } from '../modules/tenant/planLimits.js';
import { canManageLocationShifts, findOwnEmployeeIdForShifts, managedLocationIds } from '../modules/shifts/shiftAccess.js';
import { dispatchShiftEvents } from '../modules/shifts/shiftNotifier.js';
import { notifyRequest } from '../modules/shifts/shiftRequestNotifier.js';
import {
  answerSwap,
  cancelRequest,
  claimOpenShift,
  decideRequest,
  findRequest,
  giveAwayShift,
  listAvailable,
  listRequests,
  listSwapTargets,
  parseReason,
  proposeSwap,
  serializeRequest,
  setOpenToClaim,
  takeGivenShift,
  type RequestOutcome,
} from '../modules/shifts/shiftRequestService.js';
import { findShiftById, serializeShift } from '../modules/shifts/shiftService.js';
import { getShiftsSettings } from '../modules/shifts/shiftsSettingsService.js';
import prisma from '../lib/prisma.js';

// Shifts phase 2, block A (spec-shifts-fase2.md): open shifts, hand-overs and swaps.
export const shiftRequestsRouter = createAsyncRouter();

type Fail = { success: false; error: string; code?: string; details?: unknown };

function fail(res: Response, r: Fail) {
  const status = r.code === 'not_found' ? 404 : r.code === 'forbidden' ? 403 : r.code === 'invalid' ? 400 : 409;
  return res.status(status).json({ error: r.error, code: r.code, details: r.details });
}

async function base(req: Request, res: Response) {
  const user = await validateSession(req, res);
  if (!user) return null;
  const settings = await getShiftsSettings(user.tenantId!);
  const employeeId = await findOwnEmployeeIdForShifts(user);
  return { user, settings, employeeId, skillsEnabled: getPlanLimits(user.tenant).shiftSkillsEnabled };
}

async function deliver(outcome: RequestOutcome) {
  await dispatchShiftEvents(outcome.events);
  await notifyRequest(outcome);
}

const noEmployee = (res: Response) => res.status(400).json({ error: 'Your user has no employee profile', code: 'no_employee' });
const swapsOff = (res: Response) => res.status(403).json({ error: 'Your company turned off handing over and swapping shifts', code: 'swaps_disabled' });

// What I can take: open places and colleagues' hand-overs.
shiftRequestsRouter.get('/api/shifts/available', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  if (!ctx.employeeId) return res.json({ items: [] });
  return res.json({ items: await listAvailable(ctx.user.tenantId!, ctx.employeeId, ctx.settings, ctx.skillsEnabled) });
});

// Mine (what I asked and what waits for my answer) or, for schedulers, what waits for approval.
shiftRequestsRouter.get('/api/shifts/requests', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  if (req.query.scope === 'manage') {
    const locationIds = canManageShifts(ctx.user.roleContext) ? null : await managedLocationIds(ctx.user);
    if (locationIds && locationIds.length === 0) return res.json({ canManage: false, requests: [] });
    return res.json({ canManage: true, requests: await listRequests(ctx.user.tenantId!, { scope: 'manage', locationIds }) });
  }
  return res.json({ employeeId: ctx.employeeId, requests: ctx.employeeId ? await listRequests(ctx.user.tenantId!, { scope: 'mine', employeeId: ctx.employeeId }) : [] });
});

// Scheduler: open (or close) a published shift's free places to anyone eligible.
shiftRequestsRouter.post('/api/shifts/:shiftId/open', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  const shift = await findShiftById(req.params.shiftId);
  if (!shift || shift.tenantId !== ctx.user.tenantId) return res.status(404).json({ error: 'Shift not found' });
  if (!(await canManageLocationShifts(ctx.user, shift.location.id))) return res.status(403).json({ error: 'Insufficient permissions' });
  if (shift.status !== 'published') return res.status(409).json({ error: 'Publish the shift first', code: 'not_published' });
  const open = req.body?.open !== false;
  return res.json(serializeShift(await setOpenToClaim(shift, open, ctx.user.id)));
});

shiftRequestsRouter.post('/api/shifts/:shiftId/claim', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  if (!ctx.employeeId) return noEmployee(res);
  const shift = await findShiftById(req.params.shiftId);
  if (!shift || shift.tenantId !== ctx.user.tenantId) return res.status(404).json({ error: 'Shift not found' });
  const r = await claimOpenShift(shift, ctx.employeeId, ctx.settings, ctx.skillsEnabled, ctx.user.id);
  if (!r.success) return fail(res, r);
  await deliver(r.value);
  return res.json(serializeRequest(r.value.request));
});

// Hand my shift over: it shows up as available to everyone else.
shiftRequestsRouter.post('/api/shifts/assignments/:assignmentId/give', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  if (!ctx.settings.allowSwaps) return swapsOff(res);
  if (!ctx.employeeId) return noEmployee(res);
  const assignment = await prisma.shiftAssignment.findFirst({ where: { id: req.params.assignmentId, tenantId: ctx.user.tenantId! }, select: { shiftId: true } });
  const shift = assignment ? await findShiftById(assignment.shiftId) : null;
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  // The reason is required (Alejandro, 2026-10-16: "así no queda información perdida").
  const reason = parseReason(req.body?.reason);
  if (!reason) return res.status(400).json({ error: 'Tell us why', field: 'reason' });
  const r = await giveAwayShift(shift, req.params.assignmentId, ctx.employeeId, reason, ctx.user.id);
  if (!r.success) return fail(res, r);
  return res.status(201).json(serializeRequest(r.value.request));
});

shiftRequestsRouter.post('/api/shifts/requests/:requestId/take', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  if (!ctx.employeeId) return noEmployee(res);
  const request = await findRequest(ctx.user.tenantId!, req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  const r = await takeGivenShift(request, ctx.employeeId, ctx.settings, ctx.skillsEnabled, ctx.user.id);
  if (!r.success) return fail(res, r);
  await deliver(r.value);
  return res.json(serializeRequest(r.value.request));
});

// Colleagues' shifts I could offer mine for.
shiftRequestsRouter.get('/api/shifts/assignments/:assignmentId/swap-targets', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  if (!ctx.employeeId) return res.json({ targets: [] });
  const assignment = await prisma.shiftAssignment.findFirst({ where: { id: req.params.assignmentId, tenantId: ctx.user.tenantId!, employeeId: ctx.employeeId }, select: { shiftId: true } });
  const shift = assignment ? await findShiftById(assignment.shiftId) : null;
  if (!shift) return res.status(404).json({ error: 'Shift not found' });
  return res.json({ targets: await listSwapTargets(shift, ctx.employeeId) });
});

shiftRequestsRouter.post('/api/shifts/assignments/:assignmentId/swap', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  if (!ctx.settings.allowSwaps) return swapsOff(res);
  if (!ctx.employeeId) return noEmployee(res);
  const tenantId = ctx.user.tenantId!;
  const mine = await prisma.shiftAssignment.findFirst({ where: { id: req.params.assignmentId, tenantId }, select: { shiftId: true } });
  const theirs = typeof req.body?.targetAssignmentId === 'string' ? await prisma.shiftAssignment.findFirst({ where: { id: req.body.targetAssignmentId, tenantId }, select: { id: true, shiftId: true } }) : null;
  const [shift, targetShift] = await Promise.all([mine ? findShiftById(mine.shiftId) : null, theirs ? findShiftById(theirs.shiftId) : null]);
  if (!shift || !targetShift || !theirs) return res.status(404).json({ error: 'Shift not found' });
  const reason = parseReason(req.body?.reason);
  if (!reason) return res.status(400).json({ error: 'Tell us why', field: 'reason' });
  const r = await proposeSwap(shift, req.params.assignmentId, ctx.employeeId, { shift: targetShift, assignmentId: theirs.id }, reason, ctx.user.id);
  if (!r.success) return fail(res, r);
  await deliver(r.value);
  return res.status(201).json(serializeRequest(r.value.request));
});

// The colleague asked to swap answers.
shiftRequestsRouter.post('/api/shifts/requests/:requestId/answer', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  if (!ctx.employeeId) return noEmployee(res);
  const request = await findRequest(ctx.user.tenantId!, req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  const r = await answerSwap(request, ctx.employeeId, req.body?.accept === true, ctx.settings, ctx.skillsEnabled, ctx.user.id);
  if (!r.success) return fail(res, r);
  await deliver(r.value);
  return res.json(serializeRequest(r.value.request));
});

async function canDecide(user: AuthenticatedUser, locationId: string) {
  return canManageLocationShifts(user, locationId);
}

shiftRequestsRouter.post('/api/shifts/requests/:requestId/decide', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  const request = await findRequest(ctx.user.tenantId!, req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  const locations = [request.shift.location.id, request.targetShift?.location.id].filter((x): x is string => !!x);
  for (const l of locations) if (!(await canDecide(ctx.user, l))) return res.status(403).json({ error: 'Insufficient permissions' });
  const r = await decideRequest(request, req.body?.approve === true, parseReason(req.body?.note), ctx.settings, ctx.skillsEnabled, ctx.user.id);
  if (!r.success) return fail(res, r);
  await deliver(r.value);
  return res.json(serializeRequest(r.value.request));
});

shiftRequestsRouter.post('/api/shifts/requests/:requestId/cancel', async (req, res) => {
  const ctx = await base(req, res);
  if (!ctx) return;
  if (!ctx.employeeId) return noEmployee(res);
  const request = await findRequest(ctx.user.tenantId!, req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  const r = await cancelRequest(request, ctx.employeeId, ctx.user.id);
  if (!r.success) return fail(res, r);
  return res.status(204).end();
});
