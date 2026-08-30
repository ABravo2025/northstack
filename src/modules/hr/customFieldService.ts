import prisma from '../../lib/prisma.js';
import type { CustomFieldDefinition, CustomFieldValue, EntityType, FieldType } from '@prisma/client';
import { isEmailFormatValid } from '../../lib/email.js';
import { recordActivity } from '../activity/activityLogService.js';
import { customFieldDefinitionActivityFieldConfig } from '../activity/fieldConfigs/customFieldDefinitionFieldConfig.js';

export interface CreateCustomFieldInput {
  tenantId: string;
  name: string;
  entityType: EntityType;
  fieldType: FieldType;
  options?: string | null;
  required?: boolean;
}

export interface CreateCustomFieldValueInput {
  tenantId: string;
  customFieldDefinitionId: string;
  entityType: EntityType;
  entityId: string;
  value: string;
}

export function isValueValidForFieldType(
  fieldType: FieldType,
  value: string,
  options?: string | null,
): boolean {
  switch (fieldType) {
    case 'number':
      return value.trim() !== '' && !Number.isNaN(Number(value));
    case 'date':
      return !Number.isNaN(Date.parse(value));
    case 'email':
      return isEmailFormatValid(value);
    case 'select': {
      let allowedOptions: string[] = [];
      try {
        allowedOptions = JSON.parse(options || '[]');
      } catch {
        return false;
      }
      return allowedOptions.includes(value);
    }
    case 'text':
    default:
      return true;
  }
}

export async function createCustomFieldDefinition(
  input: CreateCustomFieldInput,
  changedByUserId: string,
): Promise<CustomFieldDefinition> {
  const definition = await prisma.customFieldDefinition.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      entityType: input.entityType,
      fieldType: input.fieldType,
      options: input.options,
      required: input.required ?? false,
    },
  });

  await recordActivity({
    tenantId: input.tenantId,
    entityType: 'customFieldDefinition',
    entityId: definition.id,
    entityLabel: `${definition.name} (${definition.entityType})`,
    action: 'create',
    changedByUserId,
    after: definition,
    fieldConfig: customFieldDefinitionActivityFieldConfig,
  });

  return definition;
}

export async function setCustomFieldDefinitionActive(
  id: string,
  isActive: boolean,
): Promise<CustomFieldDefinition> {
  return prisma.customFieldDefinition.update({
    where: { id },
    data: { isActive },
  });
}

export interface UpdateCustomFieldDefinitionInput {
  name?: string;
  required?: boolean;
  options?: string | null;
  isActive?: boolean;
}

// fieldType is deliberately not editable here — changing it after values
// already exist could leave stored values that no longer match the new
// type (e.g. text -> select with options that don't include the old value).
export async function updateCustomFieldDefinition(
  id: string,
  input: UpdateCustomFieldDefinitionInput,
  changedByUserId: string,
): Promise<CustomFieldDefinition> {
  const existing = await prisma.customFieldDefinition.findUniqueOrThrow({ where: { id } });

  const updated = await prisma.customFieldDefinition.update({
    where: { id },
    data: input,
  });

  await recordActivity({
    tenantId: existing.tenantId,
    entityType: 'customFieldDefinition',
    entityId: id,
    entityLabel: `${updated.name} (${updated.entityType})`,
    action: 'update',
    changedByUserId,
    before: existing,
    after: updated,
    fieldConfig: customFieldDefinitionActivityFieldConfig,
  });

  return updated;
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

export async function deleteCustomFieldValue(id: string): Promise<void> {
  await prisma.customFieldValue.delete({
    where: { id },
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
