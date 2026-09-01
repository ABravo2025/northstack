import { beforeEach, describe, expect, it, vi } from 'vitest';

let roles: any[] = [];
let permissionRows: any[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    role: {
      findUnique: vi.fn(async ({ where }: any) => {
        const role = roles.find((r) => r.id === where.id);
        if (!role) return null;
        return { ...role, modulePermissions: permissionRows.filter((p) => p.roleId === role.id) };
      }),
      findMany: vi.fn(async ({ where }: any) =>
        roles
          .filter((r) => r.tenantId === where.tenantId)
          .map((r) => ({ ...r, modulePermissions: permissionRows.filter((p) => p.roleId === r.id) })),
      ),
    },
    roleModulePermission: {
      upsert: vi.fn(async ({ where, create }: any) => {
        const exists = permissionRows.find((p) => p.roleId === where.roleId_permission.roleId && p.permission === where.roleId_permission.permission);
        if (!exists) permissionRows.push({ ...create });
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const before = permissionRows.length;
        permissionRows = permissionRows.filter((p) => !(p.roleId === where.roleId && where.permission.in.includes(p.permission)));
        return { count: before - permissionRows.length };
      }),
    },
  },
}));

import { listRolesForTenant, setRolePermission } from '../src/modules/auth/roleManagementService.js';

describe('roleManagementService', () => {
  beforeEach(() => {
    roles = [
      { id: 'role-owner', tenantId: 't1', name: 'Owner', isOwner: true, isEditable: false },
      { id: 'role-admin', tenantId: 't1', name: 'Admin', isOwner: false, isEditable: true },
    ];
    permissionRows = [{ roleId: 'role-admin', tenantId: 't1', permission: 'view_company' }];
  });

  it('lists roles with their permissions', async () => {
    const result = await listRolesForTenant('t1');
    expect(result).toHaveLength(2);
    const admin = result.find((r) => r.id === 'role-admin')!;
    expect(admin.permissions).toEqual(['view_company']);
  });

  it('rejects a permission outside the toggleable allowlist', async () => {
    const result = await setRolePermission('t1', 'role-admin', 'view_employee_scope:all', true);
    expect(result.success).toBe(false);
  });

  it('refuses to change the Owner role', async () => {
    const result = await setRolePermission('t1', 'role-owner', 'manage_users', true);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Owner/);
  });

  it('blocks granting manage_opportunity without its prerequisites', async () => {
    const result = await setRolePermission('t1', 'role-admin', 'manage_opportunity', true);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/view_contact/);
  });

  it('grants manage_opportunity once both prerequisites are present', async () => {
    permissionRows.push({ roleId: 'role-admin', tenantId: 't1', permission: 'view_contact' });
    const result = await setRolePermission('t1', 'role-admin', 'manage_opportunity', true);
    expect(result.success).toBe(true);
    expect(result.permissions).toContain('manage_opportunity');
  });

  it('cascades: revoking view_company also revokes manage_opportunity so it cannot silently reactivate later', async () => {
    permissionRows.push(
      { roleId: 'role-admin', tenantId: 't1', permission: 'view_contact' },
      { roleId: 'role-admin', tenantId: 't1', permission: 'manage_opportunity' },
    );

    const result = await setRolePermission('t1', 'role-admin', 'view_company', false);
    expect(result.success).toBe(true);
    expect(result.permissions).not.toContain('view_company');
    expect(result.permissions).not.toContain('manage_opportunity');
  });
});
