import { Prisma, type TimeEntrySource, type Timesheet, type TimesheetStatus } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { recordActivity } from '../activity/activityLogService.js';
import type { AuthenticatedUser } from '../auth/authService.js';
import { canApproveTimesheets } from '../auth/permissionService.js';
import { findOwnEmployeeIdForShifts } from './shiftAccess.js';
import { addDays, isValidDateString } from './shiftTime.js';
import { checkProjectBudget } from '../projects/projectBudget.js';

// Shifts module, Unidad 9 (spec-shifts.md §0.6-0.7, §1) — the weekly timesheet. A person logs
// hours (from suggestions or by hand), submits the week, and whoever approves it (their direct
// manager, or anyone with approve_timesheets) approves it or sends it back with a note. An approved
// week is closed: corrections go in as adjustment entries in the person's current open week
// (reason required, approved with that week, linked to the closed one), or an approver reopens it
// with a reason. Everything goes to the Activity Log.

type Result<T> = { success: true; value: T } | { success: false; error: string; field?: string; code?: string };

const MAX_DESCRIPTION = 500;
const MAX_REASON = 500;
export const MINUTES_PER_DAY = 24 * 60;
const SUGGESTION_SOURCES: TimeEntrySource[] = ['shift', 'task', 'meeting', 'calendar'];

// ---------------------------------------------------------------------------------------------
// Pure helpers (tested)

// The first day of the week holding `date`, with weeks starting on `weekStartsOn` (0 = Sunday).
export function weekStartFor(date: string, weekStartsOn: number): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day - weekStartsOn + 7) % 7));
}

export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function isEditableStatus(status: TimesheetStatus): boolean {
  return status === 'open' || status === 'returned';
}

export interface EntryInput {
  date: string;
  minutes: number;
  description: string | null;
  billable: boolean;
  companyId: string | null;
  projectId: string | null;
  source: TimeEntrySource;
  sourceId: string | null;
}

const optionalId = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// mode 'create' needs date + minutes; 'update' takes any subset (source never changes).
export function parseEntryInput(
  input: Record<string, unknown>,
  mode: 'create' | 'update',
  billableAllowed: boolean,
): Result<Partial<EntryInput>> {
  const out: Partial<EntryInput> = {};

  if (mode === 'create' || input.date !== undefined) {
    if (!isValidDateString(input.date)) return { success: false, error: 'A valid date is required', field: 'date' };
    out.date = input.date as string;
  }
  if (mode === 'create' || input.minutes !== undefined) {
    const m = input.minutes;
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 1 || m > MINUTES_PER_DAY) {
      return { success: false, error: 'Minutes must be a whole number between 1 and 1440', field: 'minutes' };
    }
    out.minutes = m;
  }
  if (input.description !== undefined) {
    const d = typeof input.description === 'string' ? input.description.trim() : '';
    if (d.length > MAX_DESCRIPTION) return { success: false, error: `Description must be ${MAX_DESCRIPTION} characters or fewer`, field: 'description' };
    out.description = d || null;
  }
  if (input.billable !== undefined) {
    if (typeof input.billable !== 'boolean') return { success: false, error: 'billable must be true or false', field: 'billable' };
    if (input.billable && !billableAllowed) return { success: false, error: 'Billable hours are part of the Growth plan', field: 'billable', code: 'plan_limit_billable' };
    out.billable = input.billable;
  }
  if (input.companyId !== undefined) out.companyId = optionalId(input.companyId);
  if (input.projectId !== undefined) out.projectId = optionalId(input.projectId);

  if (mode === 'create') {
    const source = input.source === undefined ? 'manual' : input.source;
    if (source !== 'manual' && !SUGGESTION_SOURCES.includes(source as TimeEntrySource)) {
      return { success: false, error: 'Unknown source', field: 'source' };
    }
    out.source = source as TimeEntrySource;
    out.sourceId = source === 'manual' ? null : optionalId(input.sourceId);
    if (source !== 'manual' && !out.sourceId) return { success: false, error: 'sourceId is required for a suggested entry', field: 'sourceId' };
    out.description ??= null;
    out.billable ??= false;
    out.companyId ??= null;
    out.projectId ??= null;
  }
  return { success: true, value: out };
}

// Adjustment minutes: non-zero, positive or negative, at most a week's worth either way.
export function parseAdjustmentInput(input: Record<string, unknown>): Result<{ minutes: number; reason: string; description: string | null }> {
  const m = input.minutes;
  if (typeof m !== 'number' || !Number.isInteger(m) || m === 0 || Math.abs(m) > MINUTES_PER_DAY * 7) {
    return { success: false, error: 'Minutes must be a whole number, positive or negative, and not zero', field: 'minutes' };
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!reason) return { success: false, error: 'A reason is required', field: 'reason' };
  if (reason.length > MAX_REASON) return { success: false, error: `Reason must be ${MAX_REASON} characters or fewer`, field: 'reason' };
  const description = typeof input.description === 'string' && input.description.trim() ? input.description.trim().slice(0, MAX_DESCRIPTION) : null;
  return { success: true, value: { minutes: m, reason, description } };
}

export function parseReason(value: unknown, field: string, required: boolean): Result<string | null> {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return required ? { success: false, error: 'A reason is required', field } : { success: true, value: null };
  if (text.length > MAX_REASON) return { success: false, error: `Must be ${MAX_REASON} characters or fewer`, field };
  return { success: true, value: text };
}

// ---------------------------------------------------------------------------------------------
// Access

export interface TimesheetEmployee {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  managerId: string | null;
  userId: string | null;
}

export function findTimesheetEmployee(tenantId: string, employeeId: string): Promise<TimesheetEmployee | null> {
  return prisma.employee.findFirst({
    where: { id: employeeId, tenantId },
    select: { id: true, tenantId: true, firstName: true, lastName: true, managerId: true, userId: true },
  });
}

// Approve / return / reopen someone's week: anyone with approve_timesheets, or their direct
// manager. Never your own week, except the Owner (who has no one above them).
export async function canApproveFor(user: AuthenticatedUser, employee: TimesheetEmployee): Promise<boolean> {
  const ownEmployeeId = await findOwnEmployeeIdForShifts(user);
  if (employee.id === ownEmployeeId && !user.roleContext.isOwner) return false;
  if (canApproveTimesheets(user.roleContext)) return true;
  return !!ownEmployeeId && employee.managerId === ownEmployeeId;
}

// ---------------------------------------------------------------------------------------------
// Reads

const ENTRY_INCLUDE = { adjustsTimesheet: { select: { weekStart: true } } } as const;
type EntryRow = Prisma.TimeEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;

const toDate = (d: Date) => d.toISOString().slice(0, 10);
const dateValue = (d: string) => new Date(`${d}T00:00:00Z`);

export async function serializeEntries(tenantId: string, rows: EntryRow[]) {
  const companyIds = [...new Set(rows.map((r) => r.companyId).filter((x): x is string => !!x))];
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((x): x is string => !!x))];
  const [companies, projects] = await Promise.all([
    companyIds.length ? prisma.company.findMany({ where: { tenantId, id: { in: companyIds } }, select: { id: true, name: true } }) : [],
    projectIds.length ? prisma.project.findMany({ where: { tenantId, id: { in: projectIds } }, select: { id: true, name: true } }) : [],
  ]);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  return rows.map((r) => ({
    id: r.id,
    date: toDate(r.date),
    minutes: r.minutes,
    source: r.source,
    sourceId: r.sourceId,
    billable: r.billable,
    description: r.description,
    companyId: r.companyId,
    // null when the company/project was deleted since; the id stays for the record.
    companyName: r.companyId ? (companyName.get(r.companyId) ?? null) : null,
    projectId: r.projectId,
    projectName: r.projectId ? (projectName.get(r.projectId) ?? null) : null,
    taskId: r.taskId,
    shiftAssignmentId: r.shiftAssignmentId,
    adjustsWeekStart: r.adjustsTimesheet ? toDate(r.adjustsTimesheet.weekStart) : null,
    reason: r.reason,
  }));
}

export function findTimesheet(tenantId: string, employeeId: string, weekStart: string) {
  return prisma.timesheet.findUnique({
    where: { employeeId_weekStart: { employeeId, weekStart: dateValue(weekStart) } },
    include: { decidedBy: { select: { firstName: true, lastName: true } } },
  }).then((t) => (t && t.tenantId === tenantId ? t : null));
}

export function findTimesheetById(tenantId: string, id: string) {
  return prisma.timesheet.findFirst({ where: { id, tenantId } });
}

export function listWeekEntries(timesheetId: string) {
  return prisma.timeEntry.findMany({ where: { timesheetId }, include: ENTRY_INCLUDE, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] });
}

export function findEntry(tenantId: string, id: string) {
  return prisma.timeEntry.findFirst({ where: { id, tenantId }, include: { timesheet: true } });
}

// Planned minutes (accepted shifts) for the week, and the days covered by approved time off.
export async function weekContext(tenantId: string, employeeId: string, weekStart: string) {
  const weekEnd = addDays(weekStart, 6);
  const [assignments, timeOff] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { tenantId, employeeId, status: 'accepted', shift: { status: 'published', date: { gte: dateValue(weekStart), lte: dateValue(weekEnd) } } },
      select: { shift: { select: { startsAt: true, endsAt: true } } },
    }),
    prisma.timeOffRequest.findMany({
      where: { tenantId, employeeId, status: 'approved', startDate: { lte: dateValue(weekEnd) }, endDate: { gte: dateValue(weekStart) } },
      select: { startDate: true, endDate: true },
    }),
  ]);
  const plannedMinutes = assignments.reduce((n, a) => n + Math.round((a.shift.endsAt.getTime() - a.shift.startsAt.getTime()) / 60000), 0);
  const timeOffDates = weekDates(weekStart).filter((d) => timeOff.some((r) => toDate(r.startDate) <= d && toDate(r.endDate) >= d));
  return { plannedMinutes, timeOffDates };
}

// ---------------------------------------------------------------------------------------------
// Writes

async function logTimesheet(t: Pick<Timesheet, 'id' | 'tenantId' | 'weekStart'>, label: string, actorId: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  await recordActivity({
    tenantId: t.tenantId,
    entityType: 'timesheet',
    entityId: t.id,
    entityLabel: `${label} · ${toDate(t.weekStart)}`,
    action: before ? 'update' : 'create',
    changedByUserId: actorId,
    before,
    after,
    fieldConfig: { status: { label: 'Status' }, decisionNote: { label: 'Note' }, reopenReason: { label: 'Reopen reason' } },
  });
}

async function logEntry(
  tenantId: string,
  entryId: string,
  label: string,
  action: 'create' | 'update' | 'delete',
  actorId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  await recordActivity({
    tenantId,
    entityType: 'timeEntry',
    entityId: entryId,
    entityLabel: label,
    action,
    changedByUserId: actorId,
    before,
    after,
    fieldConfig: {
      date: { label: 'Date' },
      minutes: { label: 'Minutes' },
      billable: { label: 'Billable' },
      description: { label: 'Description' },
      reason: { label: 'Reason' },
    },
  });
}

const employeeLabel = (e: Pick<TimesheetEmployee, 'firstName' | 'lastName'>) => `${e.firstName} ${e.lastName}`;
const entrySnapshot = (e: { date: Date; minutes: number; billable: boolean; description: string | null; reason?: string | null }) => ({
  date: toDate(e.date),
  minutes: e.minutes,
  billable: e.billable,
  description: e.description,
  reason: e.reason ?? null,
});

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function getOrCreateTimesheet(tx: PrismaTx, employee: TimesheetEmployee, weekStart: string) {
  return tx.timesheet.upsert({
    where: { employeeId_weekStart: { employeeId: employee.id, weekStart: dateValue(weekStart) } },
    update: {},
    create: { tenantId: employee.tenantId, employeeId: employee.id, weekStart: dateValue(weekStart) },
  });
}

// Fills company/project from what the entry came from, and checks it really is this person's.
async function resolveSource(employee: TimesheetEmployee, input: Partial<EntryInput>): Promise<Result<{ shiftAssignmentId: string | null; taskId: string | null; companyId: string | null; projectId: string | null }>> {
  let companyId = input.companyId ?? null;
  let projectId = input.projectId ?? null;
  let shiftAssignmentId: string | null = null;
  let taskId: string | null = null;

  if (input.source === 'shift') {
    const a = await prisma.shiftAssignment.findFirst({ where: { id: input.sourceId!, tenantId: employee.tenantId, employeeId: employee.id }, select: { id: true } });
    if (!a) return { success: false, error: 'That shift is not yours', field: 'sourceId' };
    shiftAssignmentId = a.id;
  }
  if (input.source === 'task' || input.source === 'meeting') {
    const task = await prisma.task.findFirst({
      where: { id: input.sourceId!, tenantId: employee.tenantId, assigneeId: employee.userId ?? '' },
      select: { id: true, entityType: true, entityId: true },
    });
    if (!task) return { success: false, error: 'That task is not yours', field: 'sourceId' };
    taskId = task.id;
    if (!companyId && !projectId) {
      const linked = await linkedClient(employee.tenantId, task.entityType, task.entityId);
      companyId = linked.companyId;
      projectId = linked.projectId;
    }
  }

  if (companyId && !(await prisma.company.findFirst({ where: { id: companyId, tenantId: employee.tenantId }, select: { id: true } }))) {
    return { success: false, error: 'Company not found', field: 'companyId' };
  }
  if (projectId) {
    const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: employee.tenantId }, select: { companyId: true } });
    if (!project) return { success: false, error: 'Project not found', field: 'projectId' };
    companyId ??= project.companyId;
  }
  return { success: true, value: { shiftAssignmentId, taskId, companyId, projectId } };
}

// The client a task is about: its company directly, a contact's or opportunity's company, or a
// project (and that project's company).
export async function linkedClient(tenantId: string, entityType: string, entityId: string): Promise<{ companyId: string | null; projectId: string | null }> {
  if (entityType === 'company') return { companyId: entityId, projectId: null };
  if (entityType === 'contact') {
    const c = await prisma.contact.findFirst({ where: { id: entityId, tenantId }, select: { companyId: true } });
    return { companyId: c?.companyId ?? null, projectId: null };
  }
  if (entityType === 'opportunity') {
    const o = await prisma.opportunity.findFirst({ where: { id: entityId, tenantId }, select: { companyId: true } });
    return { companyId: o?.companyId ?? null, projectId: null };
  }
  if (entityType === 'project') {
    const p = await prisma.project.findFirst({ where: { id: entityId, tenantId }, select: { id: true, companyId: true } });
    return { companyId: p?.companyId ?? null, projectId: p?.id ?? null };
  }
  return { companyId: null, projectId: null };
}

const notEditable = { success: false as const, error: 'This week was already submitted or approved', code: 'week_locked' };

export async function addEntry(employee: TimesheetEmployee, input: Partial<EntryInput>, weekStartsOn: number, actorId: string): Promise<Result<{ id: string; weekStart: string }>> {
  const source = await resolveSource(employee, input);
  if (!source.success) return source;
  const weekStart = weekStartFor(input.date!, weekStartsOn);

  try {
    const entry = await prisma.$transaction(async (tx) => {
      const timesheet = await getOrCreateTimesheet(tx, employee, weekStart);
      if (!isEditableStatus(timesheet.status)) return null;
      return tx.timeEntry.create({
        data: {
          tenantId: employee.tenantId,
          timesheetId: timesheet.id,
          employeeId: employee.id,
          date: dateValue(input.date!),
          minutes: input.minutes!,
          source: input.source!,
          sourceId: input.sourceId ?? null,
          billable: input.billable ?? false,
          description: input.description ?? null,
          createdById: actorId,
          ...source.value,
        },
      });
    });
    if (!entry) return notEditable;
    await logEntry(employee.tenantId, entry.id, `${employeeLabel(employee)} · ${input.date}`, 'create', actorId, null, entrySnapshot(entry));
    await checkProjectBudget(entry.projectId);
    return { success: true, value: { id: entry.id, weekStart } };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { success: false, error: 'That is already in your timesheet', code: 'already_logged' };
    }
    throw err;
  }
}

type LoadedEntry = NonNullable<Awaited<ReturnType<typeof findEntry>>>;

export async function updateEntry(employee: TimesheetEmployee, entry: LoadedEntry, input: Partial<EntryInput>, weekStartsOn: number, actorId: string): Promise<Result<{ id: string }>> {
  if (!isEditableStatus(entry.timesheet.status)) return notEditable;
  if (entry.source === 'adjustment' && (input.date !== undefined || input.billable !== undefined)) {
    return { success: false, error: 'An adjustment only changes its minutes, reason or description', code: 'invalid' };
  }
  // Moving it to another day must keep it in the same week (another week is another timesheet).
  if (input.date && weekStartFor(input.date, weekStartsOn) !== toDate(entry.timesheet.weekStart)) {
    return { success: false, error: 'Move it within the same week, or delete it and add it to the other week', field: 'date' };
  }
  if (input.companyId !== undefined || input.projectId !== undefined) {
    const source = await resolveSource(employee, { companyId: input.companyId ?? entry.companyId, projectId: input.projectId ?? entry.projectId });
    if (!source.success) return source;
    input = { ...input, companyId: source.value.companyId, projectId: source.value.projectId };
  }
  const updated = await prisma.timeEntry.update({
    where: { id: entry.id },
    data: {
      ...(input.date ? { date: dateValue(input.date) } : {}),
      ...(input.minutes !== undefined ? { minutes: input.minutes } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.billable !== undefined ? { billable: input.billable } : {}),
      ...(input.companyId !== undefined ? { companyId: input.companyId } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    },
  });
  await logEntry(employee.tenantId, entry.id, `${employeeLabel(employee)} · ${toDate(updated.date)}`, 'update', actorId, entrySnapshot(entry), entrySnapshot(updated));
  await checkProjectBudget(updated.projectId);
  return { success: true, value: { id: updated.id } };
}

export async function deleteEntry(employee: TimesheetEmployee, entry: LoadedEntry, actorId: string): Promise<Result<null>> {
  if (!isEditableStatus(entry.timesheet.status)) return notEditable;
  await prisma.timeEntry.delete({ where: { id: entry.id } });
  await logEntry(employee.tenantId, entry.id, `${employeeLabel(employee)} · ${toDate(entry.date)}`, 'delete', actorId, entrySnapshot(entry), null);
  return { success: true, value: null };
}

export async function dismissSuggestion(employee: TimesheetEmployee, sourceType: unknown, sourceId: unknown): Promise<Result<null>> {
  if (!SUGGESTION_SOURCES.includes(sourceType as TimeEntrySource) || typeof sourceId !== 'string' || !sourceId) {
    return { success: false, error: 'Unknown suggestion', field: 'sourceId' };
  }
  await prisma.timeSuggestionDismissal.upsert({
    where: { employeeId_sourceType_sourceId: { employeeId: employee.id, sourceType: sourceType as TimeEntrySource, sourceId } },
    update: {},
    create: { tenantId: employee.tenantId, employeeId: employee.id, sourceType: sourceType as TimeEntrySource, sourceId },
  });
  return { success: true, value: null };
}

export async function restoreSuggestion(employee: TimesheetEmployee, sourceType: unknown, sourceId: unknown): Promise<void> {
  if (!SUGGESTION_SOURCES.includes(sourceType as TimeEntrySource) || typeof sourceId !== 'string') return;
  await prisma.timeSuggestionDismissal.deleteMany({ where: { employeeId: employee.id, sourceType: sourceType as TimeEntrySource, sourceId } });
}

export async function submitWeek(employee: TimesheetEmployee, weekStart: string, actorId: string): Promise<Result<Timesheet>> {
  const result = await prisma.$transaction(async (tx) => {
    const timesheet = await getOrCreateTimesheet(tx, employee, weekStart);
    if (!isEditableStatus(timesheet.status)) return { before: timesheet, after: null };
    const after = await tx.timesheet.update({
      where: { id: timesheet.id },
      data: { status: 'submitted', submittedAt: new Date(), decidedById: null, decidedAt: null },
    });
    return { before: timesheet, after };
  });
  if (!result.after) return notEditable;
  await logTimesheet(result.after, employeeLabel(employee), actorId, { status: result.before.status }, { status: 'submitted' });
  return { success: true, value: result.after };
}

// Approve, or send back with a note (required). Only a submitted week.
export async function decideWeek(
  employee: TimesheetEmployee,
  timesheet: Timesheet,
  decision: 'approve' | 'return',
  note: string | null,
  actorId: string,
): Promise<Result<Timesheet>> {
  if (decision === 'return' && !note) return { success: false, error: 'Tell them what to fix', field: 'note' };
  const updated = await prisma.timesheet.updateMany({
    where: { id: timesheet.id, status: 'submitted' },
    data: { status: decision === 'approve' ? 'approved' : 'returned', decidedById: actorId, decidedAt: new Date(), decisionNote: note },
  });
  if (updated.count === 0) return { success: false, error: 'Only a submitted week can be approved or returned', code: 'not_submitted' };
  const after = (await prisma.timesheet.findUnique({ where: { id: timesheet.id } }))!;
  await logTimesheet(after, employeeLabel(employee), actorId, { status: 'submitted', decisionNote: null }, { status: after.status, decisionNote: note });
  return { success: true, value: after };
}

export async function reopenWeek(employee: TimesheetEmployee, timesheet: Timesheet, reason: string, actorId: string): Promise<Result<Timesheet>> {
  const updated = await prisma.timesheet.updateMany({
    where: { id: timesheet.id, status: 'approved' },
    data: { status: 'open', reopenedAt: new Date(), reopenReason: reason, submittedAt: null, decidedById: null, decidedAt: null, decisionNote: null },
  });
  if (updated.count === 0) return { success: false, error: 'Only an approved week can be reopened', code: 'not_approved' };
  const after = (await prisma.timesheet.findUnique({ where: { id: timesheet.id } }))!;
  await logTimesheet(after, employeeLabel(employee), actorId, { status: 'approved', reopenReason: timesheet.reopenReason }, { status: 'open', reopenReason: reason });
  return { success: true, value: after };
}

// A correction to a closed (approved) week, filed in the person's current week: it shows up there,
// is approved with it, and points back to the week it corrects.
export async function addAdjustment(
  employee: TimesheetEmployee,
  closed: Timesheet,
  input: { minutes: number; reason: string; description: string | null },
  today: string,
  weekStartsOn: number,
  actorId: string,
): Promise<Result<{ id: string; weekStart: string }>> {
  if (closed.status !== 'approved') return { success: false, error: 'Only an approved week takes adjustments; edit the week itself instead', code: 'not_approved' };
  const weekStart = weekStartFor(today, weekStartsOn);
  if (weekStart === toDate(closed.weekStart)) return { success: false, error: 'This week is still the current one; ask for it to be reopened instead', code: 'same_week' };

  const entry = await prisma.$transaction(async (tx) => {
    const current = await getOrCreateTimesheet(tx, employee, weekStart);
    if (!isEditableStatus(current.status)) return null;
    return tx.timeEntry.create({
      data: {
        tenantId: employee.tenantId,
        timesheetId: current.id,
        employeeId: employee.id,
        date: dateValue(today),
        minutes: input.minutes,
        source: 'adjustment',
        description: input.description,
        reason: input.reason,
        adjustsTimesheetId: closed.id,
        createdById: actorId,
      },
    });
  });
  if (!entry) return { success: false, error: 'Your current week was already submitted; ask for it to be returned first', code: 'week_locked' };
  await logEntry(employee.tenantId, entry.id, `${employeeLabel(employee)} · adjustment to ${toDate(closed.weekStart)}`, 'create', actorId, null, entrySnapshot(entry));
  return { success: true, value: { id: entry.id, weekStart } };
}

// ---------------------------------------------------------------------------------------------
// Approvals list

export async function listApprovals(user: AuthenticatedUser, status: TimesheetStatus, weekStart: string | null) {
  const ownEmployeeId = await findOwnEmployeeIdForShifts(user);
  const everyone = canApproveTimesheets(user.roleContext);
  if (!everyone && !ownEmployeeId) return [];

  const rows = await prisma.timesheet.findMany({
    where: {
      tenantId: user.tenantId!,
      status,
      ...(weekStart ? { weekStart: dateValue(weekStart) } : {}),
      employee: everyone ? {} : { managerId: ownEmployeeId },
      // Never your own week here (the Owner approves their own from their timesheet page).
      ...(ownEmployeeId ? { employeeId: { not: ownEmployeeId } } : {}),
    },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true } },
      entries: { select: { minutes: true, billable: true, source: true } },
    },
    orderBy: [{ weekStart: 'desc' }, { submittedAt: 'asc' }],
    take: 200,
  });
  return rows.map((t) => ({
    id: t.id,
    employee: t.employee,
    weekStart: toDate(t.weekStart),
    status: t.status,
    submittedAt: t.submittedAt?.toISOString() ?? null,
    decidedAt: t.decidedAt?.toISOString() ?? null,
    loggedMinutes: t.entries.reduce((n, e) => n + e.minutes, 0),
    billableMinutes: t.entries.filter((e) => e.billable).reduce((n, e) => n + e.minutes, 0),
    adjustments: t.entries.filter((e) => e.source === 'adjustment').length,
  }));
}
