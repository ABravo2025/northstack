import type { ActivityEntityType } from '@prisma/client';
import { ACTIVITY_FIELD_CONFIGS_BY_ENTITY_TYPE } from '../activity/fieldConfigs/index.js';
import { canViewCompany, canViewContact, canViewEmployee, canViewOpportunity } from './permissionService.js';
import type { RoleContext } from './roleService.js';

// Custom Roles Fase C — field-level visibility for the FIXED schema fields of Employee/Company/
// Contact/Opportunity (custom fields are a separate all-or-nothing bundle, Fase D — see
// docs/tareas/backlog.md decision 2). Reuses the Activity Log field-config catalog as the source
// of "what fields exist" rather than a parallel one.

// The primary identifying field(s) of each entity are deliberately excluded from what a role can
// restrict — hiding "the name" would leave list rows and search with nothing to display at all,
// which isn't a real privacy control, just a broken UI. Everything else about these entities
// (personalEmail, birthdate, amountCents, billingAddress, ...) is fair game.
const UNRESTRICTABLE_FIELDS_BY_ENTITY_TYPE: Partial<Record<ActivityEntityType, string[]>> = {
  employee: ['firstName', 'lastName'],
  company: ['name'],
  contact: ['firstName', 'lastName'],
  opportunity: ['name'],
};

// What "restrictable field" actually means for a given entity type — computed once from the
// Activity Log catalog minus the identity exclusion above, not hand-duplicated. Both the
// enforcement code below and the role-management API (for validating an incoming fieldKey) use
// this same list, so they can never drift apart.
export const RESTRICTABLE_FIELDS_BY_ENTITY_TYPE: Partial<Record<ActivityEntityType, { key: string; label: string }[]>> = Object.fromEntries(
  Object.entries(ACTIVITY_FIELD_CONFIGS_BY_ENTITY_TYPE).map(([entityType, config]) => {
    const excluded = new Set(UNRESTRICTABLE_FIELDS_BY_ENTITY_TYPE[entityType as ActivityEntityType] ?? []);
    return [entityType, Object.entries(config!).filter(([key]) => !excluded.has(key)).map(([key, { label }]) => ({ key, label }))];
  }),
);

// The coarse module-level gate for each entity type — a role failing this can't see ANY field of
// that entity, restricted or not, so field-level restriction rows are irrelevant until this
// passes. Mirrors permissionService.ts's split of the old canViewHr into per-entity permissions.
const MODULE_GATE_BY_ENTITY_TYPE: Partial<Record<ActivityEntityType, (role: RoleContext) => boolean>> = {
  employee: canViewEmployee,
  company: canViewCompany,
  contact: canViewContact,
  opportunity: canViewOpportunity,
};

function hasModuleAccessToEntity(role: RoleContext, entityType: ActivityEntityType): boolean {
  const gate = MODULE_GATE_BY_ENTITY_TYPE[entityType];
  return gate ? gate(role) : true;
}

// listEmployees/listCompanies/listContacts/listOpportunities all resolve certain FK fields to a
// nested relation object in the same response (e.g. Company.sizeId -> `sizeDefn: {id, name}`) —
// nulling just the raw id field and leaving the resolved object in place would still leak the
// human-readable value straight through it. Whenever a restrictable field's companion relation key
// is present on the entity, it gets nulled out alongside the id itself.
const RELATION_KEYS_BY_FIELD: Partial<Record<ActivityEntityType, Record<string, string>>> = {
  employee: { departmentId: 'departmentDefn', jobTitleId: 'jobTitleDefn', statusId: 'statusDefn', managerId: 'manager' },
  company: { sizeId: 'sizeDefn', accountOwnerId: 'accountOwner', parentCompanyId: 'parentCompany' },
  contact: { companyId: 'company', leadSourceId: 'leadSource' },
  opportunity: { companyId: 'company', pipelineId: 'pipeline', stageId: 'stage', ownerId: 'owner' },
};

export function isFieldVisible(role: RoleContext, entityType: ActivityEntityType, fieldKey: string): boolean {
  if (role.isOwner) return true;
  if (!hasModuleAccessToEntity(role, entityType)) return false;
  return !role.hiddenFieldsByEntity.get(entityType)?.has(fieldKey);
}

// Nulls out restricted fields rather than deleting the keys, so the response shape stays stable
// for a frontend that already assumes every field is present (matches the precedent in
// tenantMetrics.ts, which nulls the whole `payroll` block for a role without canManagePayroll
// instead of omitting the key).
export function redactEntityFields<T extends Record<string, unknown>>(entity: T, entityType: ActivityEntityType, role: RoleContext): T {
  if (role.isOwner) return entity;
  const restrictable = RESTRICTABLE_FIELDS_BY_ENTITY_TYPE[entityType];
  if (!restrictable) return entity;

  const relationKeys = RELATION_KEYS_BY_FIELD[entityType];
  const clone: Record<string, unknown> = { ...entity };
  for (const { key } of restrictable) {
    if (key in clone && !isFieldVisible(role, entityType, key)) {
      clone[key] = null;
      const relationKey = relationKeys?.[key];
      if (relationKey && relationKey in clone) {
        clone[relationKey] = null;
      }
    }
  }
  return clone as T;
}

export function redactEntityListFields<T extends Record<string, unknown>>(entities: T[], entityType: ActivityEntityType, role: RoleContext): T[] {
  if (role.isOwner) return entities;
  return entities.map((entity) => redactEntityFields(entity, entityType, role));
}
