import prisma from '../../lib/prisma.js';
import type { CustomFieldDefinition, CustomFieldValue, EntityType, FieldType } from '@prisma/client';

export interface CreateCustomFieldInput {
  tenantId: string;
  name: string;
  entityType: EntityType;
  fieldType: FieldType;
  options?: string | null;
}

export interface CreateCustomFieldValueInput {
  tenantId: string;
  customFieldDefinitionId: string;
  entityType: EntityType;
  entityId: string;
  value: string;
}

export async function createCustomFieldDefinition(
  input: CreateCustomFieldInput,
): Promise<CustomFieldDefinition> {
  return prisma.customFieldDefinition.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      entityType: input.entityType,
      fieldType: input.fieldType,
      options: input.options,
    },
  });
}

export async function findCustomFieldDefinitionById(
  id: string,
): Promise<CustomFieldDefinition | null> {
  return prisma.customFieldDefinition.findUnique({
    where: { id },
  });
}

export async function listCustomFieldDefinitions(
  tenantId: string,
  entityType: EntityType,
): Promise<CustomFieldDefinition[]> {
  return prisma.customFieldDefinition.findMany({
    where: {
      tenantId,
      entityType,
    },
  });
}

export async function createCustomFieldValue(
  input: CreateCustomFieldValueInput,
): Promise<CustomFieldValue> {
  return prisma.customFieldValue.create({
    data: {
      tenantId: input.tenantId,
      customFieldDefinitionId: input.customFieldDefinitionId,
      entityType: input.entityType,
      entityId: input.entityId,
      value: input.value,
    },
  });
}

export async function findCustomFieldValueById(id: string): Promise<CustomFieldValue | null> {
  return prisma.customFieldValue.findUnique({
    where: { id },
  });
}

export async function updateCustomFieldValue(id: string, value: string): Promise<CustomFieldValue> {
  return prisma.customFieldValue.update({
    where: { id },
    data: { value },
  });
}

export async function listCustomFieldValuesForEntity(
  tenantId: string,
  entityType: EntityType,
  entityId: string,
): Promise<CustomFieldValue[]> {
  return prisma.customFieldValue.findMany({
    where: { tenantId, entityType, entityId },
  });
}

export async function listCustomFieldValuesForEntities(
  tenantId: string,
  entityType: EntityType,
  entityIds: string[],
): Promise<CustomFieldValue[]> {
  if (entityIds.length === 0) {
    return [];
  }

  return prisma.customFieldValue.findMany({
    where: { tenantId, entityType, entityId: { in: entityIds } },
  });
}
