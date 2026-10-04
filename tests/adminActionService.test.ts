import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { cleanReason, extendedTrialEnd, reactivationStatus } from '../src/modules/platform/adminActionService.js';

const now = new Date('2026-10-03T12:00:00Z');

describe('extendedTrialEnd', () => {
  it('adds the days to a trial that is still running', () => {
    expect(extendedTrialEnd(new Date('2026-10-10T12:00:00Z'), 7, now).toISOString()).toBe('2026-10-17T12:00:00.000Z');
  });
  it('counts from today when the trial already ended (or never had a date)', () => {
    expect(extendedTrialEnd(new Date('2026-09-01T00:00:00Z'), 7, now).toISOString()).toBe('2026-10-10T12:00:00.000Z');
    expect(extendedTrialEnd(null, 14, now).toISOString()).toBe('2026-10-17T12:00:00.000Z');
  });
});

describe('reactivationStatus', () => {
  it('sends a paying client back to active (or past_due if the last charge failed)', () => {
    expect(reactivationStatus({ trialEndsAt: null }, { provider: 'dodopayments', status: 'active' }, now)).toBe('active');
    expect(reactivationStatus({ trialEndsAt: null }, { provider: 'mercadopago', status: 'past_due' }, now)).toBe('past_due');
  });
  it('sends a running trial back to trialing and refuses an expired one', () => {
    expect(reactivationStatus({ trialEndsAt: new Date('2026-10-20') }, null, now)).toBe('trialing');
    expect(reactivationStatus({ trialEndsAt: new Date('2026-09-20') }, { provider: null, status: 'trialing' }, now)).toBeNull();
  });
});

describe('cleanReason', () => {
  it('requires at least 3 characters and caps at 500', () => {
    expect(cleanReason('  ')).toBeNull();
    expect(cleanReason('ok')).toBeNull();
    expect(cleanReason(undefined)).toBeNull();
    expect(cleanReason('  Lo pidió por mail  ')).toBe('Lo pidió por mail');
    expect(cleanReason('x'.repeat(600))).toHaveLength(500);
  });
});

// Route gating: plan/suspend actions are platform_admin only; every action needs a reason.
vi.mock('../src/modules/auth/authService.js', () => ({
  authenticateToken: vi.fn(async (token: string) => {
    if (token === 'admin') return { id: 'a', email: 'a@x', platformRole: 'platform_admin', tenantId: null };
    if (token === 'support') return { id: 's', email: 's@x', platformRole: 'platform_support', tenantId: null };
    if (token === 'customer') return { id: 'c', email: 'c@x', platformRole: null, tenantId: 't1' };
    return null;
  }),
  requestPasswordReset: vi.fn(),
}));
const extendTrialSpy = vi.hoisted(() => vi.fn(async () => ({ success: true as const, message: 'ok' })));
vi.mock('../src/modules/platform/adminActionService.js', async (orig) => ({
  ...(await orig<typeof import('../src/modules/platform/adminActionService.js')>()),
  extendTrial: extendTrialSpy,
  changeClientPlan: vi.fn(async () => ({ success: true, message: 'ok' })),
  suspendClient: vi.fn(async () => ({ success: true, message: 'ok' })),
}));

let server: Server;
let base = '';
beforeAll(async () => {
  const { platformRouter } = await import('../src/routes/platform.js');
  const app = express().use(express.json()).use(platformRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const post = (path: string, token: string | null, body: unknown) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

describe('Admin v2 action routes', () => {
  it('rejects customers and anonymous callers', async () => {
    expect((await post('/api/platform/admin/clients/t1/extend-trial', null, { days: 7, reason: 'motivo' })).status).toBe(401);
    expect((await post('/api/platform/admin/clients/t1/extend-trial', 'customer', { days: 7, reason: 'motivo' })).status).toBe(403);
  });
  it('keeps plan changes and suspensions for platform admins', async () => {
    expect((await post('/api/platform/admin/clients/t1/change-plan', 'support', { plan: 'growth', reason: 'motivo' })).status).toBe(403);
    expect((await post('/api/platform/admin/clients/t1/suspend', 'support', { reason: 'motivo' })).status).toBe(403);
    expect((await post('/api/platform/admin/clients/t1/change-plan', 'admin', { plan: 'growth', reason: 'motivo' })).status).toBe(200);
  });
  it('requires a reason before doing anything', async () => {
    extendTrialSpy.mockClear();
    const res = await post('/api/platform/admin/clients/t1/extend-trial', 'support', { days: 7, reason: ' ' });
    expect(res.status).toBe(400);
    expect(extendTrialSpy).not.toHaveBeenCalled();
    expect((await post('/api/platform/admin/clients/t1/extend-trial', 'support', { days: 7, reason: 'Pidió más tiempo' })).status).toBe(200);
    expect(extendTrialSpy).toHaveBeenCalledWith('t1', 7, expect.objectContaining({ id: 's' }), 'Pidió más tiempo');
  });
});
