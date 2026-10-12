import type { Request, Response } from 'express';
import type { TimesheetStatus } from '@prisma/client';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import type { AuthenticatedUser } from '../modules/auth/authService.js';
import { getPlanLimits } from '../modules/tenant/planLimits.js';
import { canApproveTimesheets } from '../modules/auth/permissionService.js';
import { findOwnEmployeeIdForShifts } from '../modules/shifts/shiftAccess.js';
import { getShiftsSettings, type EffectiveShiftsSettings } from '../modules/shifts/shiftsSettingsService.js';
import { isValidDateString, isValidTimeZone, zonedDateString } from '../modules/shifts/shiftTime.js';
import { computeSuggestions } from '../modules/shifts/timesheetSuggestions.js';
import { notifyDecided, notifySubmitted } from '../modules/shifts/timesheetNotifier.js';
import {
  addAdjustment,
  addEntry,
  canApproveFor,
  decideWeek,
  deleteEntry,
  dismissSuggestion,
  findEntry,
  findTimesheet,
  findTimesheetById,
  findTimesheetEmployee,
  isEditableStatus,
  listApprovals,
  listWeekEntries,
  parseAdjustmentInput,
  parseEntryInput,
  parseReason,
  reopenWeek,
  restoreSuggestion,
  serializeEntries,
  submitWeek,
  updateEntry,
  weekContext,
  weekDates,
  weekStartFor,
  type TimesheetEmployee,
} from '../modules/shifts/timesheetService.js';
import prisma from '../lib/prisma.js';

// Shifts module, Unidad 9 (spec-shifts.md) — the weekly timesheet. Everyone logs their own hours;
// their direct manager or anyone with approve_timesheets approves them. Off entirely when the
// company turned timesheets off in Settings → Shifts.

export const timesheetsRouter = createAsyncRouter();

interface Ctx {
  user: AuthenticatedUser;
  settings: EffectiveShiftsSettings;
  own: TimesheetEmployee | null;
  timeZone: string;
}

async function context(req: Request, res: Response): Promise<Ctx | null> {
  const user = await validateSession(req, res);
  if (!user) return null;
  const settings = await getShiftsSettings(user.tenantId!);
  if (!settings.timesheetEnabled) {
    res.status(403).json({ error: 'Timesheets are turned off for this company', code: 'timesheet_disabled' });
    return null;
  }
  const ownId = await findOwnEmployeeIdForShifts(user);
  const own = ownId ? await findTimesheetEmployee(user.tenantId!, ownId) : null;
  const tz = (req.query.tz ?? req.body?.tz) as unknown;
  return { user, settings, own, timeZone: isValidTimeZone(tz) ? tz : 'UTC' };
}

const needOwn = (res: Response) => res.status(400).json({ error: 'Your user has no employee profile, so there is no timesheet to fill', code: 'no_employee' });
const deciderName = (u: AuthenticatedUser) => `${u.firstName} ${u.lastName}`.trim();

function sendResult(res: Response, result: { success: false; error: string; field?: string; code?: string }) {
  const status = result.code === 'week_locked' || result.code === 'already_logged' || result.code === 'not_submitted' || result.code === 'not_approved' || result.code === 'same_week' ? 409 : result.code === 'plan_limit_billable' ? 403 : 400;
  return res.status(status).json({ error: result.error, field: result.field, code: result.code });
}

// The week: entries, suggestions (own week only), totals and what the viewer may do.
timesheetsRouter.get('/api/shifts/timesheet', async (req, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  const { user, settings, timeZone } = ctx;

  let employee = ctx.own;
  if (typeof req.query.employeeId === 'string' && req.query.employeeId !== ctx.own?.id) {
    employee = await findTimesheetEmployee(user.tenantId!, req.query.employeeId);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    if (!(await canApproveFor(user, employee))) return res.status(403).json({ error: 'Insufficient permissions' });
  }
  if (!employee) return needOwn(res);

  const today = zonedDateString(new Date(), timeZone);
  const requested = isValidDateString(req.query.weekStart) ? req.query.weekStart : today;
  const weekStart = weekStartFor(requested, settings.weekStartsOn);
  const isOwn = employee.id === ctx.own?.id;

  const timesheet = await findTimesheet(user.tenantId!, employee.id, weekStart);
  const [rows, extra, suggestions, adjustedBy, canDecide] = await Promise.all([
    timesheet ? listWeekEntries(timesheet.id) : Promise.resolve([]),
    weekContext(user.tenantId!, employee.id, weekStart),
    isOwn && (!timesheet || isEditableStatus(timesheet.status)) ? computeSuggestions(employee, weekStart, timeZone, new Date()) : Promise.resolve([]),
    // Corrections filed in later weeks against this one.
    timesheet
      ? prisma.timeEntry.findMany({ where: { adjustsTimesheetId: timesheet.id }, include: { timesheet: { select: { weekStart: true, status: true } } }, orderBy: { createdAt: 'asc' } })
      : Promise.resolve([]),
    canApproveFor(user, employee),
  ]);
  const entries = await serializeEntries(user.tenantId!, rows);
  const status = timesheet?.status ?? 'open';

  return res.json({
    timesheetId: timesheet?.id ?? null,
    employee: { id: employee.id, firstName: employee.firstName, lastName: employee.lastName },
    weekStart,
    dates: weekDates(weekStart),
    today,
    status,
    submittedAt: timesheet?.submittedAt?.toISOString() ?? null,
    decidedAt: timesheet?.decidedAt?.toISOString() ?? null,
    decidedBy: timesheet?.decidedBy ? `${timesheet.decidedBy.firstName} ${timesheet.decidedBy.lastName}` : null,
    decisionNote: timesheet?.decisionNote ?? null,
    reopenedAt: timesheet?.reopenedAt?.toISOString() ?? null,
    reopenReason: timesheet?.reopenReason ?? null,
    entries,
    suggestions,
    adjustedBy: adjustedBy.map((a) => ({
      id: a.id,
      minutes: a.minutes,
      reason: a.reason,
      inWeek: a.timesheet.weekStart.toISOString().slice(0, 10),
      inWeekStatus: a.timesheet.status,
    })),
    plannedMinutes: extra.plannedMinutes,
    loggedMinutes: entries.reduce((n, e) => n + e.minutes, 0),
    billableMinutes: entries.filter((e) => e.billable).reduce((n, e) => n + e.minutes, 0),
    timeOffDates: extra.timeOffDates,
    isOwn,
    canEdit: isOwn && isEditableStatus(status),
    canDecide: canDecide && status === 'submitted',
    canReopen: canDecide && status === 'approved',
    canAdjust: isOwn && status === 'approved',
    billableAllowed: getPlanLimits(user.tenant).billableHoursEnabled,
    weekStartsOn: settings.weekStartsOn,
  });
});

timesheetsRouter.post('/api/shifts/timesheet/entries', async (req, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  if (!ctx.own) return needOwn(res);
  const parsed = parseEntryInput(req.body ?? {}, 'create', getPlanLimits(ctx.user.tenant).billableHoursEnabled);
  if (!parsed.success) return sendResult(res, parsed);
  const result = await addEntry(ctx.own, parsed.value, ctx.settings.weekStartsOn, ctx.user.id);
  if (!result.success) return sendResult(res, result);
  return res.status(201).json(result.value);
});

timesheetsRouter.patch('/api/shifts/timesheet/entries/:entryId', async (req, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  if (!ctx.own) return needOwn(res);
  const entry = await findEntry(ctx.user.tenantId!, req.params.entryId);
  if (!entry || entry.employeeId !== ctx.own.id) return res.status(404).json({ error: 'Entry not found' });
  const body = { ...(req.body ?? {}) };
  delete body.source;
  delete body.sourceId;
  const parsed = parseEntryInput(body, 'update', getPlanLimits(ctx.user.tenant).billableHoursEnabled);
  if (!parsed.success) return sendResult(res, parsed);
  if (entry.source === 'adjustment' && req.body?.reason !== undefined) {
    const reason = parseReason(req.body.reason, 'reason', true);
    if (!reason.success) return sendResult(res, reason);
    await prisma.timeEntry.update({ where: { id: entry.id }, data: { reason: reason.value } });
  }
  if (entry.source === 'adjustment' && req.body?.minutes !== undefined) {
    // Adjustments may be negative; the regular parser only takes 1..1440.
    const adj = parseAdjustmentInput({ minutes: req.body.minutes, reason: entry.reason ?? 'x' });
    if (!adj.success) return sendResult(res, adj);
    parsed.value.minutes = adj.value.minutes;
  }
  const result = await updateEntry(ctx.own, entry, parsed.value, ctx.settings.weekStartsOn, ctx.user.id);
  if (!result.success) return sendResult(res, result);
  return res.json(result.value);
});

timesheetsRouter.delete('/api/shifts/timesheet/entries/:entryId', async (req, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  if (!ctx.own) return needOwn(res);
  const entry = await findEntry(ctx.user.tenantId!, req.params.entryId);
  if (!entry || entry.employeeId !== ctx.own.id) return res.status(404).json({ error: 'Entry not found' });
  const result = await deleteEntry(ctx.own, entry, ctx.user.id);
  if (!result.success) return sendResult(res, result);
  return res.status(204).end();
});

timesheetsRouter.post('/api/shifts/timesheet/suggestions/dismiss', async (req, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  if (!ctx.own) return needOwn(res);
  const result = await dismissSuggestion(ctx.own, req.body?.sourceType, req.body?.sourceId);
  if (!result.success) return sendResult(res, result);
  return res.status(204).end();
});

timesheetsRouter.post('/api/shifts/timesheet/suggestions/restore', async (req, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  if (!ctx.own) return needOwn(res);
  await restoreSuggestion(ctx.own, req.body?.sourceType, req.body?.sourceId);
  return res.status(204).end();
});

timesheetsRouter.post('/api/shifts/timesheet/submit', async (req, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  if (!ctx.own) return needOwn(res);
  if (!isValidDateString(req.body?.weekStart)) return res.status(400).json({ error: 'weekStart is required', field: 'weekStart' });
  const weekStart = weekStartFor(req.body.weekStart, ctx.settings.weekStartsOn);
  const result = await submitWeek(ctx.own, weekStart, ctx.user.id);
  if (!result.success) return sendResult(res, result);
  await notifySubmitted(ctx.own, result.value);
  return res.json({ status: result.value.status });
});

// A correction to the person's own approved week, filed in their current week.
timesheetsRouter.post('/api/shifts/timesheet/:timesheetId/adjustments', async (req, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  if (!ctx.own) return needOwn(res);
  const closed = await findTimesheetById(ctx.user.tenantId!, req.params.timesheetId);
  if (!closed || closed.employeeId !== ctx.own.id) return res.status(404).json({ error: 'Timesheet not found' });
  const parsed = parseAdjustmentInput(req.body ?? {});
  if (!parsed.success) return sendResult(res, parsed);
  const today = zonedDateString(new Date(), ctx.timeZone);
  const result = await addAdjustment(ctx.own, closed, parsed.value, today, ctx.settings.weekStartsOn, ctx.user.id);
  if (!result.success) return sendResult(res, result);
  return res.status(201).json(result.value);
});

const APPROVAL_STATUSES: TimesheetStatus[] = ['submitted', 'approved', 'returned'];

timesheetsRouter.get('/api/shifts/timesheet/approvals', async (req, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  const status = APPROVAL_STATUSES.includes(req.query.status as TimesheetStatus) ? (req.query.status as TimesheetStatus) : 'submitted';
  const weekStart = isValidDateString(req.query.weekStart) ? weekStartFor(req.query.weekStart, ctx.settings.weekStartsOn) : null;
  // canApprove drives the Approvals menu entry: the permission, or having anyone report to you.
  const canApprove =
    canApproveTimesheets(ctx.user.roleContext) || (!!ctx.own && (await prisma.employee.count({ where: { tenantId: ctx.user.tenantId!, managerId: ctx.own.id } })) > 0);
  return res.json({ canApprove, timesheets: canApprove ? await listApprovals(ctx.user, status, weekStart) : [] });
});

async function loadForApprover(ctx: Ctx, res: Response, timesheetId: string) {
  const timesheet = await findTimesheetById(ctx.user.tenantId!, timesheetId);
  if (!timesheet) {
    res.status(404).json({ error: 'Timesheet not found' });
    return null;
  }
  const employee = await findTimesheetEmployee(ctx.user.tenantId!, timesheet.employeeId);
  if (!employee || !(await canApproveFor(ctx.user, employee))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return null;
  }
  return { timesheet, employee };
}

timesheetsRouter.post('/api/shifts/timesheet/:timesheetId/decision', async (req, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  const loaded = await loadForApprover(ctx, res, req.params.timesheetId);
  if (!loaded) return;
  const decision = req.body?.decision;
  if (decision !== 'approve' && decision !== 'return') return res.status(400).json({ error: 'decision must be approve or return', field: 'decision' });
  const note = parseReason(req.body?.note, 'note', decision === 'return');
  if (!note.success) return sendResult(res, note);
  const result = await decideWeek(loaded.employee, loaded.timesheet, decision, note.value, ctx.user.id);
  if (!result.success) return sendResult(res, result);
  await notifyDecided(loaded.employee, result.value, deciderName(ctx.user));
  return res.json({ status: result.value.status });
});

timesheetsRouter.post('/api/shifts/timesheet/:timesheetId/reopen', async (req, res) => {
  const ctx = await context(req, res);
  if (!ctx) return;
  const loaded = await loadForApprover(ctx, res, req.params.timesheetId);
  if (!loaded) return;
  const reason = parseReason(req.body?.reason, 'reason', true);
  if (!reason.success) return sendResult(res, reason);
  const result = await reopenWeek(loaded.employee, loaded.timesheet, reason.value!, ctx.user.id);
  if (!result.success) return sendResult(res, result);
  await notifyDecided(loaded.employee, result.value, deciderName(ctx.user));
  return res.json({ status: result.value.status });
});
