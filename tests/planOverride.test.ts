import { describe, expect, it } from 'vitest';
import { activeOverride, getPlanLimits, isApiAccessAllowed, isPayrollAllowed, planFeatures, PLAN_LIMITS } from '../src/modules/tenant/planLimits.js';
import { parseAgreement } from '../src/modules/platform/adminActionService.js';

const now = new Date('2026-10-03T12:00:00Z');
const agreement = (o: Record<string, unknown>) => ({ reason: 'acuerdo', setAt: '2026-10-03T00:00:00Z', setByUserId: 'u', expiresAt: null, modules: {}, limits: {}, ...o });

describe('plan + per-client agreement (getPlanLimits)', () => {
  it('without an agreement it is exactly the plan', () => {
    expect(getPlanLimits({ plan: 'starter', planOverride: null }, now)).toEqual(PLAN_LIMITS.starter);
    expect(getPlanLimits({ plan: 'growth' }, now)).toEqual(PLAN_LIMITS.growth);
  });

  it('turns a module on for Starter or off for Growth', () => {
    const starterWithPayroll = { plan: 'starter' as const, planOverride: agreement({ modules: { payroll: true } }) };
    expect(isPayrollAllowed(starterWithPayroll)).toBe(true);
    expect(planFeatures(starterWithPayroll)).toEqual({ payroll: true, payments: false, apiAccess: false, projectTemplates: false, shiftSkills: false });
    const growthWithoutApi = { plan: 'growth' as const, planOverride: agreement({ modules: { apiAccess: false } }) };
    expect(isApiAccessAllowed(growthWithoutApi)).toBe(false);
    expect(isPayrollAllowed(growthWithoutApi)).toBe(true);
  });

  it('replaces limits (null = unlimited) and the trial user cap', () => {
    const l = getPlanLimits({ plan: 'starter', planOverride: agreement({ limits: { maxPipelines: 5, maxCustomRoles: null } }) }, now);
    expect(l.maxPipelines).toBe(5);
    expect(l.maxCustomRoles).toBeNull();
    expect(l.maxTimeOffPolicies).toBe(PLAN_LIMITS.starter.maxTimeOffPolicies);
    expect(getPlanLimits({ plan: null, planOverride: agreement({ limits: { freeTrialSeatCap: 10 } }) }, now).freeTrialSeatCap).toBe(10);
  });

  it('stops applying the day after it expires', () => {
    const o = agreement({ modules: { payroll: true }, expiresAt: '2026-10-03' });
    expect(activeOverride(o, new Date('2026-10-03T23:00:00Z'))).not.toBeNull();
    expect(activeOverride(o, new Date('2026-10-04T00:00:01Z'))).toBeNull();
    expect(getPlanLimits({ plan: 'starter', planOverride: o }, new Date('2026-10-05T00:00:00Z')).payrollEnabled).toBe(false);
  });

  it('ignores malformed stored values instead of failing', () => {
    expect(getPlanLimits({ plan: 'starter', planOverride: 'garbage' }, now)).toEqual(PLAN_LIMITS.starter);
    const l = getPlanLimits({ plan: 'starter', planOverride: agreement({ modules: { payroll: 'yes', sales: true }, limits: { maxPipelines: -3, freeTrialSeatCap: null } }) }, now);
    expect(l).toEqual(PLAN_LIMITS.starter);
  });
});

describe('parseAgreement (what the Admin sends)', () => {
  it('keeps only real changes ("plan" or empty = as the plan says)', () => {
    const r = parseAgreement({ modules: { payroll: true, payments: 'plan' }, limits: { maxPipelines: '4', maxTimeOffPolicies: '', maxCustomRoles: null }, expiresAt: '2027-03-31' }, now);
    expect(r).toEqual({ ok: true, modules: { payroll: true }, limits: { maxPipelines: 4, maxCustomRoles: null }, expiresAt: '2027-03-31' });
  });
  it('rejects unknown keys, bad numbers and past dates', () => {
    expect(parseAgreement({ modules: { sales: true } }, now).ok).toBe(false);
    expect(parseAgreement({ limits: { maxPipelines: 2.5 } }, now).ok).toBe(false);
    expect(parseAgreement({ limits: { freeTrialSeatCap: null } }, now).ok).toBe(false);
    expect(parseAgreement({ modules: { payroll: true }, expiresAt: '2026-09-01' }, now).ok).toBe(false);
  });
});
