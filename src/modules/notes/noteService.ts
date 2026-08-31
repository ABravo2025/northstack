import prisma from '../../lib/prisma.js';
import { findEntityTenantId, isSupportedCrossModuleEntityType } from '../crossModule/entityLookup.js';
import { recordActivity } from '../activity/activityLogService.js';
import { noteActivityFieldConfig } from '../activity/fieldConfigs/noteFieldConfig.js';
import type { ActivityEntityType, EntityType, Prisma } from '@prisma/client';

// Note.entityType is narrower in practice than the full EntityType enum (never client/ticket/idea
// — see isSupportedCrossModuleEntityType), so casting it to ActivityEntityType for
// recordActivity's parentEntityType is always valid even though TS can't see that from the wider
// Prisma type alone.

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

// platformRole is only meaningful for Admin Center's Ticket notes (author
// badge: Admin/Support/Tenant, see platformTicketService.ts) -- harmless
// extra field for every other Note usage (Employee/Company/etc.), which
// already sets it to null on non-staff users.
const noteInclude = {
  createdBy: { select: { id: true, firstName: true, lastName: true, platformRole: true } },
} satisfies Prisma.NoteInclude;

export async function createNote(input: CreateNoteInput) {
  const note = await prisma.note.create({
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

  await recordActivity({
    tenantId: input.tenantId,
    entityType: 'note',
    entityId: note.id,
    entityLabel: note.title,
    action: 'create',
    changedByUserId: input.createdById,
    after: note,
    fieldConfig: noteActivityFieldConfig,
    parentEntityType: input.entityType as ActivityEntityType,
    parentEntityId: input.entityId,
  });

  return note;
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

export async function updateNote(id: string, input: UpdateNoteInput, changedByUserId: string) {
  // Whitelist explicitly — never spread req.body straight through (same rule
  // as every other update service in the app).
  const data: Prisma.NoteUncheckedUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;

  const existing = await prisma.note.findUniqueOrThrow({ where: { id } });
  const updated = await prisma.note.update({ where: { id }, data, include: noteInclude });

  await recordActivity({
    tenantId: existing.tenantId,
    entityType: 'note',
    entityId: id,
    entityLabel: updated.title,
    action: 'update',
    changedByUserId,
    before: existing,
    after: updated,
    fieldConfig: noteActivityFieldConfig,
    parentEntityType: existing.entityType as ActivityEntityType,
    parentEntityId: existing.entityId,
  });

  return updated;
}

export async function deleteNote(id: string, changedByUserId: string): Promise<void> {
  const existing = await prisma.note.findUniqueOrThrow({ where: { id } });
  await prisma.note.delete({ where: { id } });

  await recordActivity({
    tenantId: existing.tenantId,
    entityType: 'note',
    entityId: id,
    entityLabel: existing.title,
    action: 'delete',
    changedByUserId,
    before: existing,
    fieldConfig: noteActivityFieldConfig,
    parentEntityType: existing.entityType as ActivityEntityType,
    parentEntityId: existing.entityId,
  });
}
