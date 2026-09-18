import prisma, { type ExtendedPrismaClient } from '../../lib/prisma.js';
import { bestEffort } from '../../lib/bestEffort.js';
import { emitWebhookEvent } from '../integrations/webhookDispatchService.js';
import { findEntityTenantId, isSupportedCrossModuleEntityType } from '../crossModule/entityLookup.js';
import { syncTaskCalendarEvent } from '../integrations/googleCalendarSyncService.js';
import { recordActivity } from '../activity/activityLogService.js';
import { taskActivityFieldConfig } from '../activity/fieldConfigs/taskFieldConfig.js';
import type { ActivityEntityType, EntityType, Prisma } from '@prisma/client';

// Task.entityType is narrower in practice than the full EntityType enum (never client/ticket/idea
// — see isSupportedCrossModuleEntityType), so casting it to ActivityEntityType for
// recordActivity's parentEntityType is always valid even though TS can't see that from the wider
// Prisma type alone.

export { findEntityTenantId };
export const isSupportedTaskEntityType = isSupportedCrossModuleEntityType;

export interface CreateTaskInput {
  tenantId: string;
  entityType: EntityType;
  entityId: string;
  title: string;
  description?: string | null;
  assigneeId: string;
  dueDate?: Date | string | null;
  // Requests a Google Meet link on the synced calendar event (2026-09-16) — only takes effect
  // once dueDate has a specific time (see googleCalendarSyncService.ts's taskEventBody), same as
  // the frontend's own gating (TaskForm.tsx forces a time when this is checked).
  hasVideoCall?: boolean;
  createdById: string;
  folderId?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  assigneeId?: string;
  dueDate?: Date | string | null;
  completedAt?: Date | string | null;
  hasVideoCall?: boolean;
  folderId?: string | null;
}

const taskInclude = {
  assignee: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  folder: { select: { id: true, name: true } },
} satisfies Prisma.TaskInclude;

export async function createTask(input: CreateTaskInput, client: ExtendedPrismaClient = prisma) {
  const task = await client.task.create({
    data: {
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title,
      description: input.description ?? null,
      assigneeId: input.assigneeId,
      dueDate: input.dueDate ?? null,
      hasVideoCall: input.hasVideoCall ?? false,
      createdById: input.createdById,
      folderId: input.folderId ?? null,
    },
    include: taskInclude,
  });

  // Best-effort — syncTaskCalendarEvent already swallows its own errors internally (see
  // googleCalendarSyncService.ts). Must still be awaited, not fired-and-forgotten: an
  // un-awaited promise can be killed mid-flight by Vercel once the HTTP response is sent
  // (confirmed 2026-08-25 with signup verification emails; the same gap applied here).
  await syncTaskCalendarEvent(null, task);

  await recordActivity({
    tenantId: input.tenantId,
    entityType: 'task',
    entityId: task.id,
    entityLabel: task.title,
    action: 'create',
    changedByUserId: input.createdById,
    after: task,
    fieldConfig: taskActivityFieldConfig,
    parentEntityType: input.entityType as ActivityEntityType,
    parentEntityId: input.entityId,
  });

  await bestEffort(
    emitWebhookEvent({ tenantId: input.tenantId, type: 'task.created', entity: { type: 'task', id: task.id }, data: task }),
    'Failed to emit task.created webhook event',
  );

  return task;
}

export async function findTaskById(id: string, client: ExtendedPrismaClient = prisma) {
  return client.task.findUnique({ where: { id }, include: taskInclude });
}

export async function listTasksForEntity(tenantId: string, entityType: EntityType, entityId: string) {
  return prisma.task.findMany({
    where: { tenantId, entityType, entityId },
    include: taskInclude,
    orderBy: { createdAt: 'asc' },
  });
}

// Private API + Webhooks (Unit 2) — Task is a cross-entity polymorphic model (tenantId +
// entityType + entityId), so every existing lister is scoped to one entity, one assignee, or a
// calendar date range; none returns "every Task in the tenant," which is what a `tasks:read`-
// scoped API key needs (the scope grants tenant-wide access, not per-entity access).
export async function listAllTasksForTenant(tenantId: string, client: ExtendedPrismaClient = prisma) {
  return client.task.findMany({
    where: { tenantId },
    include: taskInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateTask(id: string, input: UpdateTaskInput, changedByUserId: string, client: ExtendedPrismaClient = prisma) {
  // Whitelist explicitly — never spread req.body straight through (same rule
  // as every other update service in the app, since it may carry a tenantId/
  // entityId the caller shouldn't be able to reassign).
  const data: Prisma.TaskUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.assigneeId !== undefined) data.assigneeId = input.assigneeId;
  if (input.dueDate !== undefined) data.dueDate = input.dueDate;
  if (input.completedAt !== undefined) data.completedAt = input.completedAt;
  if (input.hasVideoCall !== undefined) data.hasVideoCall = input.hasVideoCall;
  if (input.folderId !== undefined) data.folderId = input.folderId;

  // Fetched before the write so the Google Calendar sync below can tell what
  // changed (e.g. reassignment, or dueDate/completedAt flipping) — see
  // syncTaskCalendarEvent's decision table.
  const previous = await client.task.findUnique({ where: { id } });
  const updated = await client.task.update({ where: { id }, data, include: taskInclude });

  // Must be awaited, not fired-and-forgotten — see the note above.
  await syncTaskCalendarEvent(previous, updated);

  if (previous) {
    await recordActivity({
      tenantId: previous.tenantId,
      entityType: 'task',
      entityId: id,
      entityLabel: updated.title,
      action: 'update',
      changedByUserId,
      before: previous,
      after: updated,
      fieldConfig: taskActivityFieldConfig,
      parentEntityType: previous.entityType as ActivityEntityType,
      parentEntityId: previous.entityId,
    });
  }

  // task.completed fires only on the null -> set transition, not every PATCH that happens to
  // touch a Task that's already completed (e.g. editing its title afterward isn't "completing" it
  // again).
  if (previous && !previous.completedAt && updated.completedAt) {
    await bestEffort(
      emitWebhookEvent({ tenantId: previous.tenantId, type: 'task.completed', entity: { type: 'task', id }, data: updated }),
      'Failed to emit task.completed webhook event',
    );
  }

  return updated;
}

export async function deleteTask(id: string, changedByUserId: string, client: ExtendedPrismaClient = prisma): Promise<void> {
  const task = await client.task.findUnique({ where: { id } });
  await client.task.delete({ where: { id } });

  if (task) {
    // Must be awaited, not fired-and-forgotten — see the note above.
    await syncTaskCalendarEvent(task, null);

    await recordActivity({
      tenantId: task.tenantId,
      entityType: 'task',
      entityId: id,
      entityLabel: task.title,
      action: 'delete',
      changedByUserId,
      before: task,
      fieldConfig: taskActivityFieldConfig,
      parentEntityType: task.entityType as ActivityEntityType,
      parentEntityId: task.entityId,
    });
  }
}

// "Mine": pending only (completed tasks are hidden from this list to keep the
// Overview's "My tasks" widget free of visual noise once done — the Task row
// itself is untouched, so it still shows up in the entity's own task history),
// soonest dueDate first, nulls (no due date) last — sorted in code rather than
// relying on a Prisma nulls-ordering preview feature not otherwise used in
// this project.
export async function listMyTasks(tenantId: string, assigneeId: string) {
  const tasks = await prisma.task.findMany({
    where: { tenantId, assigneeId, completedAt: null },
    include: {
      ...taskInclude,
    },
  });

  const entitySummaries = await summarizeTaskEntities(tenantId, tasks);

  const withSummary = tasks.map((task) => ({
    ...task,
    entitySummary: entitySummaries.get(`${task.entityType}:${task.entityId}`) ?? null,
  }));

  return withSummary.sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.getTime() - b.dueDate.getTime();
  });
}

export interface ListTasksForUserOptions {
  includeCompleted?: boolean;
  folderId?: string | null; // null = only unfoldered, undefined = no folder filter
  search?: string;
}

// Backs the "My Tasks" hub page: every Task the user is *involved in* — either as assignee or as
// the one who created it — not every Task in the tenant (that's listAllTasksForTenant, used only
// by the tasks:read API scope) and not just assignee-only (that's listMyTasks, kept separate and
// unchanged so the Overview "My tasks" widget's pending-only/assignee-only behavior never shifts
// under it). Sorting is left to the caller (frontend does date-ascending / grouping) since the hub
// needs both a flat list and a Kanban-by-bucket view from the same data.
export async function listTasksForUser(tenantId: string, userId: string, opts: ListTasksForUserOptions = {}) {
  const tasks = await prisma.task.findMany({
    where: {
      tenantId,
      OR: [{ assigneeId: userId }, { createdById: userId }],
      ...(opts.includeCompleted ? {} : { completedAt: null }),
      ...(opts.folderId !== undefined ? { folderId: opts.folderId } : {}),
      ...(opts.search ? { title: { contains: opts.search, mode: 'insensitive' } } : {}),
    },
    include: taskInclude,
    orderBy: { createdAt: 'desc' },
  });

  const entitySummaries = await summarizeTaskEntities(tenantId, tasks);

  return tasks.map((task) => ({
    ...task,
    entitySummary: entitySummaries.get(`${task.entityType}:${task.entityId}`) ?? null,
    relationship:
      task.assigneeId === userId && task.createdById === userId
        ? 'both'
        : task.assigneeId === userId
          ? 'assignee'
          : task.createdById === userId
            ? 'creator'
            : null,
  }));
}

// Every pending (not yet completed) Task with a dueDate for the tenant —
// mirrors the existing Time Off calendar endpoint's convention of returning
// everything and letting the frontend filter to the visible month, rather
// than taking a date-range param. Completed tasks are excluded so the
// Overview calendar doesn't accumulate visual noise once tasks are done.
export async function listTasksForCalendar(tenantId: string) {
  const tasks = await prisma.task.findMany({
    where: { tenantId, dueDate: { not: null }, completedAt: null },
    include: taskInclude,
    orderBy: { dueDate: 'asc' },
  });

  const entitySummaries = await summarizeTaskEntities(tenantId, tasks);

  return tasks.map((task) => ({
    ...task,
    entitySummary: entitySummaries.get(`${task.entityType}:${task.entityId}`) ?? null,
  }));
}

// Resolves a readable label per (entityType, entityId) so the frontend doesn't
// have to fetch Company/Contact/Employee/Opportunity separately just to show
// "which record is this task about" in "My tasks"/the calendar.
async function summarizeTaskEntities(
  tenantId: string,
  tasks: { entityType: EntityType; entityId: string }[],
): Promise<Map<string, string>> {
  const idsByType = new Map<EntityType, Set<string>>();
  for (const task of tasks) {
    if (!idsByType.has(task.entityType)) {
      idsByType.set(task.entityType, new Set());
    }
    idsByType.get(task.entityType)!.add(task.entityId);
  }

  const summaries = new Map<string, string>();

  const employeeIds = [...(idsByType.get('employee') ?? [])];
  if (employeeIds.length > 0) {
    const employees = await prisma.employee.findMany({
      where: { tenantId, id: { in: employeeIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const employee of employees) {
      summaries.set(`employee:${employee.id}`, `${employee.firstName} ${employee.lastName}`);
    }
  }

  const companyIds = [...(idsByType.get('company') ?? [])];
  if (companyIds.length > 0) {
    const companies = await prisma.company.findMany({
      where: { tenantId, id: { in: companyIds } },
      select: { id: true, name: true },
    });
    for (const company of companies) {
      summaries.set(`company:${company.id}`, company.name);
    }
  }

  const contactIds = [...(idsByType.get('contact') ?? [])];
  if (contactIds.length > 0) {
    const contacts = await prisma.contact.findMany({
      where: { tenantId, id: { in: contactIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const contact of contacts) {
      summaries.set(`contact:${contact.id}`, `${contact.firstName} ${contact.lastName}`);
    }
  }

  const opportunityIds = [...(idsByType.get('opportunity') ?? [])];
  if (opportunityIds.length > 0) {
    const opportunities = await prisma.opportunity.findMany({
      where: { tenantId, id: { in: opportunityIds } },
      select: { id: true, name: true },
    });
    for (const opportunity of opportunities) {
      summaries.set(`opportunity:${opportunity.id}`, opportunity.name);
    }
  }

  return summaries;
}
