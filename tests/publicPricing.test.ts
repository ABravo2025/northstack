import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({ default: {} }));

import { publicPricing } from '../src/modules/tenant/planPriceService.js';
import { PLAN_LIMITS } from '../src/modules/tenant/planLimits.js';
import { PRICING, TRIAL_DAYS } from '../src/config/pricing.js';

// The plans comparison (app PlansModal + landing) renders every number from this response.
describe('GET /api/plans/prices — trial and plan limits (2026-10-14)', () => {
  it('serves the trial length and seat cap from pricing.ts', () => {
    const p = publicPricing();
    expect(p.trialDays).toBe(TRIAL_DAYS);
    expect(p.freeTrialSeatCap).toBe(PRICING.freeTrialSeatCap);
  });

  it('serves each plan exactly as PLAN_LIMITS defines it, minus the trial cap', () => {
    const { limits } = publicPricing();
    for (const plan of ['starter', 'growth'] as const) {
      const { freeTrialSeatCap: _cap, ...expected } = PLAN_LIMITS[plan];
      expect(limits[plan]).toEqual(expected);
      expect(limits[plan]).not.toHaveProperty('freeTrialSeatCap');
    }
    expect(limits.starter.maxActiveLocations).toBe(1);
    expect(limits.growth.maxActiveProjects).toBeNull();
  });
});
