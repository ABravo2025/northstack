import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';

let server: Server;
let base = '';

beforeAll(async () => {
  const { tenantsRouter } = await import('../src/routes/tenants.js');
  const app = express().use(tenantsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('GET /api/public/geo', () => {
  it("returns the visitor's country from Vercel's geo header, uncached", async () => {
    const res = await fetch(`${base}/api/public/geo`, { headers: { 'x-vercel-ip-country': 'ar' } });
    expect(await res.json()).toEqual({ country: 'AR' });
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('returns null without the header or with a malformed value', async () => {
    expect(await (await fetch(`${base}/api/public/geo`)).json()).toEqual({ country: null });
    expect(await (await fetch(`${base}/api/public/geo`, { headers: { 'x-vercel-ip-country': 'ARG' } })).json()).toEqual({ country: null });
  });
});
