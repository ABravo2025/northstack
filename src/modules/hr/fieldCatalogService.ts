import prisma from '../../lib/prisma.js';
import type { CatalogKind, FieldCatalogDefinition } from '@prisma/client';

export async function listFieldCatalogDefinitions(
  tenantId: string,
  kind: CatalogKind,
): Promise<FieldCatalogDefinition[]> {
  return prisma.fieldCatalogDefinition.findMany({
    where: { tenantId, kind },
    orderBy: { order: 'asc' },
  });
}

export async function findFieldCatalogDefinitionById(id: string): Promise<FieldCatalogDefinition | null> {
  return prisma.fieldCatalogDefinition.findUnique({ where: { id } });
}

export interface CreateFieldCatalogDefinitionInput {
  tenantId: string;
  kind: CatalogKind;
  name: string;
  order?: number;
}

export async function createFieldCatalogDefinition(
  input: CreateFieldCatalogDefinitionInput,
): Promise<FieldCatalogDefinition> {
  return prisma.fieldCatalogDefinition.create({
    data: {
      tenantId: input.tenantId,
      kind: input.kind,
      name: input.name,
      order: input.order ?? 0,
    },
  });
}

export interface UpdateFieldCatalogDefinitionInput {
  name?: string;
  order?: number;
  isActive?: boolean;
}

export interface FieldCatalogDefinitionUpdateResult {
  success: boolean;
  definition?: FieldCatalogDefinition;
  error?: string;
}

export async function updateFieldCatalogDefinition(
  id: string,
  tenantId: string,
  input: UpdateFieldCatalogDefinitionInput,
): Promise<FieldCatalogDefinitionUpdateResult> {
  const existing = await prisma.fieldCatalogDefinition.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'Not found' };
  }

  const updated = await prisma.fieldCatalogDefinition.update({ where: { id }, data: input });
  return { success: true, definition: updated };
}

// find-or-create by name, used by the department backfill and by public form
// submissions that may reference a catalog entry that doesn't exist yet.
export async function findOrCreateFieldCatalogDefinition(
  tenantId: string,
  kind: CatalogKind,
  name: string,
  order: number,
): Promise<FieldCatalogDefinition> {
  const existing = await prisma.fieldCatalogDefinition.findFirst({ where: { tenantId, kind, name } });
  if (existing) {
    return existing;
  }
  return prisma.fieldCatalogDefinition.create({ data: { tenantId, kind, name, order } });
}
