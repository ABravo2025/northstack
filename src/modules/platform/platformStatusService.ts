import prisma from '../../lib/prisma.js';
import type { PlatformEntityType, PlatformStatusDefinition, Prisma } from '@prisma/client';

export async function listPlatformStatuses(entityType: PlatformEntityType) {
  return prisma.platformStatusDefinition.findMany({
    where: { entityType },
    orderBy: { order: 'asc' },
  });
}

export interface CreatePlatformStatusInput {
  entityType: PlatformEntityType;
  key: string;
  label: string;
  order: number;
  color?: string;
}

export async function createPlatformStatus(input: CreatePlatformStatusInput) {
  return prisma.platformStatusDefinition.create({
    data: {
      entityType: input.entityType,
      key: input.key,
      label: input.label,
      order: input.order,
      color: input.color,
    },
  });
}

export interface UpdatePlatformStatusInput {
  label?: string;
  order?: number;
  color?: string;
  isDefault?: boolean;
  isTerminal?: boolean;
  active?: boolean;
}

export interface UpdatePlatformStatusResult {
  success: boolean;
  status?: PlatformStatusDefinition;
  error?: string;
}

export async function updatePlatformStatus(
  id: string,
  input: UpdatePlatformStatusInput,
): Promise<UpdatePlatformStatusResult> {
  const existing = await prisma.platformStatusDefinition.findUnique({ where: { id } });
  if (!existing) {
    return { success: false, error: 'Status not found' };
  }

  // Same guard as statusService.ts's updateStatusDefinition (the per-tenant
  // equivalent) -- a record always needs a default status to land on.
  // Deactivating a non-default status that's still in use is deliberately
  // allowed here (backend doesn't block it, per the spec -- the frontend
  // confirms first).
  if (input.active === false && existing.isDefault) {
    return { success: false, error: 'Cannot deactivate the default status — set another status as default first' };
  }

  // Whitelist explicitly — never spread req.body straight through.
  const data: Prisma.PlatformStatusDefinitionUncheckedUpdateInput = {};
  if (input.label !== undefined) data.label = input.label;
  if (input.order !== undefined) data.order = input.order;
  if (input.color !== undefined) data.color = input.color;
  if (input.isDefault !== undefined) data.isDefault = input.isDefault;
  if (input.isTerminal !== undefined) data.isTerminal = input.isTerminal;
  if (input.active !== undefined) data.active = input.active;

  const status = await prisma.platformStatusDefinition.update({ where: { id }, data });
  return { success: true, status };
}
