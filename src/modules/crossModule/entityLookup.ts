import prisma from '../../lib/prisma.js';
import type { EntityType } from '@prisma/client';

// Entity types Task/Note can attach to today — deliberately narrower than the
// full EntityType enum (no 'client'): only the 4 CRM/HR record types that
// need cross-module attachments; Client is mid-deprecation (see
// docs/tareas-desarrollo.md, Rediseño de Clients). Shared by taskService.ts
// and noteService.ts so this list and the lookup below can't drift between
// the two the way VALID_CATALOG_KINDS once did (see docs/tareas-desarrollo.md).
export const CROSS_MODULE_ENTITY_TYPES: EntityType[] = ['employee', 'company', 'contact', 'opportunity'];

export function isSupportedCrossModuleEntityType(entityType: string): entityType is EntityType {
  return (CROSS_MODULE_ENTITY_TYPES as string[]).includes(entityType);
}

// Same anti-IDOR requirement as every other polymorphic entityId in the app
// (CustomFieldValue, StatusHistoryEntry): verify the referenced record
// actually belongs to this tenant before attaching a Task/Note to it. No FK
// at the DB level, so this has to be checked in code.
export async function findEntityTenantId(entityType: EntityType, entityId: string): Promise<string | null> {
  switch (entityType) {
    case 'employee': {
      const employee = await prisma.employee.findUnique({ where: { id: entityId }, select: { tenantId: true } });
      return employee?.tenantId ?? null;
    }
    case 'company': {
      const company = await prisma.company.findUnique({ where: { id: entityId }, select: { tenantId: true } });
      return company?.tenantId ?? null;
    }
    case 'contact': {
      const contact = await prisma.contact.findUnique({ where: { id: entityId }, select: { tenantId: true } });
      return contact?.tenantId ?? null;
    }
    case 'opportunity': {
      const opportunity = await prisma.opportunity.findUnique({ where: { id: entityId }, select: { tenantId: true } });
      return opportunity?.tenantId ?? null;
    }
    default:
      return null;
  }
}
