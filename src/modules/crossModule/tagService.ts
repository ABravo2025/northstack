import prisma from '../../lib/prisma.js';
import { recordActivity } from '../activity/activityLogService.js';
import { tagActivityFieldConfig } from '../activity/fieldConfigs/tagFieldConfig.js';
import type { ActivityEntityType, EntityType } from '@prisma/client';

// TagAssignment.entityType is narrower in practice than the full EntityType enum (never
// client/ticket/idea — see isSupportedCrossModuleEntityType), so casting it to ActivityEntityType
// for recordActivity's parentEntityType is always valid even though TS can't see that from the
// wider Prisma type alone.

export { findEntityTenantId, isSupportedCrossModuleEntityType as isSupportedTagEntityType } from './entityLookup.js';

// All tag names for the tenant, for autocomplete — free-form tags (backlog
// QA, 2026-08-27), so there's no fixed catalog to manage, just whatever's
// already been typed somewhere.
export async function listTagDefinitions(tenantId: string) {
  return prisma.tagDefinition.findMany({
    where: { tenantId },
    orderBy: { name: 'asc' },
  });
}

export async function listTagsForEntity(tenantId: string, entityType: EntityType, entityId: string) {
  const assignments = await prisma.tagAssignment.findMany({
    where: { tenantId, entityType, entityId },
    include: { tagDefinition: true },
    orderBy: { tagDefinition: { name: 'asc' } },
  });
  return assignments.map((a) => ({ tagAssignmentId: a.id, tagDefinitionId: a.tagDefinitionId, name: a.tagDefinition.name }));
}

// Batch version for list-view chip display/filtering — same shape as
// listCustomFieldValuesForEntities, one query for every row on the page
// instead of N.
export async function listTagsForEntities(tenantId: string, entityType: EntityType, entityIds: string[]) {
  if (entityIds.length === 0) return [];
  const assignments = await prisma.tagAssignment.findMany({
    where: { tenantId, entityType, entityId: { in: entityIds } },
    include: { tagDefinition: true },
  });
  return assignments.map((a) => ({
    entityId: a.entityId,
    tagAssignmentId: a.id,
    tagDefinitionId: a.tagDefinitionId,
    name: a.tagDefinition.name,
  }));
}

// Find-or-create by exact name + assign, in one step — the whole point of
// "free-form": typing an existing tag's name reuses it (case-sensitive
// match, same as the @@unique constraint), typing a new one creates it.
// Idempotent: assigning a tag the entity already has is a no-op, not an
// error, since the UI's "add on Enter" flow can't easily pre-check itself.
export async function assignTag(
  tenantId: string,
  entityType: EntityType,
  entityId: string,
  tagName: string,
  changedByUserId: string,
) {
  const name = tagName.trim();
  const tagDefinition = await prisma.tagDefinition.upsert({
    where: { tenantId_name: { tenantId, name } },
    create: { tenantId, name },
    update: {},
  });

  const existingAssignment = await prisma.tagAssignment.findUnique({
    where: { tagDefinitionId_entityType_entityId: { tagDefinitionId: tagDefinition.id, entityType, entityId } },
  });

  const assignment = await prisma.tagAssignment.upsert({
    where: { tagDefinitionId_entityType_entityId: { tagDefinitionId: tagDefinition.id, entityType, entityId } },
    create: { tenantId, tagDefinitionId: tagDefinition.id, entityType, entityId },
    update: {},
  });

  // The upsert above is a documented no-op when the entity already has this tag (re-adding on a
  // double-submit) — only log Activity when a row was actually created, or a no-op still shows up
  // as a duplicate "Created Tag X" entry.
  if (!existingAssignment) {
    await recordActivity({
      tenantId,
      entityType: 'tag',
      entityId: assignment.id,
      entityLabel: `${tagDefinition.name} (${entityType})`,
      action: 'create',
      changedByUserId,
      after: { name: tagDefinition.name },
      fieldConfig: tagActivityFieldConfig,
      parentEntityType: entityType as ActivityEntityType,
      parentEntityId: entityId,
    });
  }

  return { tagAssignmentId: assignment.id, tagDefinitionId: tagDefinition.id, name: tagDefinition.name };
}

export async function findTagAssignmentById(id: string) {
  return prisma.tagAssignment.findUnique({ where: { id } });
}

export async function removeTagAssignment(id: string, changedByUserId: string): Promise<void> {
  const existing = await prisma.tagAssignment.findUnique({ where: { id }, include: { tagDefinition: true } });
  await prisma.tagAssignment.delete({ where: { id } });

  if (existing) {
    await recordActivity({
      tenantId: existing.tenantId,
      entityType: 'tag',
      entityId: id,
      entityLabel: `${existing.tagDefinition.name} (${existing.entityType})`,
      action: 'delete',
      changedByUserId,
      before: { name: existing.tagDefinition.name },
      fieldConfig: tagActivityFieldConfig,
      parentEntityType: existing.entityType as ActivityEntityType,
      parentEntityId: existing.entityId,
    });
  }
}
