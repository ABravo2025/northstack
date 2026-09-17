import prisma from '../../lib/prisma.js';
import { listNotesForEntity } from '../notes/noteService.js';
import { listTasksForEntity } from '../tasks/taskService.js';

// Platform staff notes/tasks about a Tenant -- reuses the Note/Task models and their read-side
// listers (no side effects), but writes go straight to prisma instead of noteService.createNote /
// taskService.createTask: those also call recordActivity (would land in the *tenant's own*
// ActivityLogEntry feed, tenantId: this same tenant) and, for tasks, emitWebhookEvent (would fire
// the tenant's configured Private API webhooks) and syncTaskCalendarEvent. All three would leak an
// internal admin annotation to the customer it's about -- never appropriate here, so this module
// deliberately bypasses them.

export async function listTenantNotes(tenantId: string) {
  return listNotesForEntity(tenantId, 'tenant', tenantId);
}

export async function createTenantNote(tenantId: string, createdById: string, title: string, description: string) {
  return prisma.note.create({
    data: { tenantId, entityType: 'tenant', entityId: tenantId, title, description, createdById },
    include: { createdBy: { select: { id: true, firstName: true, lastName: true, platformRole: true } } },
  });
}

export async function listTenantTasks(tenantId: string) {
  return listTasksForEntity(tenantId, 'tenant', tenantId);
}

// assigneeId defaults to the creator -- platform staff tasks are personal reminders, not a
// team-assignment workflow (unlike tenant-facing Tasks, which assign across a whole team).
export async function createTenantTask(
  tenantId: string,
  createdById: string,
  input: { title: string; description?: string | null; dueDate?: Date | null; assigneeId?: string },
) {
  return prisma.task.create({
    data: {
      tenantId,
      entityType: 'tenant',
      entityId: tenantId,
      title: input.title,
      description: input.description ?? null,
      dueDate: input.dueDate ?? null,
      assigneeId: input.assigneeId ?? createdById,
      createdById,
    },
    include: {
      assignee: { select: { id: true, firstName: true, lastName: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

export async function setTenantTaskCompleted(taskId: string, tenantId: string, completed: boolean) {
  // tenantId in the where clause doubles as the ownership check -- a task id from another
  // tenant's note/task set (or a non-'tenant' entityType) never matches, same convention
  // updateTenantUser (tenantUserService.ts) uses for a global-id lookup.
  const result = await prisma.task.updateMany({
    where: { id: taskId, tenantId, entityType: 'tenant' },
    data: { completedAt: completed ? new Date() : null },
  });
  if (result.count === 0) return null;
  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignee: { select: { id: true, firstName: true, lastName: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}
