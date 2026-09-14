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

describe('createInvitation — no Admin-role seat cap (removed 2026-09-14)', () => {
  // See tenantUserService.test.ts's equivalent describe block for why: seatService.ts already
  // bills every seat (any role) automatically past the plan's included count, so a separate,
  // unpayable Admin-role cap was removed as redundant with (and contradictory to) that story.
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

  it('invites a 3rd Admin on Starter fine — no cap', async () => {
    const result = await createInvitation({
      tenantId: 't1', invitedByUserId: 'owner-1', email: 'new@example.com', roleId: 'role-admin',
    });
    expect(result.success).toBe(true);
    expect(result.invitation!.roleId).toBe('role-admin');
  });

  it('the legacy `role: "admin"` path is unrestricted too', async () => {
    const result = await createInvitation({
      tenantId: 't1', invitedByUserId: 'owner-1', email: 'new@example.com', role: 'admin',
    });
    expect(result.success).toBe(true);
  });
});

describe('acceptInvitation — Admin invites always accept (no seat re-check)', () => {
  beforeEach(() => {
    tenants = { t1: { id: 't1', name: 'Acme', plan: 'starter' } };
    activeUsers = [{ tenantId: 't1', status: 'active', roleName: 'Admin' }, { tenantId: 't1', status: 'active', roleName: 'Admin' }];
    pendingInvitations = [];
    acceptTestUser = { id: 'u-accepting', email: 'new@example.com', tenantId: null };
  });

  it('accepts an Admin invite fine even with 2 Admins already active on Starter', async () => {
    acceptTestInvitation = {
      id: 'inv-1', token: 'tok-1', email: 'new@example.com', tenantId: 't1', status: 'pending',
      expiresAt: new Date(Date.now() + 60_000), roleId: 'role-admin', role: 'member',
    };
    const result = await acceptInvitation({ token: 'tok-1', userId: 'u-accepting' });
    expect(result.success).toBe(true);
  });
});
