import type express from 'express';
import { validateSession, getClientIp } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { isRateLimited } from '../lib/rateLimit.js';
import { canManageOpportunity, canViewOpportunity } from '../modules/auth/permissionService.js';
import { isClientsAllowed } from '../modules/tenant/planLimits.js';
import {
  QuoteError,
  createQuote,
  findQuoteByToken,
  listQuotes,
  renderQuotePdf,
  respondToQuote,
  sendQuote,
  updateQuote,
  type QuoteLine,
} from '../modules/crm/quoteService.js';
import { quoteCsp, renderQuoteNotFound, renderQuotePage, type QuoteLang } from '../modules/crm/quotePage.js';
import { newNonce, pickLang } from '../modules/forms/publicFormPage.js';

// Cruces D3: quotes from the catalog. In the app: opportunity permissions + Growth (clientsEnabled).
// Public: /f/q/<token> for the client to read, download and accept or decline.
export const quotesRouter = createAsyncRouter();

async function guard(req: express.Request, res: express.Response, write: boolean) {
  const user = await validateSession(req, res);
  if (!user) return null;
  if (!(write ? canManageOpportunity(user.roleContext) : canViewOpportunity(user.roleContext))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return null;
  }
  if (!isClientsAllowed(user.tenant)) {
    res.status(403).json({ error: 'Quotes are part of the Growth plan', code: 'plan_required' });
    return null;
  }
  return user;
}

function fail(res: express.Response, error: unknown) {
  if (error instanceof QuoteError) return res.status(error.status).json({ error: error.message, code: error.code });
  throw error;
}

const appUrl = () => process.env.APP_BASE_URL ?? 'http://localhost:5173';

quotesRouter.get('/api/opportunities/:opportunityId/quotes', async (req, res) => {
  const user = await guard(req, res, false);
  if (!user) return;
  return res.json(await listQuotes(user.tenantId!, req.params.opportunityId));
});

quotesRouter.post('/api/quotes', async (req, res) => {
  const user = await guard(req, res, true);
  if (!user) return;
  try {
    const b = req.body ?? {};
    return res.status(201).json(await createQuote(user.tenantId!, user.id, { opportunityId: String(b.opportunityId ?? ''), lines: b.lines, discountPct: Number(b.discountPct) || 0, notes: typeof b.notes === 'string' ? b.notes : null, validDays: Number(b.validDays) || 15 }));
  } catch (error) {
    return fail(res, error);
  }
});

quotesRouter.patch('/api/quotes/:id', async (req, res) => {
  const user = await guard(req, res, true);
  if (!user) return;
  try {
    const b = req.body ?? {};
    return res.json(
      await updateQuote(user.tenantId!, req.params.id, {
        lines: b.lines,
        discountPct: b.discountPct === undefined ? undefined : Number(b.discountPct) || 0,
        notes: b.notes === undefined ? undefined : typeof b.notes === 'string' ? b.notes : null,
        validDays: b.validDays === undefined ? undefined : Number(b.validDays),
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
});

// Freezes the quote and returns its link (shown once: only its hash is kept).
quotesRouter.post('/api/quotes/:id/send', async (req, res) => {
  const user = await guard(req, res, true);
  if (!user) return;
  try {
    const { token } = await sendQuote(user.tenantId!, req.params.id);
    return res.json({ url: `${appUrl()}/f/q/${token}` });
  } catch (error) {
    return fail(res, error);
  }
});

quotesRouter.get('/api/quotes/:id/pdf', async (req, res) => {
  const user = await guard(req, res, false);
  if (!user) return;
  try {
    const pdf = await renderQuotePdf(req.params.id, user.tenantId!, req.query.lang === 'en' ? 'en' : 'es');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="quote-${req.params.id.slice(0, 8)}.pdf"`);
    return res.send(Buffer.from(pdf));
  } catch (error) {
    return fail(res, error);
  }
});

// --- Public ---

function moneyFor(currency: string, country: string | null) {
  return (cents: number) => new Intl.NumberFormat(country === 'US' ? 'en-US' : 'es-AR', { style: 'currency', currency, currencyDisplay: 'code' }).format(cents / 100);
}

quotesRouter.get('/f/q/:token', async (req, res) => {
  const nonce = newNonce();
  const quote = await findQuoteByToken(req.params.token);
  const lang: QuoteLang = pickLang(req.headers['accept-language'], quote?.tenant.country ?? null);
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', quoteCsp(nonce));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!quote || quote.status === 'draft' || !isClientsAllowed(quote.tenant)) return res.status(404).type('html').send(renderQuoteNotFound(nonce, lang));
  const expired = quote.status === 'sent' && quote.validUntil.getTime() < Date.now() - 86_400_000;
  return res.type('html').send(
    renderQuotePage({
      nonce,
      lang,
      token: req.params.token,
      number: quote.number,
      companyName: quote.opportunity.company.name,
      tenantName: quote.tenant.name,
      dealName: quote.opportunity.name,
      logoUrl: quote.tenant.logoUpdatedAt ? `/api/public/tenant-logo/${quote.tenant.id}?v=${quote.tenant.logoUpdatedAt.getTime()}` : null,
      lines: quote.lines as unknown as QuoteLine[],
      subtotalCents: quote.subtotalCents,
      discountPct: quote.discountPct,
      totalCents: quote.totalCents,
      notes: quote.notes,
      validUntil: quote.validUntil.toISOString().slice(0, 10),
      status: expired ? 'expired' : (quote.status as 'sent' | 'accepted' | 'declined'),
      money: moneyFor(quote.currency, quote.tenant.country),
    }),
  );
});

quotesRouter.get('/api/public/quotes/:token/pdf', async (req, res) => {
  const quote = await findQuoteByToken(req.params.token);
  if (!quote || quote.status === 'draft') return res.status(404).json({ error: 'Quote not found' });
  const lang = pickLang(req.headers['accept-language'], quote.tenant.country);
  const pdf = await renderQuotePdf(quote.id, quote.tenantId, lang);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="quote-${quote.number}.pdf"`);
  return res.send(Buffer.from(pdf));
});

quotesRouter.post('/api/public/quotes/:token', async (req, res) => {
  const ip = getClientIp(req);
  if (await isRateLimited(`quote-answer:${ip}`, { windowMs: 10 * 60_000, maxRequests: 10 })) {
    return res.status(429).json({ error: 'Too many attempts. Please try again in a few minutes.' });
  }
  const b = req.body ?? {};
  try {
    const quote = await findQuoteByToken(req.params.token);
    if (!quote || !isClientsAllowed(quote.tenant)) return res.status(404).json({ error: 'Quote not found', code: 'not_found' });
    return res.json(await respondToQuote(req.params.token, { accept: b.accept === true, name: typeof b.name === 'string' ? b.name : '', reason: typeof b.reason === 'string' ? b.reason : null, ip }));
  } catch (error) {
    return fail(res, error);
  }
});
