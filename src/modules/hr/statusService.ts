import prisma from '../../lib/prisma.js';
import type { EntityType, StatusDefinition } from '@prisma/client';

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const DEFAULT_STATUSES: Record<EntityType, { name: string; order: number; isDefault: boolean }[]> = {
  employee: [
    { name: 'Active', order: 0, isDefault: true },
    { name: 'Inactive', order: 1, isDefault: false },
    { name: 'Pending', order: 2, isDefault: false },
  ],
  client: [
    { name: 'Prospect', order: 0, isDefault: true },
    { name: 'Active', order: 1, isDefault: false },
    { name: 'Inactive', order: 2, isDefault: false },
    { name: 'Archived', order: 3, isDefault: false },
  ],
};

export async function seedDefaultStatusDefinitions(tx: PrismaTx, tenantId: string): Promise<void> {
  for (const entityType of Object.keys(DEFAULT_STATUSES) as EntityType[]) {
    for (const def of DEFAULT_STATUSES[entityType]) {
      await tx.statusDefinition.create({
        data: { tenantId, entityType, name: def.name, order: def.order, isDefault: def.isDefault },
      });
    }
  }
}

export async function getDefaultStatusId(tenantId: string, entityType: EntityType): Promise<string> {
  const def = await prisma.statusDefinition.findFirst({
    where: { tenantId, entityType, isDefault: true },
  });
  if (!def) {
    throw new Error(`No default status configured for tenant ${tenantId} / ${entityType}`);
  }
  return def.id;
}

export interface CreateStatusDefinitionInput {
  tenantId: string;
  entityType: EntityType;
  name: string;
  color?: string | null;
  order?: number;
  isDefault?: boolean;
}

export async function createStatusDefinition(input: CreateStatusDefinitionInput): Promise<StatusDefinition> {
  if (input.isDefault) {
    await prisma.statusDefinition.updateMany({
      where: { tenantId: input.tenantId, entityType: input.entityType },
      data: { isDefault: false },
    });
  }

  return prisma.statusDefinition.create({
    data: {
      tenantId: input.tenantId,
      entityType: input.entityType,
      name: input.name,
      color: input.color,
      order: input.order ?? 0,
      isDefault: input.isDefault ?? false,
    },
  });
}

export async function listStatusDefinitions(
  tenantId: string,
  entityType: EntityType,
): Promise<StatusDefinition[]> {
  return prisma.statusDefinition.findMany({
    where: { tenantId, entityType },
    orderBy: { order: 'asc' },
  });
}

export async function findStatusDefinitionById(id: string): Promise<StatusDefinition | null> {
  return prisma.statusDefinition.findUnique({ where: { id } });
}

export interface UpdateStatusDefinitionInput {
  name?: string;
  color?: string | null;
  order?: number;
  isDefault?: boolean;
  isActive?: boolean;
}

export interface StatusDefinitionUpdateResult {
  success: boolean;
  statusDefinition?: StatusDefinition;
  error?: string;
}

export async function updateStatusDefinition(
  id: string,
  tenantId: string,
  input: UpdateStatusDefinitionInput,
): Promise<StatusDefinitionUpdateResult> {
  const existing = await prisma.statusDefinition.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'Status not found' };
  }

  if (input.isActive === false && existing.isDefault) {
    return {
      success: false,
      error: 'Cannot deactivate the default status — set another status as default first',
    };
  }

  if (input.isDefault) {
    await prisma.statusDefinition.updateMany({
      where: { tenantId: existing.tenantId, entityType: existing.entityType, NOT: { id } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.statusDefinition.update({ where: { id }, data: input });
  return { success: true, statusDefinition: updated };
}

export async function recordStatusChange(input: {
  tenantId: string;
  entityType: EntityType;
  entityId: string;
  fromStatusName: string | null;
  toStatusName: string;
  changedByUserId: string;
}): Promise<void> {
  await prisma.statusHistoryEntry.create({
    data: {
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      fromStatusName: input.fromStatusName,
      toStatusName: input.toStatusName,
      changedByUserId: input.changedByUserId,
    },
  });
}
