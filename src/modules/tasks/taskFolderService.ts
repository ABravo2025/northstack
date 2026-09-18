import prisma from '../../lib/prisma.js';

export interface CreateTaskFolderInput {
  tenantId: string;
  name: string;
  createdById: string;
}

// One row per folder + a live pending-task count, so the frontend's folder rail never needs a
// second round-trip per folder — same reasoning as platformTenantService.ts's groupBy counts.
export async function listTaskFoldersForTenant(tenantId: string) {
  const [folders, counts] = await Promise.all([
    prisma.taskFolder.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.task.groupBy({
      by: ['folderId'],
      where: { tenantId, completedAt: null, folderId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const countByFolderId = new Map(counts.map((c) => [c.folderId, c._count._all]));
  return folders.map((f) => ({ ...f, pendingTaskCount: countByFolderId.get(f.id) ?? 0 }));
}

export async function createTaskFolder(input: CreateTaskFolderInput) {
  return prisma.taskFolder.create({
    data: { tenantId: input.tenantId, name: input.name, createdById: input.createdById },
  });
}

export async function findTaskFolderById(id: string) {
  return prisma.taskFolder.findUnique({ where: { id } });
}

// Tasks in the folder aren't deleted — they just fall back to "no folder" (explicit null-out
// instead of relying on the FK's onDelete: SetNull alone, so this stays correct even if that
// referential action ever changes).
export async function deleteTaskFolder(id: string): Promise<void> {
  await prisma.$transaction([
    prisma.task.updateMany({ where: { folderId: id }, data: { folderId: null } }),
    prisma.taskFolder.delete({ where: { id } }),
  ]);
}
