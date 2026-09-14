import { describe, expect, it } from 'vitest';
import { getEffectivePlan, getPlanLimits, isPaymentsAllowed, isPayrollAllowed } from '../src/modules/tenant/planLimits.js';

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
