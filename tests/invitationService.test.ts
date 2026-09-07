import { beforeEach, describe, expect, it, vi } from 'vitest';

let tenants: Record<string, any> = {};
let users: Record<string, any> = {};
let roles: Record<string, any> = {};
let createdInvitations: any[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    tenant: {
      findUnique: vi.fn(async ({ where }: any) => tenants[where.id] ?? null),
    },
    user: {
      findUnique: vi.fn(async () => null), // no pre-existing user with this email in these tests
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
    },
    activityLogEntry: {
      create: vi.fn(async () => ({})),
    },
  },
}));

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

import { createInvitation } from '../src/modules/tenant/invitationService.js';

describe('createInvitation — Custom Roles Fase I (roleId assignment)', () => {
  beforeEach(() => {
    tenants = { t1: { id: 't1', name: 'Acme' } };
    users = {};
    roles = {
      'role-custom': { id: 'role-custom', tenantId: 't1', name: 'Manager', isOwner: false },
      'role-owner': { id: 'role-owner', tenantId: 't1', name: 'Owner', isOwner: true },
      'role-other-tenant': { id: 'role-other-tenant', tenantId: 't2', name: 'Sneaky', isOwner: false },
    };
    createdInvitations = [];
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
