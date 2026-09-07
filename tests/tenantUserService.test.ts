import { beforeEach, describe, expect, it, vi } from 'vitest';

let users: Record<string, any> = {};
let roles: Record<string, any> = {};
let tenants: Record<string, any> = {};
let activeAdminUsers: { tenantId: string; roleName: string }[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    user: {
      findUnique: vi.fn(async ({ where }: any) => users[where.id] ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        users[where.id] = { ...users[where.id], ...data };
        return users[where.id];
      }),
      count: vi.fn(
        async ({ where }: any) =>
          activeAdminUsers.filter(
            (u) =>
              u.tenantId === where.tenantId &&
              u.roleName === where.roleRef.name &&
              (where.id === undefined || u.id !== where.id.not),
          ).length,
      ),
    },
    role: {
      findUnique: vi.fn(async ({ where }: any) => roles[where.id] ?? null),
    },
    tenant: {
      findUniqueOrThrow: vi.fn(async ({ where }: any) => {
        const found = tenants[where.id];
        if (!found) throw new Error('tenant not found');
        return found;
      }),
    },
    invitation: {
      count: vi.fn(async () => 0), // no pending invitations relevant to these tests
    },
    activityLogEntry: {
      create: vi.fn(async () => ({})),
    },
    $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
  },
}));

import { updateTenantUser } from '../src/modules/tenant/tenantUserService.js';
import type { AuthenticatedUser } from '../src/modules/auth/authService.js';

function actingUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'acting-user',
    tenantId: 't1',
    roleContext: { id: 'r', name: 'Test', isOwner: false, permissions: new Set(), hiddenFieldsByEntity: new Map() },
    ...overrides,
  } as unknown as AuthenticatedUser;
}

describe('updateTenantUser — Custom Roles Fase I (roleId assignment)', () => {
  beforeEach(() => {
    users = {
      target: { id: 'target', tenantId: 't1', role: 'member', roleId: 'role-member' },
    };
    roles = {
      'role-custom': { id: 'role-custom', tenantId: 't1', name: 'Manager', isOwner: false },
      'role-owner': { id: 'role-owner', tenantId: 't1', name: 'Owner', isOwner: true },
      'role-admin': { id: 'role-admin', tenantId: 't1', name: 'Admin', isOwner: false },
      'role-other-tenant': { id: 'role-other-tenant', tenantId: 't2', name: 'Sneaky', isOwner: false },
    };
    tenants = { t1: { id: 't1', plan: 'growth' } };
    activeAdminUsers = [];
  });

  it('assigns a genuinely custom role by id, setting the legacy role enum to the member placeholder', async () => {
    const result = await updateTenantUser('t1', 'target', actingUser(), { roleId: 'role-custom' });
    expect(result.success).toBe(true);
    expect(result.user!.roleId).toBe('role-custom');
    expect(result.user!.role).toBe('member');
  });

  it('rejects a roleId belonging to another tenant', async () => {
    const result = await updateTenantUser('t1', 'target', actingUser(), { roleId: 'role-other-tenant' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('rejects a nonexistent roleId', async () => {
    const result = await updateTenantUser('t1', 'target', actingUser(), { roleId: 'role-does-not-exist' });
    expect(result.success).toBe(false);
  });

  it('rejects assigning the Owner role via this path, even for an acting Owner — ownership only moves via the dedicated transfer flow', async () => {
    const result = await updateTenantUser('t1', 'target', actingUser({ roleContext: { id: 'o', name: 'Owner', isOwner: true, permissions: new Set(), hiddenFieldsByEntity: new Map() } } as any), {
      roleId: 'role-owner',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ownership transfer/i);
  });

  it('prefers roleId over role when both are somehow present', async () => {
    const result = await updateTenantUser('t1', 'target', actingUser(), { roleId: 'role-custom', role: 'admin' });
    expect(result.success).toBe(true);
    expect(result.user!.roleId).toBe('role-custom');
  });
});

describe('updateTenantUser — plan-tier admin seat cap (2026-09-07)', () => {
  beforeEach(() => {
    users = {
      target: { id: 'target', tenantId: 't1', role: 'member', roleId: 'role-member' },
    };
    roles = {
      'role-admin': { id: 'role-admin', tenantId: 't1', name: 'Admin', isOwner: false },
      'role-custom': { id: 'role-custom', tenantId: 't1', name: 'Manager', isOwner: false },
    };
    tenants = { t1: { id: 't1', plan: 'starter' } };
    activeAdminUsers = [
      { id: 'admin-1', tenantId: 't1', roleName: 'Admin' },
      { id: 'admin-2', tenantId: 't1', roleName: 'Admin' },
    ];
  });

  it('blocks promoting a member to Admin (via roleId) once the Starter cap (2) is reached', async () => {
    const result = await updateTenantUser('t1', 'target', actingUser(), { roleId: 'role-admin' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Starter plan allows up to 2/);
    expect(users.target.roleId).toBe('role-member'); // unchanged
  });

  it('blocks promoting a member to Admin via the legacy `role: "admin"` path too', async () => {
    const result = await updateTenantUser('t1', 'target', actingUser(), { role: 'admin' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Starter plan allows up to 2/);
  });

  it('never blocks assigning a custom (non-Admin) role, even at the cap', async () => {
    const result = await updateTenantUser('t1', 'target', actingUser(), { roleId: 'role-custom' });
    expect(result.success).toBe(true);
  });

  it('re-saving a user already on Admin (e.g. just a status change) is not blocked by their own seat', async () => {
    users.target = { id: 'target', tenantId: 't1', role: 'admin', roleId: 'role-admin' };
    // Exactly at the cap (2), and target IS one of the 2 — excluding target from the count is
    // what makes this a no-op instead of a false block.
    activeAdminUsers = [
      { id: 'admin-1', tenantId: 't1', roleName: 'Admin' },
      { id: 'target', tenantId: 't1', roleName: 'Admin' },
    ];
    const result = await updateTenantUser('t1', 'target', actingUser(), { roleId: 'role-admin', status: 'inactive' });
    expect(result.success).toBe(true);
  });
});
