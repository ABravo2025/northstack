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
  customFieldDefinitionId: string;
  employeeId: string;
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
      customFieldDefinitionId: input.customFieldDefinitionId,
      employeeId: input.employeeId,
      value: input.value,
    },
  });
}

export async function listCustomFieldValuesForEmployee(
  employeeId: string,
): Promise<CustomFieldValue[]> {
  return prisma.customFieldValue.findMany({
    where: { employeeId },
  });
}
