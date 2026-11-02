import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import helmet from 'helmet';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    tenant: { findUnique: vi.fn() },
    form: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
    formInvite: { findUnique: vi.fn() },
    contact: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock('../src/lib/rateLimit.js', () => ({ isRateLimited: vi.fn(async () => false) }));
vi.mock('../src/lib/mailer.js', () => ({ sendPublicFormSubmissionEmail: vi.fn() }));
vi.mock('../src/modules/forms/formResponseService.js', () => ({ submitResponse: vi.fn(async () => ({ responseId: 'r1', linked: null })) }));

import prisma from '../src/lib/prisma.js';
import { isRateLimited } from '../src/lib/rateLimit.js';
import { submitResponse } from '../src/modules/forms/formResponseService.js';
import { renderStamp, MIN_FILL_MS } from '../src/modules/forms/publicFormPage.js';
import { formsPublicRouter } from '../src/routes/formsPublic.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
let server: Server;
let base = '';
let previousKey: string | undefined;

beforeAll(async () => {
  previousKey = process.env.FORMS_DATA_ENCRYPTION_KEY;
  process.env.FORMS_DATA_ENCRYPTION_KEY = '3'.repeat(64);
  const app = express();
  app.use(helmet());
  app.use(express.json());
  app.use(formsPublicRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server?.close();
  if (previousKey === undefined) delete process.env.FORMS_DATA_ENCRYPTION_KEY;
  else process.env.FORMS_DATA_ENCRYPTION_KEY = previousKey;
});

const tenant = { id: 't1', slug: 'acme', name: 'Acme', country: 'AR', plan: 'growth', planOverride: null, logoUpdatedAt: null };
const form = (over: Record<string, unknown> = {}) => ({
  id: 'f1',
  tenantId: 't1',
  slug: 'demo',
  name: 'Pedí una demo',
  description: null,
  kind: 'form',
  action: 'create_lead',
  status: 'published',
  allowedDomains: ['acme.com'],
  afterSubmit: { mode: 'message', message: 'Gracias, te escribimos hoy.' },
  fields: [{ id: 'q1', label: 'Email', type: 'email', required: true, mapTo: 'contact.email' }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.tenant.findUnique.mockResolvedValue(tenant);
  db.form.findUnique.mockResolvedValue(form());
});

describe('public form routes', () => {
  it('serves the page framable only by the allowed domains', async () => {
    const res = await fetch(`${base}/f/acme/demo?utm_source=google`, { headers: { 'accept-language': 'es-AR' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-frame-options')).toBeNull();
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'self' https://acme.com");
    const html = await res.text();
    expect(html).toContain('Pedí una demo');
    expect(html).toContain('"utm":{"source":"google"}');
  });

  it('answers 404 for a draft, a personal-link form or a Starter company', async () => {
    db.form.findUnique.mockResolvedValueOnce(form({ status: 'draft' }));
    expect((await fetch(`${base}/f/acme/demo`)).status).toBe(404);
    db.form.findUnique.mockResolvedValueOnce(form({ action: 'update_contact' }));
    expect((await fetch(`${base}/f/acme/demo`)).status).toBe(404);
    db.tenant.findUnique.mockResolvedValueOnce({ ...tenant, plan: 'starter' });
    expect((await fetch(`${base}/f/acme/demo`)).status).toBe(404);
  });

  it('accepts a submission with a valid stamp and returns the thank-you message', async () => {
    const stamp = renderStamp('f1', Date.now() - MIN_FILL_MS - 100);
    const res = await fetch(`${base}/api/public/forms/acme/demo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers: { q1: 'ana@acme.com' }, stamp, website: '', embed: true, utm: { source: 'google' } }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'Gracias, te escribimos hoy.' });
    expect(submitResponse).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1' }), { q1: 'ana@acme.com' }, expect.objectContaining({ source: 'embed', utm: expect.objectContaining({ source: 'google' }) }));
  });

  it('pretends success for a filled honeypot and stores nothing', async () => {
    const res = await fetch(`${base}/api/public/forms/acme/demo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers: { q1: 'bot@spam.com' }, stamp: renderStamp('f1', Date.now() - 10_000), website: 'http://spam' }),
    });
    expect(res.status).toBe(200);
    expect(submitResponse).not.toHaveBeenCalled();
  });

  it('refuses an instant submission, a missing stamp and a rate-limited IP', async () => {
    const post = (stamp?: string) =>
      fetch(`${base}/api/public/forms/acme/demo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers: { q1: 'a@b.co' }, stamp }),
      });
    expect((await (await post(renderStamp('f1', Date.now()))).json()).code).toBe('too_fast');
    expect((await (await post()).json()).code).toBe('expired');
    vi.mocked(isRateLimited).mockResolvedValueOnce(true);
    expect((await post(renderStamp('f1', Date.now() - 10_000))).status).toBe(429);
    expect(submitResponse).not.toHaveBeenCalled();
  });

  it('serves embed.js as cross-origin JavaScript', async () => {
    const res = await fetch(`${base}/f/embed.js`);
    expect(res.headers.get('content-type')).toContain('application/javascript');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
  });

  it('serves a personal link that can never be embedded and greets the person', async () => {
    db.formInvite.findUnique.mockResolvedValue({
      id: 'i1',
      tenantId: 't1',
      recipientType: 'contact',
      recipientId: 'c1',
      respondedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
      form: form({ kind: 'survey', module: 'clients', action: 'save_only', fields: [{ id: 'q1', label: 'NPS', type: 'rating_nps', required: true }] }),
      tenant,
    });
    db.contact.findMany.mockResolvedValue([{ id: 'c1', firstName: 'Ana', lastName: 'Paz', email: 'ana@acme.com' }]);
    const res = await fetch(`${base}/f/p/${'a'.repeat(43)}`, { headers: { 'accept-language': 'es' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(await res.text()).toContain('Hola, Ana.');
  });

  it('tells the person when the link was already answered', async () => {
    db.formInvite.findUnique.mockResolvedValue({
      id: 'i1',
      tenantId: 't1',
      recipientType: 'contact',
      recipientId: 'c1',
      respondedAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
      form: form({ kind: 'survey', module: 'clients', action: 'save_only' }),
      tenant,
    });
    db.contact.findMany.mockResolvedValue([]);
    const res = await fetch(`${base}/f/p/${'a'.repeat(43)}`, { headers: { 'accept-language': 'es' } });
    expect(res.status).toBe(410);
    expect(await res.text()).toContain('Ya respondiste');
  });
});
