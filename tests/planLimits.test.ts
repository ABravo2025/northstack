import { beforeEach, describe, expect, it, vi } from 'vitest';

let users: any[] = [];
let invitations: any[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    user: {
      count: vi.fn(
        async ({ where }: any) =>
          users.filter(
            (u) =>
              u.tenantId === where.tenantId &&
              u.status === where.status &&
              u.roleName === where.roleRef.name &&
              (where.id?.not === undefined || u.id !== where.id.not),
          ).length,
      ),
    },
    invitation: {
      count: vi.fn(
        async ({ where }: any) =>
          invitations.filter(
            (i) => i.tenantId === where.tenantId && i.status === where.status && i.roleName === where.roleRef.name,
          ).length,
      ),
    },
  },
}));

import {
  getEffectivePlan,
  getPlanLimits,
  hasAdminSeatAvailable,
  isPaymentsAllowed,
  isPayrollAllowed,
} from '../src/modules/tenant/planLimits.js';

describe('getEffectivePlan', () => {
  it('a null plan (Free Trial, unchosen) resolves to growth — full access while exploring', () => {
    expect(getEffectivePlan({ plan: null })).toBe('growth');
  });

  it('explicit starter resolves to starter', () => {
    expect(getEffectivePlan({ plan: 'starter' })).toBe('starter');
  });

  it('explicit growth resolves to growth', () => {
    expect(getEffectivePlan({ plan: 'growth' })).toBe('growth');
  });

  it('scale (hidden tier, not sold) resolves to growth — no higher tier defined yet', () => {
    expect(getEffectivePlan({ plan: 'scale' })).toBe('growth');
  });

  it('a null tenant (platform staff with no tenantId) resolves to growth, not a crash', () => {
    expect(getEffectivePlan(null)).toBe('growth');
  });
});

describe('getPlanLimits', () => {
  it('starter has the confirmed 2026-09-07 caps', () => {
    const limits = getPlanLimits({ plan: 'starter' });
    expect(limits).toEqual({
      maxPipelines: 2,
      maxTimeOffPolicies: 3,
      maxAdminUsers: 2,
      maxCustomRoles: 2,
      activityLogRetentionDays: 7,
      payrollEnabled: false,
      paymentsEnabled: false,
    });
  });

  it('growth is unlimited on every count-based cap, with Payroll/Payments enabled', () => {
    const limits = getPlanLimits({ plan: 'growth' });
    expect(limits.maxPipelines).toBeNull();
    expect(limits.maxTimeOffPolicies).toBeNull();
    expect(limits.maxCustomRoles).toBeNull();
    expect(limits.maxAdminUsers).toBe(5);
    expect(limits.activityLogRetentionDays).toBe(30);
    expect(limits.payrollEnabled).toBe(true);
    expect(limits.paymentsEnabled).toBe(true);
  });
});

describe('isPayrollAllowed / isPaymentsAllowed', () => {
  it('both are false on Starter', () => {
    expect(isPayrollAllowed({ plan: 'starter' })).toBe(false);
    expect(isPaymentsAllowed({ plan: 'starter' })).toBe(false);
  });

  it('both are true on Growth and on an unchosen Free Trial', () => {
    expect(isPayrollAllowed({ plan: 'growth' })).toBe(true);
    expect(isPaymentsAllowed({ plan: 'growth' })).toBe(true);
    expect(isPayrollAllowed({ plan: null })).toBe(true);
    expect(isPaymentsAllowed({ plan: null })).toBe(true);
  });
});

describe('hasAdminSeatAvailable', () => {
  beforeEach(() => {
    users = [];
    invitations = [];
  });

  it('growth never runs out (maxAdminUsers is a real number, but plenty of headroom by default)', async () => {
    expect(await hasAdminSeatAvailable({ id: 't1', plan: 'growth' })).toBe(true);
  });

  it('starter allows the first 2 admins, blocks the 3rd', async () => {
    expect(await hasAdminSeatAvailable({ id: 't1', plan: 'starter' })).toBe(true);
    users.push({ tenantId: 't1', status: 'active', roleName: 'Admin' });
    expect(await hasAdminSeatAvailable({ id: 't1', plan: 'starter' })).toBe(true);
    users.push({ tenantId: 't1', status: 'active', roleName: 'Admin' });
    expect(await hasAdminSeatAvailable({ id: 't1', plan: 'starter' })).toBe(false);
  });

  it('pending Admin invitations count toward the cap too, not just accepted ones', async () => {
    users.push({ tenantId: 't1', status: 'active', roleName: 'Admin' });
    invitations.push({ tenantId: 't1', status: 'pending', roleName: 'Admin' });
    expect(await hasAdminSeatAvailable({ id: 't1', plan: 'starter' })).toBe(false);
  });

  it('a revoked/accepted (non-pending) invitation never counts', async () => {
    users.push({ tenantId: 't1', status: 'active', roleName: 'Admin' });
    invitations.push({ tenantId: 't1', status: 'revoked', roleName: 'Admin' });
    expect(await hasAdminSeatAvailable({ id: 't1', plan: 'starter' })).toBe(true);
  });

  it('custom roles never count against the Admin cap, even at a huge count', async () => {
    for (let i = 0; i < 10; i += 1) {
      users.push({ tenantId: 't1', status: 'active', roleName: `Custom Role ${i}` });
    }
    expect(await hasAdminSeatAvailable({ id: 't1', plan: 'starter' })).toBe(true);
  });

  it('excludeUserId lets a user already on Admin be excluded from their own count (no-op re-save)', async () => {
    users.push(
      { id: 'u1', tenantId: 't1', status: 'active', roleName: 'Admin' },
      { id: 'u2', tenantId: 't1', status: 'active', roleName: 'Admin' },
    );
    // At the cap (2/2) — without exclusion this would report false even for a harmless re-save.
    expect(await hasAdminSeatAvailable({ id: 't1', plan: 'starter' })).toBe(false);
    expect(await hasAdminSeatAvailable({ id: 't1', plan: 'starter' }, 'u1')).toBe(true);
  });

  it('another tenant\'s admins never count against this one', async () => {
    users.push(
      { tenantId: 't2', status: 'active', roleName: 'Admin' },
      { tenantId: 't2', status: 'active', roleName: 'Admin' },
    );
    expect(await hasAdminSeatAvailable({ id: 't1', plan: 'starter' })).toBe(true);
  });
});
