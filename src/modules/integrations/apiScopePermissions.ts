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
  canViewShifts,
  canManageShifts,
  canApproveTimesheets,
  canViewActivityLog,
  canViewProjects,
  canManageProjects,
  canManageUsers,
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
  // A key acts as its creator, and the app's shift/timesheet routes apply their relationship rules
  // to that person — but a company integration should only exist for someone who runs the area.
  'shifts:read': (role) => canViewShifts(role) || canManageShifts(role),
  'shifts:write': (role) => canManageShifts(role),
  'timesheets:read': (role) => canApproveTimesheets(role),
  'timesheets:write': (role) => canApproveTimesheets(role),
  // Names and catalogs only — the same lists every member's pickers already load in the app.
  'workspace:read': () => true,
  'activity:read': (role) => canViewActivityLog(role),
  'users:read': (role) => canManageUsers(role),
  'users:write': (role) => canManageUsers(role),
  'projects:read': (role) => canViewProjects(role),
  'projects:write': (role) => canManageProjects(role),
  // A company integration over attendance is for whoever runs shifts.
  'clock:read': (role) => canManageShifts(role),
  'clock:write': (role) => canManageShifts(role),
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
  // Everyone has their own shifts and timesheet; the delegated routes decide the rest.
  'shifts:read': () => true,
  'shifts:write': () => true,
  'timesheets:read': () => true,
  'timesheets:write': () => true,
  // Same reasoning (2026-10-20): the delegated app routes apply the person's own rules — a
  // member sees the projects they're on, clocks in as themselves, reads only the Activity Log
  // entries their role may see (and the tenant feed only with view_activity_log).
  'workspace:read': () => true,
  'activity:read': () => true,
  // The app's own route requires manage_users; it decides.
  'users:read': () => true,
  'users:write': () => true,
  'projects:read': () => true,
  'projects:write': () => true,
  'clock:read': () => true,
  'clock:write': () => true,
};

export function aiScopesForRole(role: RoleContext): ApiScope[] {
  return API_SCOPES.filter((scope) => AI_SCOPE_RULES[scope](role));
}
