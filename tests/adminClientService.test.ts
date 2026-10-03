import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { attentionFor, clientStatus, healthScore, monthlyRevenueCents } from '../src/modules/platform/adminClientService.js';

describe('healthScore (40% access, 25% modules, 25% payments, 10% growth)', () => {
  it('weights the four parts as agreed', () => {
    const h = healthScore({ status: 'active', activeUsers: 10, usersSeenLast7d: 5, modulesUsed30d: 2, modulesAvailable: 4, usersNow: 10, users30dAgo: 10 });
    expect(h).toEqual({ access: 50, modules: 50, payments: 100, growth: 50, score: Math.round(50 * 0.4 + 50 * 0.25 + 100 * 0.25 + 50 * 0.1) });
  });

  it('drops payments to 0 when a charge failed and to 50 while cancelling', () => {
    const base = { activeUsers: 4, usersSeenLast7d: 4, modulesUsed30d: 4, modulesAvailable: 4, usersNow: 4, users30dAgo: 4 };
    expect(healthScore({ ...base, status: 'past_due' }).payments).toBe(0);
    expect(healthScore({ ...base, status: 'cancelling' }).payments).toBe(50);
    expect(healthScore({ ...base, status: 'trialing' }).payments).toBe(100);
  });

  it('stays within 0..100 for extreme growth and empty teams', () => {
    expect(healthScore({ status: 'active', activeUsers: 30, usersSeenLast7d: 30, modulesUsed30d: 5, modulesAvailable: 5, usersNow: 30, users30dAgo: 3 }).growth).toBe(100);
    const empty = healthScore({ status: 'trialing', activeUsers: 0, usersSeenLast7d: 0, modulesUsed30d: 0, modulesAvailable: 4, usersNow: 0, users30dAgo: 0 });
    expect(empty.score).toBeGreaterThanOrEqual(0);
    expect(empty.access).toBe(0);
  });
});

describe('clientStatus', () => {
  const now = new Date('2026-10-03T12:00:00Z');
  const paying = { status: 'active' as const, cancelledAt: null, provider: 'dodopayments' };
  it('only calls a client "active" when a payment method is attached', () => {
    expect(clientStatus({ status: 'active', trialEndsAt: null }, paying, now)).toBe('active');
    expect(clientStatus({ status: 'active', trialEndsAt: null }, { ...paying, provider: null }, now)).toBe('no_plan');
    expect(clientStatus({ status: 'trialing', trialEndsAt: new Date('2026-10-10') }, null, now)).toBe('trialing');
    expect(clientStatus({ status: 'trialing', trialEndsAt: new Date('2026-09-10') }, null, now)).toBe('expired');
  });
  it('shows a requested cancellation as "cancelling" and failed charges as "past_due"', () => {
    expect(clientStatus({ status: 'active', trialEndsAt: null }, { ...paying, cancelledAt: new Date() }, now)).toBe('cancelling');
    expect(clientStatus({ status: 'active', trialEndsAt: null }, { ...paying, status: 'past_due' }, now)).toBe('past_due');
    expect(clientStatus({ status: 'suspended', trialEndsAt: null }, paying, now)).toBe('suspended');
  });
});

describe('attentionFor', () => {
  const now = new Date('2026-10-03T12:00:00Z');
  it('flags failed payments, trials ending within 3 days and 7+ days without activity', () => {
    const a = attentionFor({ status: 'trialing', plan: null, trialEndsAt: new Date('2026-10-05T12:00:00Z'), gracePeriodEndsAt: null, lastSeenAt: new Date('2026-09-20T12:00:00Z'), createdAt: new Date('2026-09-19T00:00:00Z'), now });
    expect(a.map((x) => x.kind)).toEqual(['trial_ending', 'inactive']);
    expect(a[0].daysLeft).toBe(2);
    expect(attentionFor({ status: 'past_due', plan: 'starter', trialEndsAt: null, gracePeriodEndsAt: null, lastSeenAt: now, createdAt: now, now })[0].kind).toBe('payment_failed');
  });

  it('does not nag about a healthy client, a suspended one or an expired trial', () => {
    expect(attentionFor({ status: 'expired', plan: null, trialEndsAt: new Date('2026-09-01'), gracePeriodEndsAt: null, lastSeenAt: null, createdAt: new Date('2026-08-01'), now })).toEqual([]);
    expect(attentionFor({ status: 'active', plan: 'growth', trialEndsAt: null, gracePeriodEndsAt: null, lastSeenAt: now, createdAt: now, now })).toEqual([]);
    expect(attentionFor({ status: 'suspended', plan: 'growth', trialEndsAt: null, gracePeriodEndsAt: null, lastSeenAt: null, createdAt: new Date('2026-01-01'), now })).toEqual([]);
  });
});

describe('monthlyRevenueCents', () => {
  const sub = { status: 'active' as const, provider: 'dodopayments', lockedPriceCents: 1200, currency: 'USD', extraSeatPriceCents: 400 };
  it('is the locked base plus extra users at the locked seat price', () => {
    expect(monthlyRevenueCents({ plan: 'starter', activeUsers: 2, sub })).toBe(1200);
    expect(monthlyRevenueCents({ plan: 'starter', activeUsers: 5, sub })).toBe(1200 + 2 * 400);
  });
  it('is zero for trials, cancelled subscriptions and no provider', () => {
    expect(monthlyRevenueCents({ plan: null, activeUsers: 3, sub })).toBe(0);
    expect(monthlyRevenueCents({ plan: 'starter', activeUsers: 3, sub: { ...sub, provider: null } })).toBe(0);
    expect(monthlyRevenueCents({ plan: 'starter', activeUsers: 3, sub: { ...sub, status: 'cancelled' } })).toBe(0);
  });
});

// Access control: every Admin v2 route answers only to platform staff.
vi.mock('../src/modules/auth/authService.js', () => ({
  authenticateToken: vi.fn(async (token: string) => {
    if (token === 'staff') return { id: 's', platformRole: 'platform_admin', tenantId: null };
    if (token === 'customer') return { id: 'c', platformRole: null, tenantId: 't1' };
    return null;
  }),
}));

let server: Server;
let base = '';
beforeAll(async () => {
  const { platformRouter } = await import('../src/routes/platform.js');
  const app = express().use(platformRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('Admin v2 routes are platform-staff only', () => {
  for (const path of ['/api/platform/admin/overview', '/api/platform/admin/clients', '/api/platform/admin/clients/t1']) {
    it(`${path}: 401 without a session, 403 for a customer`, async () => {
      expect((await fetch(base + path)).status).toBe(401);
      expect((await fetch(base + path, { headers: { authorization: 'Bearer customer' } })).status).toBe(403);
    });
  }
});
