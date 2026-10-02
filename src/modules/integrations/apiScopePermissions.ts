import type { ActivityEntityType } from '@prisma/client';
import {
  canManageCompany,
  canManageContact,
  canManageCustomFields,
  canManageEmployee,
  canManageOpportunity,
  canManagePayroll,
  canViewCompany,
  canViewContact,
  canViewEmployee,
  canViewOpportunity,
} from '../auth/permissionService.js';
import { getEmployeeScope, type RoleContext } from '../auth/roleService.js';
import { API_SCOPES, type ApiScope } from '../../lib/externalApiAuth.js';

// Which Private API scopes a user may put on a key they create (2026-10-02 fix). Before this, a
// custom role granted manage_api_access could mint a key with ANY scope — e.g. a role with no
// Payroll access creating `hr.payroll:read` and reading payroll through the API. Now a key can only
// carry what its creator could already do in the app. Each check mirrors the gate the matching
// internal route uses (routes/employees.ts, timeOff.ts, payroll.ts, companies/contacts/
// opportunities.ts). Owners pass everything, so nothing changes for them.
//
// A key returns whole records for the entire tenant — it has no per-row Employee scope and no
// field-level redaction — so a scope is only grantable when the creator sees ALL of that data:
// Employee scope `all` for the HR scopes, and no hidden fields on that entity for its read scope.
// Tasks/Notes have no module permission of their own in the app (any member can read/write them on
// a record), so those scopes stay open to anyone allowed to manage keys.

function seesWholeEntity(role: RoleContext, entityType: ActivityEntityType): boolean {
  if (role.isOwner) return true;
  const hidden = role.hiddenFieldsByEntity.get(entityType);
  return !hidden || hidden.size === 0;
}

function seesAllEmployees(role: RoleContext): boolean {
  return getEmployeeScope(role) === 'all' && seesWholeEntity(role, 'employee');
}

const SCOPE_RULES: Record<ApiScope, (role: RoleContext) => boolean> = {
  'hr.employees:read': (role) => canViewEmployee(role) && seesAllEmployees(role),
  'hr.employees:write': (role) => canManageEmployee(role) && seesAllEmployees(role),
  // The app only lists every employee's time off (scope=all) and administers time off with
  // manage_custom_fields; the API reads all requests and creates them for any employee.
  'hr.timeoff:read': (role) => canManageCustomFields(role),
  'hr.timeoff:write': (role) => canManageCustomFields(role),
  'hr.payroll:read': (role) => canManagePayroll(role),
  'crm.companies:read': (role) => canViewCompany(role) && seesWholeEntity(role, 'company'),
  'crm.companies:write': (role) => canManageCompany(role) && seesWholeEntity(role, 'company'),
  'crm.contacts:read': (role) => canViewContact(role) && seesWholeEntity(role, 'contact'),
  'crm.contacts:write': (role) => canManageContact(role) && seesWholeEntity(role, 'contact'),
  'crm.opportunities:read': (role) => canViewOpportunity(role) && seesWholeEntity(role, 'opportunity'),
  'crm.opportunities:write': (role) => canManageOpportunity(role) && seesWholeEntity(role, 'opportunity'),
  'crm.pipelines:read': (role) => canViewOpportunity(role),
  'tasks:read': () => true,
  'tasks:write': () => true,
  'notes:read': () => true,
  'notes:write': () => true,
};

export function canGrantApiScope(role: RoleContext, scope: ApiScope): boolean {
  return SCOPE_RULES[scope](role);
}

export function listGrantableApiScopes(role: RoleContext): ApiScope[] {
  return API_SCOPES.filter((scope) => canGrantApiScope(role, scope));
}

// What an AI assistant token may call (spec-mcp-server.md §2b). Unlike a key, it acts as one
// person, so it doesn't need to see whole entities: the handlers narrow employees to the user's
// Employee scope and redact their hidden fields, same as the app — a module permission is enough.
// Time Off is open to everyone because the handlers limit a user without manage_custom_fields to
// their OWN requests (and deciding to the requests they're the approver for).
const AI_SCOPE_RULES: Record<ApiScope, (role: RoleContext) => boolean> = {
  'hr.employees:read': (role) => canViewEmployee(role),
  'hr.employees:write': (role) => canManageEmployee(role),
  'hr.timeoff:read': () => true,
  'hr.timeoff:write': () => true,
  'hr.payroll:read': (role) => canManagePayroll(role),
  'crm.companies:read': (role) => canViewCompany(role),
  'crm.companies:write': (role) => canManageCompany(role),
  'crm.contacts:read': (role) => canViewContact(role),
  'crm.contacts:write': (role) => canManageContact(role),
  'crm.opportunities:read': (role) => canViewOpportunity(role),
  'crm.opportunities:write': (role) => canManageOpportunity(role),
  'crm.pipelines:read': (role) => canViewOpportunity(role),
  'tasks:read': () => true,
  'tasks:write': () => true,
  'notes:read': () => true,
  'notes:write': () => true,
};

export function aiScopesForRole(role: RoleContext): ApiScope[] {
  return API_SCOPES.filter((scope) => AI_SCOPE_RULES[scope](role));
}
