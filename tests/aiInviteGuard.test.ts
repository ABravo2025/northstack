import { describe, expect, it, vi } from 'vitest';

// An AI assistant can't invite into a sensitive role (Alejandro, 2026-10-20): Admin, or any role
// with admin-level or salary/payment permissions — judged by permissions, so renaming doesn't help.

const roles: Record<string, { tenantId: string; name: string; isOwner: boolean; modulePermissions: { permission: string }[] }> = {
  member: { tenantId: 't1', name: 'Member', isOwner: false, modulePermissions: [{ permission: 'view_employee' }] },
  sales: { tenantId: 't1', name: 'Sales', isOwner: false, modulePermissions: [{ permission: 'manage_company' }, { permission: 'invite_users' }] },
  admin: { tenantId: 't1', name: 'Admin', isOwner: false, modulePermissions: [] },
  renamedAdmin: { tenantId: 't1', name: 'Coordinación', isOwner: false, modulePermissions: [{ permission: 'manage_users' }] },
  payroll: { tenantId: 't1', name: 'Contaduría', isOwner: false, modulePermissions: [{ permission: 'manage_payroll' }] },
  payments: { tenantId: 't1', name: 'Cobranzas', isOwner: false, modulePermissions: [{ permission: 'manage_payments' }] },
  otherTenant: { tenantId: 't2', name: 'Admin', isOwner: false, modulePermissions: [] },
};
let seedMemberId = 'member';

vi.mock('../src/lib/prismaExternal.js', () => ({
  default: { role: { findUnique: vi.fn(async ({ where }: any) => roles[where.id] ?? null) } },
}));
vi.mock('../src/modules/auth/roleService.js', () => ({ findSeedRoleId: vi.fn(async () => seedMemberId) }));

import { aiInviteBlockReason } from '../src/modules/integrations/aiInviteGuard.js';

describe('aiInviteBlockReason', () => {
  it('lets ordinary roles through', async () => {
    expect(await aiInviteBlockReason('t1', 'member')).toBeNull();
    expect(await aiInviteBlockReason('t1', 'sales')).toBeNull();
  });

  it('blocks Admin by name and admin-level roles by permission, even renamed', async () => {
    expect(await aiInviteBlockReason('t1', 'admin')).toContain('"Admin"');
    expect(await aiInviteBlockReason('t1', 'renamedAdmin')).toContain('"Coordinación"');
  });

  it('blocks roles with salary or payment access', async () => {
    expect(await aiInviteBlockReason('t1', 'payroll')).toContain('salaries or payments');
    expect(await aiInviteBlockReason('t1', 'payments')).not.toBeNull();
  });

  it('checks the default (seed Member) role when none is given — a tenant may have widened it', async () => {
    seedMemberId = 'member';
    expect(await aiInviteBlockReason('t1', undefined)).toBeNull();
    seedMemberId = 'payroll';
    expect(await aiInviteBlockReason('t1', undefined)).not.toBeNull();
    seedMemberId = 'member';
  });

  it("leaves another tenant's or a missing role to the invitation's own 'Role not found'", async () => {
    expect(await aiInviteBlockReason('t1', 'otherTenant')).toBeNull();
    expect(await aiInviteBlockReason('t1', 'nope')).toBeNull();
  });
});
