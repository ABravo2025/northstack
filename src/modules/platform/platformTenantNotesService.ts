import prisma from '../../lib/prisma.js';

// Platform staff notes/tasks about a Tenant. Since Admin Center v2 stage 4 (2026-10-04) they live
// in their own tables (PlatformNote / PlatformTask) instead of the tenant's Note/Task: nothing the
// customer can see — their app, activity log, webhooks, Google Calendar sync or data export —
// ever reads these tables. Responses keep the shape the Admin already used (description, title).

const author = { select: { id: true, firstName: true, lastName: true, platformRole: true } } as const;

export async function listTenantNotes(tenantId: string) {
  const notes = await prisma.platformNote.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, include: { createdBy: author } });
  return notes.map((n) => ({ id: n.id, title: 'Nota', description: n.body, createdAt: n.createdAt, createdBy: n.createdBy }));
}

export async function createTenantNote(tenantId: string, createdById: string, _title: string, description: string) {
  const n = await prisma.platformNote.create({ data: { tenantId, body: description, createdById }, include: { createdBy: author } });
  return { id: n.id, title: 'Nota', description: n.body, createdAt: n.createdAt, createdBy: n.createdBy };
}

export async function listTenantTasks(tenantId: string) {
  return prisma.platformTask.findMany({
    where: { tenantId },
    orderBy: [{ completedAt: { sort: 'asc', nulls: 'first' } }, { dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    include: { createdBy: author },
  });
}

export async function createTenantTask(
  tenantId: string,
  createdById: string,
  input: { title: string; description?: string | null; dueDate?: Date | null; assigneeId?: string },
) {
  return prisma.platformTask.create({
    data: { tenantId, title: input.title, dueDate: input.dueDate ?? null, createdById },
    include: { createdBy: author },
  });
}

export async function setTenantTaskCompleted(taskId: string, tenantId: string, completed: boolean) {
  // tenantId in the where clause doubles as the ownership check.
  const result = await prisma.platformTask.updateMany({ where: { id: taskId, tenantId }, data: { completedAt: completed ? new Date() : null } });
  if (result.count === 0) return null;
  return prisma.platformTask.findUnique({ where: { id: taskId }, include: { createdBy: author } });
}
