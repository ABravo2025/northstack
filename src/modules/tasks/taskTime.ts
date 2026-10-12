import prisma from '../../lib/prisma.js';
import { recordActivity } from '../activity/activityLogService.js';
import { taskActivityFieldConfig } from '../activity/fieldConfigs/taskFieldConfig.js';
import type { ActivityEntityType } from '@prisma/client';

// Time spent on a task (spec-shifts.md Unidad 10): asked when it's completed, typed in the task, or
// added up by the assignee's timer. The timesheet suggests completed tasks with this as the minutes.

// Up to ~1,000 hours: anything beyond is a typo.
export const MAX_TIME_SPENT_MINUTES = 60_000;

// Validates a PATCH value: a whole number of minutes, or null to clear. undefined = not sent.
export function parseTimeSpent(value: unknown): { ok: true; value: number | null | undefined } | { ok: false } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_TIME_SPENT_MINUTES) return { ok: false };
  return { ok: true, value };
}

// Minutes the timer ran, rounded, at least 1 once started (a 20-second run still counts as work).
export function elapsedMinutes(startedAt: Date, now: Date): number {
  return Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 60000));
}

export function addElapsed(current: number | null, startedAt: Date, now: Date): number {
  return Math.min(MAX_TIME_SPENT_MINUTES, (current ?? 0) + elapsedMinutes(startedAt, now));
}

const include = {
  assignee: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  folder: { select: { id: true, name: true } },
} as const;

// Start or stop the timer. Only the assignee runs it, and never on a completed task.
export async function setTaskTimer(taskId: string, action: 'start' | 'stop', changedByUserId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return null;
  const now = new Date();
  if (action === 'start') {
    if (task.timerStartedAt) return prisma.task.findUnique({ where: { id: taskId }, include });
    return prisma.task.update({ where: { id: taskId }, data: { timerStartedAt: now }, include });
  }
  if (!task.timerStartedAt) return prisma.task.findUnique({ where: { id: taskId }, include });
  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { timerStartedAt: null, timeSpentMinutes: addElapsed(task.timeSpentMinutes, task.timerStartedAt, now) },
    include,
  });
  await recordActivity({
    tenantId: task.tenantId,
    entityType: 'task',
    entityId: task.id,
    entityLabel: task.title,
    action: 'update',
    changedByUserId,
    before: task,
    after: updated,
    fieldConfig: taskActivityFieldConfig,
    parentEntityType: task.entityType as ActivityEntityType,
    parentEntityId: task.entityId,
  });
  return updated;
}
