import prisma from '../../lib/prisma.js';
import { findEntityTenantId, isSupportedCrossModuleEntityType } from '../crossModule/entityLookup.js';
import type { EntityType, Prisma } from '@prisma/client';

export { findEntityTenantId, isSupportedCrossModuleEntityType as isSupportedNoteEntityType };

export interface CreateNoteInput {
  tenantId: string;
  entityType: EntityType;
  entityId: string;
  title: string;
  description: string;
  createdById: string;
}

export interface UpdateNoteInput {
  title?: string;
  description?: string;
}

const noteInclude = {
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.NoteInclude;

export async function createNote(input: CreateNoteInput) {
  return prisma.note.create({
    data: {
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title,
      description: input.description,
      createdById: input.createdById,
    },
    include: noteInclude,
  });
}

export async function findNoteById(id: string) {
  return prisma.note.findUnique({ where: { id }, include: noteInclude });
}

export async function listNotesForEntity(tenantId: string, entityType: EntityType, entityId: string) {
  return prisma.note.findMany({
    where: { tenantId, entityType, entityId },
    include: noteInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateNote(id: string, input: UpdateNoteInput) {
  // Whitelist explicitly — never spread req.body straight through (same rule
  // as every other update service in the app).
  const data: Prisma.NoteUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;

  return prisma.note.update({ where: { id }, data, include: noteInclude });
}

export async function deleteNote(id: string): Promise<void> {
  await prisma.note.delete({ where: { id } });
}
