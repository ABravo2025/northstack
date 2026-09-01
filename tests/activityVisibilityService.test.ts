import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveVisibleEmployeeIds = vi.fn();

vi.mock('../src/modules/hr/employeeService.js', () => ({
  resolveVisibleEmployeeIds: (...args: unknown[]) => resolveVisibleEmployeeIds(...args),
}));

import {
  canAccessEntityActivity,
  canViewEntryModule,
  filterActivityEntryForRole,
  isChangeVisible,
} from '../src/modules/activity/activityVisibilityService.js';
import type { ActivityChange, ActivityLogEntryWithUser } from '../src/modules/activity/activityLogService.js';
import { VIEW_COMPANY, VIEW_EMPLOYEE, VIEW_EMPLOYEE_CUSTOM_FIELDS } from '../src/modules/auth/roleService.js';
import type { RoleContext } from '../src/modules/auth/roleService.js';
import type { AuthenticatedUser } from '../src/modules/auth/authService.js';

function roleContext(overrides: Partial<RoleContext>): RoleContext {
  return { id: 'test-role', name: 'Test', isOwner: false, permissions: new Set(), hiddenFieldsByEntity: new Map(), ...overrides };
}

function entry(overrides: Partial<ActivityLogEntryWithUser>): ActivityLogEntryWithUser {
  return {
    id: 'entry-1',
    tenantId: 't1',
    entityType: 'employee' as any,
    entityId: 'e1',
    entityLabel: 'Ana Lopez',
    action: 'update' as any,
    summary: 'Changed Personal email: a@old.com → a@new.com',
    changes: JSON.stringify([{ field: 'personalEmail', label: 'Personal email', oldValue: 'a@old.com', newValue: 'a@new.com' }]),
    changedAt: new Date(),
    changedByUserId: 'u1',
    parentEntityType: null,
    parentEntityId: null,
    changedBy: { id: 'u1', firstName: 'Owner', lastName: 'User' },
    ...overrides,
  } as ActivityLogEntryWithUser;
}

describe('activityVisibilityService — Custom Roles Fase F', () => {
  beforeEach(() => {
    resolveVisibleEmployeeIds.mockReset();
  });

  describe('canViewEntryModule', () => {
    it('owner always sees every entity type', () => {
      const owner = roleContext({ isOwner: true });
      expect(canViewEntryModule(owner, 'employeeCompensation' as any)).toBe(true);
    });

    it('gates a Payroll-adjacent entity type by canManagePayroll', () => {
      const withoutPayroll = roleContext({ permissions: new Set([VIEW_EMPLOYEE]) });
      const withPayroll = roleContext({ permissions: new Set(['manage_payroll']) });
      expect(canViewEntryModule(withoutPayroll, 'employeeCompensation' as any)).toBe(false);
      expect(canViewEntryModule(withPayroll, 'employeeCompensation' as any)).toBe(true);
    });

    it('gates Stripe by canManagePayments', () => {
      const role = roleContext({ permissions: new Set() });
      expect(canViewEntryModule(role, 'stripeConnection' as any)).toBe(false);
      const withPayments = roleContext({ permissions: new Set(['manage_payments']) });
      expect(canViewEntryModule(withPayments, 'stripeConnection' as any)).toBe(true);
    });

    it('leaves ungated entity types (Task/Note) visible regardless of permissions', () => {
      const bareRole = roleContext({ permissions: new Set() });
      expect(canViewEntryModule(bareRole, 'task' as any)).toBe(true);
      expect(canViewEntryModule(bareRole, 'note' as any)).toBe(true);
    });

    it('gates employee by canViewEmployee, same as the entity itself', () => {
      const role = roleContext({ permissions: new Set() });
      expect(canViewEntryModule(role, 'employee' as any)).toBe(false);
    });
  });

  describe('isChangeVisible', () => {
    const change: ActivityChange = { field: 'personalEmail', label: 'Personal email', oldValue: 'a', newValue: 'b' };

    it('owner sees every change', () => {
      expect(isChangeVisible(roleContext({ isOwner: true }), 'employee' as any, change)).toBe(true);
    });

    it('a fixed field hidden by RoleFieldRestriction is not visible', () => {
      const role = roleContext({
        permissions: new Set([VIEW_EMPLOYEE]),
        hiddenFieldsByEntity: new Map([['employee' as any, new Set(['personalEmail'])]]),
      });
      expect(isChangeVisible(role, 'employee' as any, change)).toBe(false);
    });

    it('a fixed field not restricted is visible', () => {
      const role = roleContext({ permissions: new Set([VIEW_EMPLOYEE]) });
      expect(isChangeVisible(role, 'employee' as any, change)).toBe(true);
    });

    it('a custom-field-shaped key on Employee is gated by the custom-fields bundle, not the fixed-field denylist', () => {
      const customFieldChange: ActivityChange = { field: 'a1b2c3d4-custom-field-def-id', label: 'Shirt size', oldValue: 'M', newValue: 'L' };
      const withoutBundle = roleContext({ permissions: new Set([VIEW_EMPLOYEE]) });
      const withBundle = roleContext({ permissions: new Set([VIEW_EMPLOYEE, VIEW_EMPLOYEE_CUSTOM_FIELDS]) });
      expect(isChangeVisible(withoutBundle, 'employee' as any, customFieldChange)).toBe(false);
      expect(isChangeVisible(withBundle, 'employee' as any, customFieldChange)).toBe(true);
    });

    it('a custom-field-shaped key on Company rides the base view permission (decision 2), no separate bundle', () => {
      const customFieldChange: ActivityChange = { field: 'a1b2c3d4-custom-field-def-id', label: 'Industry', oldValue: 'Retail', newValue: 'Tech' };
      const role = roleContext({ permissions: new Set([VIEW_COMPANY]) });
      expect(isChangeVisible(role, 'company' as any, customFieldChange)).toBe(true);
    });
  });

  describe('filterActivityEntryForRole', () => {
    it('passes through untouched when there are no changes at all', () => {
      const e = entry({ changes: null, action: 'create' as any });
      const role = roleContext({ permissions: new Set([VIEW_EMPLOYEE]) });
      const result = filterActivityEntryForRole(e, role);
      expect(result.changes).toBeNull();
      expect(result.summary).toBe(e.summary);
    });

    it('owner sees the original changes and summary untouched', () => {
      const e = entry({});
      const role = roleContext({ isOwner: true });
      const result = filterActivityEntryForRole(e, role);
      expect(result.changes).toEqual(JSON.parse(e.changes!));
      expect(result.summary).toBe(e.summary);
    });

    it('leaves summary untouched when nothing is actually filtered out', () => {
      const e = entry({});
      const role = roleContext({ permissions: new Set([VIEW_EMPLOYEE]) }); // no restriction on personalEmail
      const result = filterActivityEntryForRole(e, role);
      expect(result.changes).toHaveLength(1);
      expect(result.summary).toBe(e.summary); // original stored summary preserved, not recomputed
    });

    it('drops the restricted field and recomputes summary from what remains visible', () => {
      const e = entry({
        changes: JSON.stringify([
          { field: 'personalEmail', label: 'Personal email', oldValue: 'a@old.com', newValue: 'a@new.com' },
          { field: 'nationality', label: 'Nationality', oldValue: 'AR', newValue: 'US' },
        ]),
        summary: 'Changed Personal email and Nationality',
      });
      const role = roleContext({
        permissions: new Set([VIEW_EMPLOYEE]),
        hiddenFieldsByEntity: new Map([['employee' as any, new Set(['personalEmail'])]]),
      });
      const result = filterActivityEntryForRole(e, role);
      expect(result.changes).toEqual([{ field: 'nationality', label: 'Nationality', oldValue: 'AR', newValue: 'US' }]);
      expect(result.summary).toBe('Changed Nationality: AR → US');
    });

    it('falls back to a generic summary when every change gets redacted, never leaking the field name/value', () => {
      const e = entry({});
      const role = roleContext({
        permissions: new Set([VIEW_EMPLOYEE]),
        hiddenFieldsByEntity: new Map([['employee' as any, new Set(['personalEmail'])]]),
      });
      const result = filterActivityEntryForRole(e, role);
      expect(result.changes).toBeNull();
      expect(result.summary).not.toContain('Personal email');
      expect(result.summary).not.toContain('a@new.com');
      expect(result.summary).toBe('Updated Employee "Ana Lopez"');
    });
  });

  describe('canAccessEntityActivity', () => {
    function authUser(overrides: Partial<RoleContext>): AuthenticatedUser {
      return { id: 'u1', tenantId: 't1', roleContext: roleContext(overrides) } as unknown as AuthenticatedUser;
    }

    it('blocks (403) an employee entry when the role lacks view_employee entirely', async () => {
      const user = authUser({ permissions: new Set() });
      const result = await canAccessEntityActivity(user, 'employee' as any, 'e1');
      expect(result).toEqual({ allowed: false, status: 403 });
      expect(resolveVisibleEmployeeIds).not.toHaveBeenCalled();
    });

    it('blocks (404) an employee entry outside the acting user\'s HR scope', async () => {
      resolveVisibleEmployeeIds.mockResolvedValue(new Set(['some-other-employee-id']));
      const user = authUser({ permissions: new Set([VIEW_EMPLOYEE]) });
      const result = await canAccessEntityActivity(user, 'employee' as any, 'e1');
      expect(result).toEqual({ allowed: false, status: 404 });
    });

    it('allows an employee entry inside scope', async () => {
      resolveVisibleEmployeeIds.mockResolvedValue(new Set(['e1']));
      const user = authUser({ permissions: new Set([VIEW_EMPLOYEE]) });
      const result = await canAccessEntityActivity(user, 'employee' as any, 'e1');
      expect(result.allowed).toBe(true);
    });

    it('allows an employee entry when scope is "all" (resolves to null)', async () => {
      resolveVisibleEmployeeIds.mockResolvedValue(null);
      const user = authUser({ isOwner: true });
      const result = await canAccessEntityActivity(user, 'employee' as any, 'e1');
      expect(result.allowed).toBe(true);
    });

    it('gates company/contact/opportunity by their own module permission, no scope check', async () => {
      const withCompany = authUser({ permissions: new Set([VIEW_COMPANY]) });
      const withoutCompany = authUser({ permissions: new Set() });
      expect((await canAccessEntityActivity(withCompany, 'company' as any, 'c1')).allowed).toBe(true);
      expect((await canAccessEntityActivity(withoutCompany, 'company' as any, 'c1')).allowed).toBe(false);
      expect(resolveVisibleEmployeeIds).not.toHaveBeenCalled();
    });
  });
});
