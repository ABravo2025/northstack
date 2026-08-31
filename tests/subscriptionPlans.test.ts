import { beforeEach, describe, expect, it, vi } from 'vitest';

const tenants: any[] = [];
const subscriptions: any[] = [];

vi.mock('../src/lib/prisma.js', () => {
  const mockPrisma: any = {
    tenant: {
      findUnique: vi.fn(async ({ where }: any) => tenants.find((t) => t.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const tenant = tenants.find((t) => t.id === where.id);
        Object.assign(tenant, data);
        return tenant;
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
    subscription: {
      // Billing Integration — runPlanTransitions' Mercado Pago cancellation sweep. None of the
      // pre-existing runPlanTransitions tests in this file seed a Subscription, so this always
      // returns [] for them (0 cancellations) — dedicated coverage lives in its own describe
      // block below.
      findMany: vi.fn(async ({ where }: any) => {
        return subscriptions.filter(
          (s) =>
            s.provider === where.provider &&
            s.status !== 'cancelled' &&
            s.cancellationEffectiveAt &&
            s.cancellationEffectiveAt <= where.cancellationEffectiveAt.lte,
        );
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: any) => {
        const subscription = subscriptions.find((s) => s.tenantId === where.tenantId);
        const tenant = tenants.find((t) => t.id === subscription.tenantId);
        return { ...subscription, tenant: { name: tenant?.name ?? 'Test Tenant' } };
      }),
      // updateTenantPlan also keeps Subscription's own plan/lockedPriceCents in sync
      // (subscriptionService.ts's sync path is cron/webhook-only, this is the separate
      // pre-billing "which plan do you want" write). No-ops if the fixture didn't seed a
      // matching row — none of the updateTenantPlan tests in this file assert on Subscription.
      update: vi.fn(async ({ where, data }: any) => {
        const subscription = subscriptions.find((s) => s.tenantId === where.tenantId);
        if (subscription) {
          Object.assign(subscription, data);
        }
        return subscription;
      }),
      // updateTenantPlan now upserts (not update) so a tenant with no pre-existing Subscription
      // row (predates Billing Integration, backfill script not yet run) is self-healed instead
      // of throwing P2025.
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const subscription = subscriptions.find((s) => s.tenantId === where.tenantId);
        if (subscription) {
          Object.assign(subscription, update);
          return subscription;
        }
        const created = { ...create };
        subscriptions.push(created);
        return created;
      }),
    },
    activityLogEntry: {
      create: vi.fn(async ({ data }: any) => data),
    },
    $transaction: vi.fn(async (fn: any) => fn(mockPrisma)),
    // Mirrors runPlanTransitions' single UPDATE statement: trialing rows whose trialEndsAt has
    // lapsed move to past_due, with gracePeriodEndsAt computed from each row's own trialEndsAt
    // (not a shared constant) — the exact reason that step is raw SQL instead of updateMany.
    // Positional args match the query's two interpolations, in order: gracePeriodDays, now.
    // 2026-08-20: also mirrors the NOT EXISTS guard — a tenant whose Subscription already has a
    // provider (attached a card during a Paddle/Mercado Pago native trial) is left untouched.
    $executeRaw: vi.fn(async (_strings: any, gracePeriodDays: number, now: Date) => {
      let count = 0;
      for (const t of tenants) {
        if (t.status !== 'trialing') continue;
        if (!(t.trialEndsAt <= now)) continue;
        const sub = subscriptions.find((s) => s.tenantId === t.id);
        if (sub?.provider) continue;
        t.status = 'past_due';
        t.gracePeriodEndsAt = new Date(t.trialEndsAt.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);
        count += 1;
      }
      return count;
    }),
  };
  return { default: mockPrisma };
});

// vi.mock factories are hoisted above every top-level const, so the mock function they
// reference must be created via vi.hoisted() rather than a plain const above this call.
const { updatePreapprovalMock } = vi.hoisted(() => ({ updatePreapprovalMock: vi.fn(async () => ({})) }));
vi.mock('../src/lib/mercadopago.js', () => ({
  updatePreapproval: updatePreapprovalMock,
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
    subscriptions.length = 0;
    tenants.push({ id: 't1', plan: null, lockedPriceCents: null, lockedPriceSetAt: null, trialEndsAt: new Date('2026-09-01') });
    subscriptions.push({ tenantId: 't1', plan: 'starter', lockedPriceCents: CURRENT_PLAN_PRICES_CENTS.starter, currency: 'USD' });
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
    subscriptions.length = 0;
    updatePreapprovalMock.mockClear();
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

  it('leaves a lapsed trial untouched if the tenant already attached a provider (Billing Integration, native trial in progress)', async () => {
    tenants.push({ id: 't1', status: 'trialing', trialEndsAt: new Date('2026-08-01'), gracePeriodEndsAt: null });
    subscriptions.push({ tenantId: 't1', provider: 'paddle', status: 'trialing' });

    const result = await runPlanTransitions(new Date('2026-08-02'));

    expect(result.movedToPastDue).toBe(0);
    expect(tenants[0].status).toBe('trialing');
  });

  describe('Mercado Pago cancellation sweep (Billing Integration)', () => {
    it('calls updatePreapproval and cancels a due Mercado Pago subscription', async () => {
      tenants.push({ id: 't1', status: 'active' });
      subscriptions.push({
        tenantId: 't1',
        provider: 'mercadopago',
        status: 'active',
        externalSubscriptionId: 'preapproval-123',
        cancellationEffectiveAt: new Date('2026-08-01'),
      });

      const result = await runPlanTransitions(new Date('2026-08-02'));

      expect(result.cancelledMercadoPagoSubscriptions).toBe(1);
      expect(updatePreapprovalMock).toHaveBeenCalledWith('preapproval-123', { status: 'cancelled' });
      expect(subscriptions[0].status).toBe('cancelled');
      expect(tenants[0].status).toBe('cancelled');
    });

    it('leaves a Mercado Pago subscription untouched before its cancellationEffectiveAt', async () => {
      tenants.push({ id: 't1', status: 'active' });
      subscriptions.push({
        tenantId: 't1',
        provider: 'mercadopago',
        status: 'active',
        externalSubscriptionId: 'preapproval-456',
        cancellationEffectiveAt: new Date('2026-09-01'),
      });

      const result = await runPlanTransitions(new Date('2026-08-02'));

      expect(result.cancelledMercadoPagoSubscriptions).toBe(0);
      expect(updatePreapprovalMock).not.toHaveBeenCalled();
      expect(subscriptions[0].status).toBe('active');
    });

    it('never touches a Paddle subscription — Paddle schedules its own cancellation natively', async () => {
      tenants.push({ id: 't1', status: 'active' });
      subscriptions.push({
        tenantId: 't1',
        provider: 'paddle',
        status: 'active',
        externalSubscriptionId: 'sub_paddle_1',
        cancellationEffectiveAt: new Date('2026-08-01'),
      });

      const result = await runPlanTransitions(new Date('2026-08-02'));

      expect(result.cancelledMercadoPagoSubscriptions).toBe(0);
      expect(updatePreapprovalMock).not.toHaveBeenCalled();
      expect(subscriptions[0].status).toBe('active');
    });
  });
});
