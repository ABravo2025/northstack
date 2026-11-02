import type express from 'express';
import type { Form } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { getClientIp } from '../lib/httpAuth.js';
import { isRateLimited } from '../lib/rateLimit.js';
import { isFormsEncryptionConfigured } from '../lib/formsEncryption.js';
import { sendPublicFormSubmissionEmail } from '../lib/mailer.js';
import { isFormsAllowed } from '../modules/tenant/planLimits.js';
import { PUBLIC_ACTIONS, type FormAction, type FormQuestion } from '../modules/forms/formDefinitions.js';
import { FormError } from '../modules/forms/formService.js';
import { submitResponse } from '../modules/forms/formResponseService.js';
import { findInvite, submitInvite } from '../modules/forms/formInviteService.js';
import { EMBED_SCRIPT } from '../modules/forms/embedScript.js';
import {
  checkStamp,
  newNonce,
  pageCsp,
  pickLang,
  renderFormPage,
  renderNoticePage,
  renderNotFoundPage,
  renderStamp,
} from '../modules/forms/publicFormPage.js';

// Formularios y encuestas → public link and embedding (spec-clientes-gastos-formularios.md, B3).
// Unauthenticated by design: anyone with the link can open and answer a published public form.
//   GET  /f/embed.js                       the embed script (inline / floating button / popup)
//   GET  /f/:tenantSlug/:formSlug          the form page, with its own CSP frame-ancestors
//   POST /api/public/forms/:tenantSlug/:formSlug   a submission
// Anti-spam: honeypot field, a signed render stamp (min 3 s to fill, max 24 h), and a per-IP limit.
export const formsPublicRouter = createAsyncRouter();

const SUBMIT_LIMIT = { windowMs: 10 * 60_000, maxRequests: 10 };
const SLUG = /^[a-z0-9-]{1,80}$/;

// Only a published, new-editor form whose action can run without knowing who answers is public —
// personal-link forms and surveys (B4) and pre-Fase B forms without questions are never served here.
async function findPublicForm(tenantSlug: string, formSlug: string) {
  if (!SLUG.test(tenantSlug) || !SLUG.test(formSlug) || !isFormsEncryptionConfigured()) return null;
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant || !isFormsAllowed(tenant)) return null;
  const form = await prisma.form.findUnique({ where: { tenantId_slug: { tenantId: tenant.id, slug: formSlug } } });
  if (!form || form.fields === null || form.status !== 'published' || form.kind !== 'form') return null;
  if (!PUBLIC_ACTIONS.includes(form.action as FormAction)) return null;
  return { tenant, form };
}

function sendHtml(res: express.Response, status: number, html: string, csp: string) {
  // helmet's defaults (X-Frame-Options: SAMEORIGIN, its own CSP) are meant for the app; this page
  // is made to be framed by the company's website, so it sends its own policy instead.
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.status(status).type('html').send(html);
}

formsPublicRouter.get('/f/embed.js', (_req, res) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.type('application/javascript').send(EMBED_SCRIPT);
});

// Personal link (B4): /f/p/<token>. Registered before the public route — same two-segment shape.
formsPublicRouter.get('/f/p/:token', async (req, res) => {
  const nonce = newNonce();
  const found = await findInvite(req.params.token);
  const lang = pickLang(req.headers['accept-language'], found?.tenant.country ?? null);
  if (!found) return sendHtml(res, 404, renderNotFoundPage(nonce, lang), pageCsp(nonce, []));
  if (found.state !== 'open') return sendHtml(res, 410, renderNoticePage(nonce, lang, found.state === 'answered' ? 'answered' : 'expired'), pageCsp(nonce, []));
  const { tenant, form } = found;
  const survey = (form.surveySettings ?? {}) as { anonymous?: boolean };
  const html = renderFormPage({
    nonce,
    lang,
    key: `${tenant.slug}/${form.slug}`,
    name: form.name,
    description: form.description,
    questions: form.fields as unknown as FormQuestion[],
    logoUrl: tenant.logoUpdatedAt ? `/api/public/tenant-logo/${tenant.id}?v=${tenant.logoUpdatedAt.getTime()}` : null,
    action: `/api/public/invites/${req.params.token}`,
    stamp: renderStamp(form.id),
    utm: {},
    greeting: found.firstName,
    anonymous: form.kind === 'survey' && survey.anonymous === true,
  });
  // Personal links are never embedded.
  return sendHtml(res, 200, html, pageCsp(nonce, null));
});

formsPublicRouter.get('/f/:tenantSlug/:formSlug', async (req, res) => {
  const nonce = newNonce();
  const found = await findPublicForm(req.params.tenantSlug, req.params.formSlug);
  const lang = pickLang(req.headers['accept-language'], found?.tenant.country ?? null);
  if (!found) return sendHtml(res, 404, renderNotFoundPage(nonce, lang), pageCsp(nonce, []));
  const { tenant, form } = found;
  const utm: Record<string, string> = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const v = req.query[k];
    if (typeof v === 'string' && v) utm[k.slice(4)] = v.slice(0, 100);
  }
  const html = renderFormPage({
    nonce,
    lang,
    key: `${tenant.slug}/${form.slug}`,
    name: form.name,
    description: form.description,
    questions: form.fields as unknown as FormQuestion[],
    logoUrl: tenant.logoUpdatedAt ? `/api/public/tenant-logo/${tenant.id}?v=${tenant.logoUpdatedAt.getTime()}` : null,
    action: `/api/public/forms/${tenant.slug}/${form.slug}`,
    stamp: renderStamp(form.id),
    utm,
    embedded: req.query.embed === '1',
  });
  return sendHtml(res, 200, html, pageCsp(nonce, form.allowedDomains));
});

// New leads tell the owner and admins, like the old public forms did.
async function notifyNewLead(form: Form, linked: { type: string; id: string }) {
  const where = { id: linked.id, tenantId: form.tenantId };
  const select = { firstName: true, lastName: true, email: true };
  const [contact, tenant, admins] = await Promise.all([
    linked.type === 'lead' ? prisma.lead.findFirst({ where, select }) : prisma.contact.findFirst({ where, select }),
    prisma.tenant.findUnique({ where: { id: form.tenantId }, select: { name: true } }),
    prisma.user.findMany({ where: { tenantId: form.tenantId, role: { in: ['owner', 'admin'] }, status: 'active' }, select: { email: true, locale: true } }),
  ]);
  if (!contact) return;
  for (const admin of admins) {
    // Awaited on purpose: Vercel can kill an un-awaited send once the response is out.
    await sendPublicFormSubmissionEmail({
      to: admin.email,
      tenantName: tenant?.name ?? '',
      formName: form.name,
      submitterName: `${contact.firstName} ${contact.lastName}`.trim(),
      submitterEmail: contact.email,
      locale: admin.locale,
    });
  }
}

formsPublicRouter.post('/api/public/invites/:token', async (req, res) => {
  const ip = getClientIp(req);
  if (await isRateLimited(`form-submit:${ip}`, SUBMIT_LIMIT)) {
    return res.status(429).json({ error: 'Too many submissions. Please try again in a few minutes.', code: 'rate_limited' });
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? (body.answers as Record<string, unknown>) : {};
  try {
    const { form } = await submitInvite(req.params.token, answers);
    const after = (form.afterSubmit ?? {}) as { mode?: string; message?: string; redirectUrl?: string };
    return res.json(after.mode === 'redirect' && after.redirectUrl ? { redirectUrl: after.redirectUrl } : { message: after.message ?? null });
  } catch (error) {
    if (error instanceof FormError) return res.status(error.status).json({ error: error.message, code: error.code });
    throw error;
  }
});

formsPublicRouter.post('/api/public/forms/:tenantSlug/:formSlug', async (req, res) => {
  const ip = getClientIp(req);
  if (await isRateLimited(`form-submit:${ip}`, SUBMIT_LIMIT)) {
    return res.status(429).json({ error: 'Too many submissions. Please try again in a few minutes.', code: 'rate_limited' });
  }
  const found = await findPublicForm(req.params.tenantSlug, req.params.formSlug);
  if (!found) return res.status(404).json({ error: 'Form not found', code: 'not_found' });
  const { form } = found;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const after = (form.afterSubmit ?? {}) as { mode?: string; message?: string; redirectUrl?: string };
  const success = after.mode === 'redirect' && after.redirectUrl ? { redirectUrl: after.redirectUrl } : { message: after.message ?? null };

  // A filled honeypot is a bot: answer like a success so it learns nothing, store nothing.
  if (typeof body.website === 'string' && body.website.trim()) return res.json(success);
  const stamp = checkStamp(form.id, body.stamp);
  if (stamp === 'too_fast') return res.status(400).json({ error: 'Please wait a few seconds and submit again.', code: 'too_fast' });
  if (stamp === 'invalid') return res.status(400).json({ error: 'This page expired. Reload it and submit again.', code: 'expired' });

  const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers) ? (body.answers as Record<string, unknown>) : {};
  const utmRaw = (body.utm && typeof body.utm === 'object' ? body.utm : {}) as Record<string, unknown>;
  const utm = {
    source: typeof utmRaw.source === 'string' ? utmRaw.source : undefined,
    medium: typeof utmRaw.medium === 'string' ? utmRaw.medium : undefined,
    campaign: typeof utmRaw.campaign === 'string' ? utmRaw.campaign : undefined,
  };
  try {
    const result = await submitResponse(form, answers, { source: body.embed === true ? 'embed' : 'public_link', utm });
    if (form.action === 'create_lead' && result.linked) await notifyNewLead(form, result.linked);
    return res.json(success);
  } catch (error) {
    if (error instanceof FormError) return res.status(error.status).json({ error: error.message, code: error.code });
    throw error;
  }
});
