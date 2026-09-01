import type { ActivityEntityType } from '@prisma/client';
import { summarizeChanges, type ActivityChange, type ActivityLogEntryWithUser } from './activityLogService.js';
import { ACTIVITY_FIELD_CONFIGS_BY_ENTITY_TYPE } from './fieldConfigs/index.js';
import { isFieldVisible } from '../auth/fieldVisibilityService.js';
import { resolveVisibleEmployeeIds } from '../hr/employeeService.js';
import {
  canManageBilling,
  canManageCustomFields,
  canManageEmployee,
  canManagePayments,
  canManagePayroll,
  canManageTenantSettings,
  canManageUsers,
  canViewCompany,
  canViewContact,
  canViewEmployee,
  canViewEmployeeCustomFields,
  canViewOpportunity,
} from '../auth/permissionService.js';
import type { RoleContext } from '../auth/roleService.js';
import type { AuthenticatedUser } from '../auth/authService.js';

// Custom Roles Fase F — the module-level gate for the tenant-wide Activity Log feed: an entry
// whose entityType belongs to a module the viewing role can't access at all (e.g.
// compensation/Payroll, Stripe) is dropped from the feed entirely, not just redacted. Mirrors each
// entity's own real access gate elsewhere in the app rather than inventing a parallel permission.
// Entity types with no natural module permission of their own (Task/Note/Tag/SavedView/time off/
// GoogleCalendarConnection) are intentionally absent — they keep today's behavior (visible to
// anyone with view_activity_log), matching their existing no-gate convention on their own tabs.
const ACTIVITY_MODULE_GATE: Partial<Record<ActivityEntityType, (role: RoleContext) => boolean>> = {
  employee: canViewEmployee,
  company: canViewCompany,
  contact: canViewContact,
  opportunity: canViewOpportunity,
  employeeCompensation: canManagePayroll,
  payrollRun: canManagePayroll,
  payFrequency: canManagePayroll,
  paymentMethod: canManagePayroll,
  employeeTermination: canManageEmployee,
  subscription: canManageBilling,
  stripeConnection: canManagePayments,
  statusDefinition: canManageCustomFields,
  customFieldDefinition: canManageCustomFields,
  fieldCatalogDefinition: canManageCustomFields,
  pipeline: canManageCustomFields,
  pipelineStage: canManageCustomFields,
  publicForm: canManageCustomFields,
  tenant: canManageTenantSettings,
  user: canManageUsers,
  invitation: canManageUsers,
};

export function canViewEntryModule(role: RoleContext, entityType: ActivityEntityType): boolean {
  if (role.isOwner) return true;
  const gate = ACTIVITY_MODULE_GATE[entityType];
  return gate ? gate(role) : true;
}

// A custom field change (recordCustomFieldValueActivity) keys `change.field` by the
// CustomFieldDefinition's id, never one of these fixed schema keys — used below to tell "this is a
// fixed field, check the field-level denylist" apart from "this is a custom field, check the
// Employee custom-fields bundle" (Fase D; Company/Contact/Opportunity have no separate bundle —
// decision 2 — so their custom field changes fall through to isFieldVisible, which correctly
// returns true for a key that's never in the denylist).
const EMPLOYEE_FIXED_FIELD_KEYS = new Set(Object.keys(ACTIVITY_FIELD_CONFIGS_BY_ENTITY_TYPE.employee ?? {}));

export function isChangeVisible(role: RoleContext, entityType: ActivityEntityType, change: ActivityChange): boolean {
  if (role.isOwner) return true;
  if (entityType === 'employee' && !EMPLOYEE_FIXED_FIELD_KEYS.has(change.field)) {
    return canViewEmployeeCustomFields(role);
  }
  return isFieldVisible(role, entityType, change.field);
}

// Custom Roles Fase F — parses the stored `changes` JSON and filters it by field-level restriction
// (Fase C) and the Employee custom-fields bundle (Fase D): an `update` entry that touched a field
// this role can't see must not leak it through the Activity feed after the field itself is already
// hidden everywhere else. Whenever filtering removes anything, `summary` is recomputed from the
// visible changes only (never left as the original, which was computed from the full unfiltered set
// and could itself name a hidden field) — summarizeChanges already produces the right generic text
// ("Updated X") when nothing visible remains, so no separate fallback branch is needed.
export function filterActivityEntryForRole(
  entry: ActivityLogEntryWithUser,
  role: RoleContext,
): Omit<ActivityLogEntryWithUser, 'changes'> & { changes: ActivityChange[] | null } {
  const changes: ActivityChange[] | null = entry.changes ? JSON.parse(entry.changes) : null;
  if (role.isOwner || !changes) {
    return { ...entry, changes };
  }

  const visible = changes.filter((change) => isChangeVisible(role, entry.entityType, change));
  if (visible.length === changes.length) {
    return { ...entry, changes };
  }

  return {
    ...entry,
    changes: visible.length > 0 ? visible : null,
    summary: summarizeChanges(visible, entry.action, entry.entityType, entry.entityLabel),
  };
}

export interface EntityActivityAccess {
  allowed: boolean;
  status: 403 | 404;
}

// Custom Roles Fase F — closes a real gap: the per-record Activity route previously had no
// permission/scope check beyond tenant membership (spec-activity-log.md decision #5 assumed "if
// you can open the modal, you see its Activity," but nothing enforced that server-side). Without
// this, any tenant member could request another employee's Activity directly by id and see full
// field-level change history even though the real GET /api/hr/employees/:id would 403/404 them for
// the same record. Mirrors each entity's own access rule exactly — Employee gets the module gate
// AND the Fase E scope check, Company/Contact/Opportunity just their module gate (no scope concept
// for CRM).
export async function canAccessEntityActivity(
  user: AuthenticatedUser,
  entityType: ActivityEntityType,
  entityId: string,
): Promise<EntityActivityAccess> {
  if (entityType === 'employee') {
    if (!canViewEmployee(user.roleContext)) return { allowed: false, status: 403 };
    const visibleIds = await resolveVisibleEmployeeIds(user.tenantId!, user.roleContext, user.id);
    if (visibleIds !== null && !visibleIds.has(entityId)) return { allowed: false, status: 404 };
    return { allowed: true, status: 403 };
  }
  if (entityType === 'company') return { allowed: canViewCompany(user.roleContext), status: 403 };
  if (entityType === 'contact') return { allowed: canViewContact(user.roleContext), status: 403 };
  if (entityType === 'opportunity') return { allowed: canViewOpportunity(user.roleContext), status: 403 };
  return { allowed: true, status: 403 }; // unreachable — isSupportedCrossModuleEntityType only allows the 4 above
}
