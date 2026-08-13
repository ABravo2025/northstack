import { beforeEach, describe, expect, it, vi } from 'vitest';

const tenants: any[] = [];

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    tenant: {
      update: vi.fn(async ({ where, data }: any) => {
        const tenant = tenants.find((t) => t.id === where.id);
        Object.assign(tenant, data);
        return tenant;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        return tenants.filter((t) => {
          if (where.status !== t.status) return false;
          if (where.trialEndsAt && !(t.trialEndsAt <= where.trialEndsAt.lte)) return false;
          return true;
        });
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const t of tenants) {
          if (t.status !== where.status) continue;
          if (where.gracePeriodEndsAt && !(t.gracePeriodEndsAt <= where.gracePeriodEndsAt.lte)) continue;
          Object.assign(t, data);
          count += 1;
        }
        return { count };
      }),
    },
  },
}));

import { canManageBilling } from '../src/modules/auth/permissionService.js';
import { CURRENT_PLAN_PRICES_CENTS, updateTenantPlan } from '../src/modules/tenant/planService.js';
import { runPlanTransitions } from '../src/modules/tenant/planTransitionService.js';

describe('canManageBilling', () => {
  it('is owner-only', () => {
    expect(canManageBilling('owner')).toBe(true);
    expect(canManageBilling('admin')).toBe(false);
    expect(canManageBilling('member')).toBe(false);
  });
});

describe('updateTenantPlan', () => {
  beforeEach(() => {
    tenants.length = 0;
    tenants.push({ id: 't1', plan: null, lockedPriceCents: null, lockedPriceSetAt: null, trialEndsAt: new Date('2026-09-01') });
  });

  it('rejects scale — no self-serve checkout for it yet', async () => {
    const result = await updateTenantPlan('t1', 'scale' as any);
    expect(result.success).toBe(false);
  });

  it('locks the current server-side price for starter/growth and never touches trialEndsAt', async () => {
    const trialEndsAtBefore = tenants[0].trialEndsAt;

    const result = await updateTenantPlan('t1', 'growth');
    expect(result.success).toBe(true);
    expect(result.tenant?.plan).toBe('growth');
    expect(result.tenant?.lockedPriceCents).toBe(CURRENT_PLAN_PRICES_CENTS.growth);
    expect(result.tenant?.lockedPriceSetAt).toBeInstanceOf(Date);
    expect(result.tenant?.trialEndsAt).toBe(trialEndsAtBefore);
  });

  it('re-pricing on a second call updates the locked price to whatever the new plan costs', async () => {
    await updateTenantPlan('t1', 'starter');
    expect(tenants[0].lockedPriceCents).toBe(CURRENT_PLAN_PRICES_CENTS.starter);

    await updateTenantPlan('t1', 'growth');
    expect(tenants[0].lockedPriceCents).toBe(CURRENT_PLAN_PRICES_CENTS.growth);
  });
});

describe('runPlanTransitions', () => {
  beforeEach(() => {
    tenants.length = 0;
  });

  it('moves a lapsed trial to past_due and sets a 14-day grace period from its own trialEndsAt', async () => {
    const trialEndsAt = new Date('2026-08-01T00:00:00Z');
    tenants.push({ id: 't1', status: 'trialing', trialEndsAt, gracePeriodEndsAt: null });

    const now = new Date('2026-08-02T00:00:00Z');
    const result = await runPlanTransitions(now);

    expect(result.movedToPastDue).toBe(1);
    expect(tenants[0].status).toBe('past_due');
    expect(tenants[0].gracePeriodEndsAt.toISOString()).toBe(
      new Date(trialEndsAt.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it('leaves a trial that has not lapsed yet untouched', async () => {
    tenants.push({ id: 't1', status: 'trialing', trialEndsAt: new Date('2026-09-01'), gracePeriodEndsAt: null });

    const result = await runPlanTransitions(new Date('2026-08-02'));

    expect(result.movedToPastDue).toBe(0);
    expect(tenants[0].status).toBe('trialing');
  });

  it('moves a past_due tenant whose grace period lapsed to suspended', async () => {
    tenants.push({
      id: 't1',
      status: 'past_due',
      trialEndsAt: new Date('2026-08-01'),
      gracePeriodEndsAt: new Date('2026-08-15'),
    });

    const result = await runPlanTransitions(new Date('2026-08-16'));

    expect(result.movedToSuspended).toBe(1);
    expect(tenants[0].status).toBe('suspended');
  });

  it('running twice on the same day is a no-op the second time (past_due -> suspended)', async () => {
    tenants.push({
      id: 't1',
      status: 'past_due',
      trialEndsAt: new Date('2026-08-01'),
      gracePeriodEndsAt: new Date('2026-08-15'),
    });
    const now = new Date('2026-08-16');

    const first = await runPlanTransitions(now);
    expect(first.movedToSuspended).toBe(1);
    expect(tenants[0].status).toBe('suspended');

    const second = await runPlanTransitions(now);
    expect(second.movedToPastDue).toBe(0);
    expect(second.movedToSuspended).toBe(0);
    expect(tenants[0].status).toBe('suspended');
  });

  it('a single run can cascade a long-lapsed trial straight through to suspended (e.g. the cron missed a while)', async () => {
    tenants.push({ id: 't1', status: 'trialing', trialEndsAt: new Date('2026-08-01'), gracePeriodEndsAt: null });
    // 14 days after trialEndsAt (2026-08-15) is also already in the past by "now" below, so
    // both transitions apply within this one call — idempotency (not "exactly one step per
    // call") is the actual guarantee this function makes.
    const result = await runPlanTransitions(new Date('2026-09-01'));

    expect(result.movedToPastDue).toBe(1);
    expect(result.movedToSuspended).toBe(1);
    expect(tenants[0].status).toBe('suspended');
  });
});
