import { beforeEach, describe, expect, it, vi } from 'vitest';

let employees: { id: string; tenantId: string; managerId: string | null; departmentId: string | null; userId?: string | null }[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    employee: {
      findMany: vi.fn(async ({ where }: any) => employees.filter((e) => e.tenantId === where.tenantId)),
      findUnique: vi.fn(async ({ where }: any) => {
        if ('userId' in where) return employees.find((e) => e.userId === where.userId) ?? null;
        return employees.find((e) => e.id === where.id) ?? null;
      }),
    },
  },
}));

import { getManagedEmployeeIds, resolveVisibleEmployeeIds } from '../src/modules/hr/employeeService.js';
import type { RoleContext } from '../src/modules/auth/roleService.js';

function roleContext(overrides: Partial<RoleContext>): RoleContext {
  return { id: 'test-role', name: 'Test', isOwner: false, permissions: new Set(), hiddenFieldsByEntity: new Map(), ...overrides };
}

describe('employeeService — Custom Roles Fase E (HR scope)', () => {
  beforeEach(() => {
    employees = [];
  });

  describe('getManagedEmployeeIds', () => {
    it('includes the acting employee themselves', async () => {
      employees = [{ id: 'e1', tenantId: 't1', managerId: null, departmentId: null }];
      const result = await getManagedEmployeeIds('t1', 'e1');
      expect(result).toEqual(new Set(['e1']));
    });

    it('includes every peer sharing the same department', async () => {
      employees = [
        { id: 'e1', tenantId: 't1', managerId: null, departmentId: 'sales' },
        { id: 'e2', tenantId: 't1', managerId: null, departmentId: 'sales' },
        { id: 'e3', tenantId: 't1', managerId: null, departmentId: 'engineering' },
      ];
      const result = await getManagedEmployeeIds('t1', 'e1');
      expect(result).toEqual(new Set(['e1', 'e2']));
    });

    it('includes direct and indirect reports (reporting chain descendants)', async () => {
      employees = [
        { id: 'manager', tenantId: 't1', managerId: null, departmentId: null },
        { id: 'direct-report', tenantId: 't1', managerId: 'manager', departmentId: null },
        { id: 'indirect-report', tenantId: 't1', managerId: 'direct-report', departmentId: null },
        { id: 'unrelated', tenantId: 't1', managerId: null, departmentId: null },
      ];
      const result = await getManagedEmployeeIds('t1', 'manager');
      expect(result).toEqual(new Set(['manager', 'direct-report', 'indirect-report']));
    });

    it('unions department peers and reporting-chain descendants without duplicates', async () => {
      employees = [
        { id: 'manager', tenantId: 't1', managerId: null, departmentId: 'sales' },
        { id: 'dept-peer', tenantId: 't1', managerId: null, departmentId: 'sales' },
        { id: 'report-in-other-dept', tenantId: 't1', managerId: 'manager', departmentId: 'engineering' },
        { id: 'unrelated', tenantId: 't1', managerId: null, departmentId: 'engineering' },
      ];
      const result = await getManagedEmployeeIds('t1', 'manager');
      expect(result).toEqual(new Set(['manager', 'dept-peer', 'report-in-other-dept']));
    });

    it('does not leak employees from another tenant', async () => {
      employees = [
        { id: 'e1', tenantId: 't1', managerId: null, departmentId: 'sales' },
        { id: 'other-tenant-e1', tenantId: 't2', managerId: null, departmentId: 'sales' },
      ];
      const result = await getManagedEmployeeIds('t1', 'e1');
      expect(result).toEqual(new Set(['e1']));
    });

    it('does not loop forever on a cyclical managerId chain (defensive, should not exist in real data)', async () => {
      employees = [
        { id: 'a', tenantId: 't1', managerId: 'b', departmentId: null },
        { id: 'b', tenantId: 't1', managerId: 'a', departmentId: null },
      ];
      const result = await getManagedEmployeeIds('t1', 'a');
      expect(result).toEqual(new Set(['a', 'b']));
    });
  });

  describe('resolveVisibleEmployeeIds', () => {
    it('returns null (no filtering) for scope "all"', async () => {
      const role = roleContext({ permissions: new Set(['view_employee_scope:all']) });
      const result = await resolveVisibleEmployeeIds('t1', role, 'user-1');
      expect(result).toBeNull();
    });

    it('owner always resolves to null (bypasses scope entirely), even with no permission rows', async () => {
      const role = roleContext({ isOwner: true });
      const result = await resolveVisibleEmployeeIds('t1', role, 'user-1');
      expect(result).toBeNull();
    });

    it('scope "self" resolves to just the acting user\'s own Employee id', async () => {
      employees = [{ id: 'e1', tenantId: 't1', managerId: null, departmentId: null, userId: 'user-1' }];
      const role = roleContext({ permissions: new Set(['view_employee_scope:self']) });
      const result = await resolveVisibleEmployeeIds('t1', role, 'user-1');
      expect(result).toEqual(new Set(['e1']));
    });

    it('scope "self" with no linked Employee resolves to an empty set, not an error', async () => {
      const role = roleContext({ permissions: new Set(['view_employee_scope:self']) });
      const result = await resolveVisibleEmployeeIds('t1', role, 'user-with-no-employee');
      expect(result).toEqual(new Set());
    });

    it('scope "department" delegates to getManagedEmployeeIds for the acting user\'s own Employee', async () => {
      employees = [
        { id: 'manager', tenantId: 't1', managerId: null, departmentId: null, userId: 'user-1' },
        { id: 'report', tenantId: 't1', managerId: 'manager', departmentId: null },
      ];
      const role = roleContext({ permissions: new Set(['view_employee_scope:department']) });
      const result = await resolveVisibleEmployeeIds('t1', role, 'user-1');
      expect(result).toEqual(new Set(['manager', 'report']));
    });

    it('no scope permission at all ("none") resolves to an empty set', async () => {
      employees = [{ id: 'e1', tenantId: 't1', managerId: null, departmentId: null, userId: 'user-1' }];
      const role = roleContext({ permissions: new Set() });
      const result = await resolveVisibleEmployeeIds('t1', role, 'user-1');
      expect(result).toEqual(new Set());
    });
  });
});
