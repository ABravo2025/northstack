import { beforeEach, describe, expect, it, vi } from 'vitest';

let users: Record<string, any> = {};
let roles: Record<string, any> = {};

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    user: {
      findUnique: vi.fn(async ({ where }: any) => users[where.id] ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        users[where.id] = { ...users[where.id], ...data };
        return users[where.id];
      }),
    },
    role: {
      findUnique: vi.fn(async ({ where }: any) => roles[where.id] ?? null),
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
      'role-other-tenant': { id: 'role-other-tenant', tenantId: 't2', name: 'Sneaky', isOwner: false },
    };
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
