import { describe, expect, it } from 'vitest';
import {
  canCreateHr,
  canEditEmployeeCustomFields,
  canManageApiAccess,
  canManageCustomFields,
  canManagePayments,
  canManagePayroll,
  canViewActivityLog,
  canViewCompany,
  canViewContact,
  canViewDashboards,
  canViewEmployeeCustomFields,
  canViewHr,
  canViewOpportunity,
} from '../src/modules/auth/permissionService.js';
import { ADMIN_SEED_PERMISSIONS, getEmployeeScope, MEMBER_SEED_PERMISSIONS, type RoleContext } from '../src/modules/auth/roleService.js';

// Fase B (Custom Roles) — these functions now read a RoleContext instead of the legacy UserRole
// enum string. Fixtures below reproduce owner/admin/member exactly as seedDefaultRolesForTenant
// would (owner bypasses via isOwner with zero permission rows; admin/member get the real seed
// lists, imported rather than duplicated here so this test can't silently drift from what tenants
// actually get seeded).
function roleContext(overrides: Partial<RoleContext>): RoleContext {
  return {
    id: 'test-role',
    name: 'Test',
    isOwner: false,
    permissions: new Set(),
    hiddenFieldsByEntity: new Map(),
    ...overrides,
  };
}

const owner = roleContext({ isOwner: true });
const admin = roleContext({ permissions: new Set(ADMIN_SEED_PERMISSIONS) });
const member = roleContext({ permissions: new Set(MEMBER_SEED_PERMISSIONS) });

describe('permission service', () => {
  it('allows owner and admin to manage HR and custom fields', () => {
    expect(canViewHr(owner)).toBe(true);
    expect(canCreateHr(owner)).toBe(true);
    expect(canManageCustomFields(owner)).toBe(true);

    expect(canViewHr(admin)).toBe(true);
    expect(canCreateHr(admin)).toBe(true);
    expect(canManageCustomFields(admin)).toBe(true);
  });

  it('allows member to view HR but not manage it', () => {
    expect(canViewHr(member)).toBe(true);
    expect(canCreateHr(member)).toBe(false);
    expect(canManageCustomFields(member)).toBe(false);
  });

  it('restricts Payroll management to owner only, unlike the rest of HR', () => {
    expect(canManagePayroll(owner)).toBe(true);
    expect(canManagePayroll(admin)).toBe(false);
    expect(canManagePayroll(member)).toBe(false);
  });

  it('restricts Payments (Stripe connection + payment visibility) to owner only, same as Payroll', () => {
    expect(canManagePayments(owner)).toBe(true);
    expect(canManagePayments(admin)).toBe(false);
    expect(canManagePayments(member)).toBe(false);
  });

  it('restricts API & webhooks access to owner only by default, same as Payroll/Payments', () => {
    expect(canManageApiAccess(owner)).toBe(true);
    expect(canManageApiAccess(admin)).toBe(false);
    expect(canManageApiAccess(member)).toBe(false);
  });

  it('grants API & webhooks access to a custom role once explicitly toggled on', () => {
    const customRole: RoleContext = { id: 'r1', name: 'Ops', isOwner: false, permissions: new Set(['manage_api_access']), hiddenFieldsByEntity: new Map() };
    expect(canManageApiAccess(customRole)).toBe(true);
  });

  it('allows owner and admin to view the tenant-wide Activity Log, unlike Payroll/Payments', () => {
    expect(canViewActivityLog(owner)).toBe(true);
    expect(canViewActivityLog(admin)).toBe(true);
    expect(canViewActivityLog(member)).toBe(false);
  });

  it('Fase D: the Employee custom-fields bundle matches pre-Fase-D behavior — everyone with view_employee can read them, only owner/admin can write', () => {
    expect(canViewEmployeeCustomFields(owner)).toBe(true);
    expect(canViewEmployeeCustomFields(admin)).toBe(true);
    expect(canViewEmployeeCustomFields(member)).toBe(true);

    expect(canEditEmployeeCustomFields(owner)).toBe(true);
    expect(canEditEmployeeCustomFields(admin)).toBe(true);
    expect(canEditEmployeeCustomFields(member)).toBe(false);
  });

  it('protect-internal-company-data rework: Member no longer sees CRM (Company/Contact/Opportunity) by default', () => {
    expect(canViewCompany(owner)).toBe(true);
    expect(canViewCompany(admin)).toBe(true);
    expect(canViewCompany(member)).toBe(false);

    expect(canViewContact(admin)).toBe(true);
    expect(canViewContact(member)).toBe(false);

    // Derived from Company+Contact view — losing either one (as Member now does, both) means no
    // Opportunity visibility either, with no separate stored permission to grant back accidentally.
    expect(canViewOpportunity(admin)).toBe(true);
    expect(canViewOpportunity(member)).toBe(false);
  });

  it('protect-internal-company-data rework: only Admin+ sees company-wide Dashboards by default, not Member', () => {
    expect(canViewDashboards(owner)).toBe(true);
    expect(canViewDashboards(admin)).toBe(true);
    expect(canViewDashboards(member)).toBe(false);
  });

  it('protect-internal-company-data rework: Member\'s default HR scope is "reports" (self + subordinates), not "all"', () => {
    expect(getEmployeeScope(owner)).toBe('all'); // isOwner bypass, independent of any stored scope key
    expect(getEmployeeScope(admin)).toBe('all');
    expect(getEmployeeScope(member)).toBe('reports');
  });

  it('Fase D: the Employee custom-fields bundle is layered on top of base Employee access, not a substitute for it', () => {
    const roleWithBundleButNoEmployeeAccess = roleContext({
      permissions: new Set(['view_employee_custom_fields', 'edit_employee_custom_fields']),
    });
    expect(canViewEmployeeCustomFields(roleWithBundleButNoEmployeeAccess)).toBe(false);
    expect(canEditEmployeeCustomFields(roleWithBundleButNoEmployeeAccess)).toBe(false);

    const roleWithEmployeeAccessButNoBundle = roleContext({
      permissions: new Set(['view_employee', 'manage_employee']),
    });
    expect(canViewEmployeeCustomFields(roleWithEmployeeAccessButNoBundle)).toBe(false);
    expect(canEditEmployeeCustomFields(roleWithEmployeeAccessButNoBundle)).toBe(false);
  });
});
