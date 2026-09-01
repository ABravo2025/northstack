import { beforeEach, describe, expect, it, vi } from 'vitest';

let roles: any[] = [];
let permissionRows: any[] = [];
let fieldRestrictionRows: any[] = [];
let users: any[] = [];
let invitations: any[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    role: {
      findUnique: vi.fn(async ({ where }: any) => {
        const role = roles.find((r) => r.id === where.id);
        if (!role) return null;
        return {
          ...role,
          modulePermissions: permissionRows.filter((p) => p.roleId === role.id),
          fieldRestrictions: fieldRestrictionRows.filter((f) => f.roleId === role.id),
        };
      }),
      findMany: vi.fn(async ({ where }: any) =>
        roles
          .filter((r) => r.tenantId === where.tenantId)
          .map((r) => ({
            ...r,
            modulePermissions: permissionRows.filter((p) => p.roleId === r.id),
            fieldRestrictions: fieldRestrictionRows.filter((f) => f.roleId === r.id),
          })),
      ),
      findFirst: vi.fn(async ({ where }: any) =>
        roles.find(
          (r) =>
            r.tenantId === where.tenantId &&
            r.name.toLowerCase() === where.name.equals.toLowerCase() &&
            (!where.id || r.id !== where.id.not),
        ) ?? null,
      ),
      create: vi.fn(async ({ data }: any) => {
        const role = { id: `role-${roles.length + 1}`, ...data };
        roles.push(role);
        return role;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const role = roles.find((r) => r.id === where.id);
        Object.assign(role, data);
        return role;
      }),
      delete: vi.fn(async ({ where }: any) => {
        roles = roles.filter((r) => r.id !== where.id);
      }),
    },
    roleModulePermission: {
      upsert: vi.fn(async ({ where, create }: any) => {
        const exists = permissionRows.find((p) => p.roleId === where.roleId_permission.roleId && p.permission === where.roleId_permission.permission);
        if (!exists) permissionRows.push({ ...create });
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const before = permissionRows.length;
        permissionRows = permissionRows.filter((p) => {
          if (p.roleId !== where.roleId) return true;
          if (where.permission?.in) return !where.permission.in.includes(p.permission);
          return false; // deleteMany({ where: { roleId } }) with no permission filter clears all
        });
        return { count: before - permissionRows.length };
      }),
      createMany: vi.fn(async ({ data }: any) => {
        permissionRows.push(...data);
      }),
    },
    roleFieldRestriction: {
      upsert: vi.fn(async ({ where, create }: any) => {
        const key = where.roleId_entityType_fieldKey;
        const exists = fieldRestrictionRows.find((f) => f.roleId === key.roleId && f.entityType === key.entityType && f.fieldKey === key.fieldKey);
        if (!exists) fieldRestrictionRows.push({ ...create });
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const before = fieldRestrictionRows.length;
        fieldRestrictionRows = fieldRestrictionRows.filter((f) => {
          if (f.roleId !== where.roleId) return true;
          if ('entityType' in where && f.entityType !== where.entityType) return true;
          if ('fieldKey' in where && f.fieldKey !== where.fieldKey) return true;
          return false;
        });
        return { count: before - fieldRestrictionRows.length };
      }),
      createMany: vi.fn(async ({ data }: any) => {
        fieldRestrictionRows.push(...data);
      }),
    },
    user: {
      count: vi.fn(async ({ where }: any) => users.filter((u) => u.roleId === where.roleId).length),
    },
    invitation: {
      count: vi.fn(async ({ where }: any) => invitations.filter((i) => i.roleId === where.roleId && i.status === where.status).length),
    },
  },
}));

import { createRole, deleteRole, listRolesForTenant, renameRole, setRoleFieldRestriction, setRolePermission } from '../src/modules/auth/roleManagementService.js';

describe('roleManagementService', () => {
  beforeEach(() => {
    roles = [
      { id: 'role-owner', tenantId: 't1', name: 'Owner', isOwner: true, isEditable: false },
      { id: 'role-admin', tenantId: 't1', name: 'Admin', isOwner: false, isEditable: true },
    ];
    permissionRows = [{ roleId: 'role-admin', tenantId: 't1', permission: 'view_company' }];
    fieldRestrictionRows = [];
    users = [];
    invitations = [];
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

  it('blocks granting view_employee_custom_fields without view_employee', async () => {
    const result = await setRolePermission('t1', 'role-admin', 'view_employee_custom_fields', true);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/view_employee/);
  });

  it('blocks granting edit_employee_custom_fields without both its prerequisites', async () => {
    permissionRows.push({ roleId: 'role-admin', tenantId: 't1', permission: 'view_employee' });
    // view_employee alone is not enough — still missing view_employee_custom_fields and manage_employee.
    const result = await setRolePermission('t1', 'role-admin', 'edit_employee_custom_fields', true);
    expect(result.success).toBe(false);
  });

  it('cascades transitively: revoking view_employee also revokes view_employee_custom_fields AND edit_employee_custom_fields, two levels down', async () => {
    permissionRows.push(
      { roleId: 'role-admin', tenantId: 't1', permission: 'view_employee' },
      { roleId: 'role-admin', tenantId: 't1', permission: 'manage_employee' },
      { roleId: 'role-admin', tenantId: 't1', permission: 'view_employee_custom_fields' },
      { roleId: 'role-admin', tenantId: 't1', permission: 'edit_employee_custom_fields' },
    );

    const result = await setRolePermission('t1', 'role-admin', 'view_employee', false);
    expect(result.success).toBe(true);
    expect(result.permissions).not.toContain('view_employee');
    expect(result.permissions).not.toContain('view_employee_custom_fields');
    expect(result.permissions).not.toContain('edit_employee_custom_fields');
    // manage_employee has no prerequisite relationship to view_employee, so it's untouched.
    expect(result.permissions).toContain('manage_employee');
  });

  it('creates a new role that persists with a blank permission set', async () => {
    const result = await createRole('t1', 'Sales Manager');
    expect(result.success).toBe(true);
    expect(result.role?.name).toBe('Sales Manager');
    expect(result.role?.permissions).toEqual([]);
    expect(roles.some((r) => r.name === 'Sales Manager')).toBe(true);
  });

  it('duplicates permissions from an existing role when creating', async () => {
    const result = await createRole('t1', 'Junior Admin', 'role-admin');
    expect(result.success).toBe(true);
    expect(result.role?.permissions).toEqual(['view_company']);
  });

  it('duplicating from Owner grants every toggleable permission (Owner itself has no rows)', async () => {
    const result = await createRole('t1', 'Co-Owner-ish', 'role-owner');
    expect(result.success).toBe(true);
    expect(result.role!.permissions.length).toBeGreaterThan(1);
    expect(result.role!.permissions).toContain('manage_payroll');
  });

  it('rejects creating a role named "owner" (case-insensitive)', async () => {
    const result = await createRole('t1', 'OWNER');
    expect(result.success).toBe(false);
  });

  it('rejects creating a role with a name that already exists', async () => {
    const result = await createRole('t1', 'admin');
    expect(result.success).toBe(false);
  });

  it('renames an editable role', async () => {
    const result = await renameRole('t1', 'role-admin', 'Ops');
    expect(result.success).toBe(true);
    expect(roles.find((r) => r.id === 'role-admin')?.name).toBe('Ops');
  });

  it('refuses to rename the Owner role', async () => {
    const result = await renameRole('t1', 'role-owner', 'Not Owner');
    expect(result.success).toBe(false);
  });

  it('deletes an editable role with nobody assigned to it', async () => {
    const result = await deleteRole('t1', 'role-admin');
    expect(result.success).toBe(true);
    expect(roles.some((r) => r.id === 'role-admin')).toBe(false);
  });

  it('refuses to delete a role that still has users assigned', async () => {
    users.push({ id: 'u1', roleId: 'role-admin' });
    const result = await deleteRole('t1', 'role-admin');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/1 user/);
  });

  it('refuses to delete the Owner role', async () => {
    const result = await deleteRole('t1', 'role-owner');
    expect(result.success).toBe(false);
  });

  it('hides a restrictable field for a role', async () => {
    const result = await setRoleFieldRestriction('t1', 'role-admin', 'employee', 'personalEmail', true);
    expect(result.success).toBe(true);
    expect(fieldRestrictionRows).toContainEqual(
      expect.objectContaining({ roleId: 'role-admin', entityType: 'employee', fieldKey: 'personalEmail' }),
    );
  });

  it('un-hides a field by removing its restriction row', async () => {
    fieldRestrictionRows.push({ roleId: 'role-admin', tenantId: 't1', entityType: 'employee', fieldKey: 'personalEmail' });
    const result = await setRoleFieldRestriction('t1', 'role-admin', 'employee', 'personalEmail', false);
    expect(result.success).toBe(true);
    expect(fieldRestrictionRows).toHaveLength(0);
  });

  it('rejects restricting a field that is not in the restrictable catalog (e.g. the identity field)', async () => {
    const result = await setRoleFieldRestriction('t1', 'role-admin', 'employee', 'firstName', true);
    expect(result.success).toBe(false);
  });

  it('rejects restricting a field on the Owner role', async () => {
    const result = await setRoleFieldRestriction('t1', 'role-owner', 'employee', 'personalEmail', true);
    expect(result.success).toBe(false);
  });

  it('is idempotent when creating a role and duplicating includes field restrictions', async () => {
    fieldRestrictionRows.push({ roleId: 'role-admin', tenantId: 't1', entityType: 'employee', fieldKey: 'personalEmail' });
    const result = await createRole('t1', 'Junior Admin', 'role-admin');
    expect(result.success).toBe(true);
    expect(result.role?.hiddenFields).toEqual({ employee: ['personalEmail'] });
  });
});
