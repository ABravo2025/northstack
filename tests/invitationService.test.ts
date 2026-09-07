import { beforeEach, describe, expect, it, vi } from 'vitest';

let tenants: Record<string, any> = {};
let users: Record<string, any> = {};
let roles: Record<string, any> = {};
let createdInvitations: any[] = [];
let activeUsers: { tenantId: string; status: string; roleName: string }[] = [];
let pendingInvitations: { tenantId: string; status: string; roleName: string }[] = [];
// acceptInvitation-only fixtures — kept separate from the createInvitation tests above, which
// need user.findUnique({ where: { email } }) to always resolve null (no existing account yet).
let acceptTestInvitation: any = null;
let acceptTestUser: any = null;

vi.mock('../src/lib/prisma.js', () => {
  const mockPrisma: any = {
    tenant: {
      findUnique: vi.fn(async ({ where }: any) => tenants[where.id] ?? null),
      findUniqueOrThrow: vi.fn(async ({ where }: any) => {
        const found = tenants[where.id];
        if (!found) throw new Error('tenant not found');
        return found;
      }),
    },
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id) return acceptTestUser?.id === where.id ? acceptTestUser : null;
        return null; // no pre-existing user with this email, for createInvitation's tests
      }),
      update: vi.fn(async ({ data }: any) => ({ ...acceptTestUser, ...data })),
      count: vi.fn(
        async ({ where }: any) =>
          activeUsers.filter((u) => u.tenantId === where.tenantId && u.status === where.status && u.roleName === where.roleRef.name)
            .length,
      ),
    },
    role: {
      findUnique: vi.fn(async ({ where }: any) => roles[where.id] ?? null),
    },
    invitation: {
      create: vi.fn(async ({ data }: any) => {
        const invitation = { id: `inv-${createdInvitations.length + 1}`, ...data };
        createdInvitations.push(invitation);
        return invitation;
      }),
      findUnique: vi.fn(async ({ where }: any) => acceptTestInvitation?.token === where.token ? acceptTestInvitation : null),
      update: vi.fn(async ({ data }: any) => ({ ...acceptTestInvitation, ...data })),
      count: vi.fn(
        async ({ where }: any) =>
          pendingInvitations.filter(
            (i) => i.tenantId === where.tenantId && i.status === where.status && i.roleName === where.roleRef.name,
          ).length,
      ),
    },
    employee: {
      update: vi.fn(async ({ data }: any) => data),
    },
    activityLogEntry: {
      create: vi.fn(async () => ({})),
    },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
  };
  return { default: mockPrisma };
});

vi.mock('../src/lib/mailer.js', () => ({
  sendInvitationEmail: vi.fn(async () => {}),
}));

// findSeedRoleId (roleService.js) queries prisma.role.findUnique with a compound tenantId_name key
// — not exercised by the roleId-based tests below, but createInvitation's `role`-only fallback
// path still calls it, so it needs a working mock too.
vi.mock('../src/modules/auth/roleService.js', async () => {
  const actual = await vi.importActual<typeof import('../src/modules/auth/roleService.js')>('../src/modules/auth/roleService.js');
  return { ...actual, findSeedRoleId: vi.fn(async () => 'role-seed-member') };
});

import { acceptInvitation, createInvitation } from '../src/modules/tenant/invitationService.js';

describe('createInvitation — Custom Roles Fase I (roleId assignment)', () => {
  beforeEach(() => {
    tenants = { t1: { id: 't1', name: 'Acme', plan: 'growth' } };
    users = {};
    roles = {
      'role-custom': { id: 'role-custom', tenantId: 't1', name: 'Manager', isOwner: false },
      'role-owner': { id: 'role-owner', tenantId: 't1', name: 'Owner', isOwner: true },
      'role-admin': { id: 'role-admin', tenantId: 't1', name: 'Admin', isOwner: false },
      'role-other-tenant': { id: 'role-other-tenant', tenantId: 't2', name: 'Sneaky', isOwner: false },
    };
    createdInvitations = [];
    activeUsers = [];
    pendingInvitations = [];
    acceptTestInvitation = null;
    acceptTestUser = null;
  });

  it('invites into a genuinely custom role by id, setting the legacy role enum to the member placeholder', async () => {
    const result = await createInvitation({
      tenantId: 't1', invitedByUserId: 'owner-1', email: 'new@example.com', roleId: 'role-custom',
    });
    expect(result.success).toBe(true);
    expect(result.invitation!.roleId).toBe('role-custom');
    expect(result.invitation!.role).toBe('member');
  });

  it('rejects a roleId belonging to another tenant', async () => {
    const result = await createInvitation({
      tenantId: 't1', invitedByUserId: 'owner-1', email: 'new@example.com', roleId: 'role-other-tenant',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('rejects a nonexistent roleId', async () => {
    const result = await createInvitation({
      tenantId: 't1', invitedByUserId: 'owner-1', email: 'new@example.com', roleId: 'role-does-not-exist',
    });
    expect(result.success).toBe(false);
  });

  it('rejects inviting into the Owner role via roleId — ownership is never granted by invitation', async () => {
    const result = await createInvitation({
      tenantId: 't1', invitedByUserId: 'owner-1', email: 'new@example.com', roleId: 'role-owner',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ownership/i);
  });

  it('still supports the legacy enum-only path when roleId is not provided', async () => {
    const result = await createInvitation({
      tenantId: 't1', invitedByUserId: 'owner-1', email: 'new@example.com', role: 'admin',
    });
    expect(result.success).toBe(true);
    expect(result.invitation!.role).toBe('admin');
  });
});

describe('createInvitation — plan-tier admin seat cap (2026-09-07)', () => {
  beforeEach(() => {
    tenants = { t1: { id: 't1', name: 'Acme', plan: 'starter' } };
    users = {};
    roles = {
      'role-admin': { id: 'role-admin', tenantId: 't1', name: 'Admin', isOwner: false },
      'role-custom': { id: 'role-custom', tenantId: 't1', name: 'Manager', isOwner: false },
    };
    createdInvitations = [];
    activeUsers = [{ tenantId: 't1', status: 'active', roleName: 'Admin' }, { tenantId: 't1', status: 'active', roleName: 'Admin' }];
    pendingInvitations = [];
  });

  it('blocks a roleId-based invite into the Admin role once the Starter cap (2) is reached', async () => {
    const result = await createInvitation({
      tenantId: 't1', invitedByUserId: 'owner-1', email: 'new@example.com', roleId: 'role-admin',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Starter plan allows up to 2/);
  });

  it('blocks the legacy `role: "admin"` path too — regression test for the roleDisplayName case mismatch', async () => {
    const result = await createInvitation({
      tenantId: 't1', invitedByUserId: 'owner-1', email: 'new@example.com', role: 'admin',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Starter plan allows up to 2/);
  });

  it('never blocks inviting into a custom (non-Admin) role, even at the Admin cap', async () => {
    const result = await createInvitation({
      tenantId: 't1', invitedByUserId: 'owner-1', email: 'new@example.com', roleId: 'role-custom',
    });
    expect(result.success).toBe(true);
  });

  it('never blocks the legacy `role: "member"` path', async () => {
    const result = await createInvitation({
      tenantId: 't1', invitedByUserId: 'owner-1', email: 'new@example.com', role: 'member',
    });
    expect(result.success).toBe(true);
  });

  it('a pending Admin invite alone (no accepted ones yet) also counts toward the cap', async () => {
    activeUsers = [];
    pendingInvitations = [
      { tenantId: 't1', status: 'pending', roleName: 'Admin' },
      { tenantId: 't1', status: 'pending', roleName: 'Admin' },
    ];
    const result = await createInvitation({
      tenantId: 't1', invitedByUserId: 'owner-1', email: 'new@example.com', roleId: 'role-admin',
    });
    expect(result.success).toBe(false);
  });
});

describe('acceptInvitation — plan-tier admin seat re-check (2026-09-07)', () => {
  beforeEach(() => {
    tenants = { t1: { id: 't1', name: 'Acme', plan: 'starter' } };
    activeUsers = [{ tenantId: 't1', status: 'active', roleName: 'Admin' }, { tenantId: 't1', status: 'active', roleName: 'Admin' }];
    pendingInvitations = [];
    acceptTestUser = { id: 'u-accepting', email: 'new@example.com', tenantId: null };
  });

  // Seats can fill up between an invite going out and it being accepted (another Admin invite
  // accepted first, or a promotion via updateTenantUser) — re-checked here, not just at invite
  // time. Both seats are already taken (activeUsers above), so this must be rejected before ever
  // reaching the $transaction that would otherwise attach the user to the tenant.
  it('rejects accepting an Admin invite once the Starter admin-seat cap has since filled up', async () => {
    acceptTestInvitation = {
      id: 'inv-1', token: 'tok-1', email: 'new@example.com', tenantId: 't1', status: 'pending',
      expiresAt: new Date(Date.now() + 60_000), roleId: 'role-admin', role: 'member',
      roleRef: { name: 'Admin' },
    };
    const result = await acceptInvitation({ token: 'tok-1', userId: 'u-accepting' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Starter plan|admin users/i);
  });

  it('never re-checks (or blocks) accepting a non-Admin invite, even at the Admin cap', async () => {
    acceptTestInvitation = {
      id: 'inv-2', token: 'tok-2', email: 'new@example.com', tenantId: 't1', status: 'pending',
      expiresAt: new Date(Date.now() + 60_000), roleId: 'role-member', role: 'member',
      roleRef: { name: 'Member' },
    };
    const result = await acceptInvitation({ token: 'tok-2', userId: 'u-accepting' });
    expect(result.success).toBe(true);
  });

  it('accepts an Admin invite fine when a seat is actually still open', async () => {
    activeUsers = [{ tenantId: 't1', status: 'active', roleName: 'Admin' }]; // only 1/2 taken
    acceptTestInvitation = {
      id: 'inv-3', token: 'tok-3', email: 'new@example.com', tenantId: 't1', status: 'pending',
      expiresAt: new Date(Date.now() + 60_000), roleId: 'role-admin', role: 'member',
      roleRef: { name: 'Admin' },
    };
    const result = await acceptInvitation({ token: 'tok-3', userId: 'u-accepting' });
    expect(result.success).toBe(true);
  });
});
