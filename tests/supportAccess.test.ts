import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { effectiveStatus } from '../src/modules/platform/supportAccessService.js';

describe('effectiveStatus (support access over time)', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  it('a pending request lapses after its 24 h window', () => {
    expect(effectiveStatus({ status: 'pending', requestExpiresAt: new Date('2026-10-04T13:00:00Z'), accessEndsAt: null }, now)).toBe('pending');
    expect(effectiveStatus({ status: 'pending', requestExpiresAt: new Date('2026-10-04T11:00:00Z'), accessEndsAt: null }, now)).toBe('expired');
  });
  it('an accepted access ends on its own at the end of its window', () => {
    expect(effectiveStatus({ status: 'approved', requestExpiresAt: now, accessEndsAt: new Date('2026-10-04T12:30:00Z') }, now)).toBe('approved');
    expect(effectiveStatus({ status: 'approved', requestExpiresAt: now, accessEndsAt: new Date('2026-10-04T11:59:00Z') }, now)).toBe('ended');
    expect(effectiveStatus({ status: 'rejected', requestExpiresAt: now, accessEndsAt: null }, now)).toBe('rejected');
  });
});

// Read-only support sessions can only read; the user being supported is the only one who decides.
const decide = vi.hoisted(() => vi.fn(async () => ({ success: true as const })));
vi.mock('../src/modules/auth/authService.js', () => ({
  authenticateToken: vi.fn(async (token: string) => {
    const base = { id: 'u1', tenantId: 't1', platformRole: null, tenant: { id: 't1', status: 'active', plan: 'growth', planOverride: null } };
    if (token === 'owner') return { ...base, support: null };
    if (token === 'support-ro') return { ...base, support: { requestId: 'r1', readOnly: true, endsAt: new Date(Date.now() + 60_000), staffName: 'Staff' } };
    if (token === 'support-rw') return { ...base, support: { requestId: 'r1', readOnly: false, endsAt: new Date(Date.now() + 60_000), staffName: 'Staff' } };
    return null;
  }),
}));
vi.mock('../src/modules/platform/supportAccessService.js', async (orig) => ({
  ...(await orig<typeof import('../src/modules/platform/supportAccessService.js')>()),
  decideByCustomer: decide,
  pendingForUser: vi.fn(async () => [{ id: 'r1', status: 'pending' }]),
}));

let server: Server;
let base = '';
beforeAll(async () => {
  const { supportAccessRouter } = await import('../src/routes/supportAccess.js');
  const { validateSession } = await import('../src/lib/httpAuth.js');
  const app = express().use(express.json()).use(supportAccessRouter);
  // Stand-ins for any tenant route: a read and a write behind validateSession.
  app.get('/api/things', async (req, res) => { if (await validateSession(req, res)) res.json({ ok: true }); });
  app.post('/api/things', async (req, res) => { if (await validateSession(req, res)) res.json({ ok: true }); });
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const call = (method: string, path: string, token: string) => fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: method === 'GET' ? undefined : '{}' });

describe('support sessions in the customer app', () => {
  it('read-only: reads work, writes are refused', async () => {
    expect((await call('GET', '/api/things', 'support-ro')).status).toBe(200);
    const res = await call('POST', '/api/things', 'support-ro');
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('support_read_only');
  });
  it('edit mode can write', async () => {
    expect((await call('POST', '/api/things', 'support-rw')).status).toBe(200);
  });
  it('a support session never sees or answers the consent prompt', async () => {
    expect(await (await call('GET', '/api/support-access/mine', 'support-ro')).json()).toEqual([]);
    decide.mockClear();
    expect((await call('POST', '/api/support-access/r1/approve', 'support-rw')).status).toBe(403);
    expect(decide).not.toHaveBeenCalled();
  });
  it('the real user sees the request and can accept it', async () => {
    expect(await (await call('GET', '/api/support-access/mine', 'owner')).json()).toEqual([{ id: 'r1', status: 'pending' }]);
    expect((await call('POST', '/api/support-access/r1/approve', 'owner')).status).toBe(200);
    expect(decide).toHaveBeenCalledWith('u1', 'r1', 'approve');
  });
});
