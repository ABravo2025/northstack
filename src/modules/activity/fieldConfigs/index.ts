import type { ActivityEntityType } from '@prisma/client';
import type { ActivityFieldConfigMap } from '../activityLogService.js';
import { employeeActivityFieldConfig } from './employeeFieldConfig.js';
import { companyActivityFieldConfig } from './companyFieldConfig.js';
import { contactActivityFieldConfig } from './contactFieldConfig.js';
import { opportunityActivityFieldConfig } from './opportunityFieldConfig.js';

// Custom Roles Fase C — the canonical "what fields does this entity have, and what's a
// human-readable label for each" catalog, reused as-is from Activity Log instead of inventing a
// parallel one (docs/tareas/backlog.md "Sistema de roles custom"). No aggregator like this existed
// before Fase C — each Activity Log service just imported its own *FieldConfig file directly.
// Only the 4 Tier-1 entities are registered here for now (the ones field-level restriction
// actually covers) — the other 23 ActivityEntityType values are deliberately left out rather than
// wired up speculatively.
export const ACTIVITY_FIELD_CONFIGS_BY_ENTITY_TYPE: Partial<Record<ActivityEntityType, ActivityFieldConfigMap>> = {
  employee: employeeActivityFieldConfig,
  company: companyActivityFieldConfig,
  contact: contactActivityFieldConfig,
  opportunity: opportunityActivityFieldConfig,
};
