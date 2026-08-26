import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { authRouter } from './routes/auth.js';
import { tenantsRouter } from './routes/tenants.js';
import { employeesRouter } from './routes/employees.js';
import { catalogsRouter } from './routes/catalogs.js';
import { timeOffRouter } from './routes/timeOff.js';
import { viewsRouter } from './routes/views.js';
import { onboardingRouter } from './routes/onboarding.js';
import { clientsRouter } from './routes/clients.js';
import { companiesRouter } from './routes/companies.js';
import { contactsRouter } from './routes/contacts.js';
import { pipelinesRouter } from './routes/pipelines.js';
import { opportunitiesRouter } from './routes/opportunities.js';
import { publicFormsRouter } from './routes/publicForms.js';
import { publicRouter } from './routes/public.js';
import { feedbackRouter } from './routes/feedback.js';
import { tasksRouter } from './routes/tasks.js';
import { notesRouter } from './routes/notes.js';
import { notificationsRouter } from './routes/notifications.js';
import { payrollRouter } from './routes/payroll.js';
import { platformRouter } from './routes/platform.js';
import { internalRouter } from './routes/internal.js';
import { subscriptionsRouter } from './routes/subscriptions.js';
import { webhooksRouter } from './routes/webhooks.js';
import { googleCalendarIntegrationRouter } from './routes/googleCalendarIntegration.js';
import { stripeIntegrationRouter } from './routes/stripeIntegration.js';
import { paymentsRouter } from './routes/payments.js';

dotenv.config();

const app = express();

// Known Northstack origins — the SPA (Vercel rewrites /api/* to this same
// function in prod/staging, so the app itself is same-origin there; this
// list matters for local dev, where frontend/backend run on separate ports).
const ALLOWED_ORIGINS = new Set(['https://app.joinnorthstack.com', 'https://staging.joinnorthstack.com']);
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;

function isAllowedOrigin(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin) || LOCALHOST_ORIGIN.test(origin);
}

// This is a JSON-only API. Session-token-bearing routes (everything except
// /api/public/*) were open to any origin (`cors()` with no options) — found
// 2026-07-16 security audit, [MEDIO], unfixed until now. Restricted to
// Northstack's own origins + localhost (any port, for local dev), decided
// per-request rather than with a single static allowlist so the one
// deliberate exception below doesn't get lost in a blanket relaxation:
// /api/public/:tenantSlug/:formSlug(/submit) (routes/public.ts) backs the
// public, unauthenticated Form page (`/apply/...`) — the original cors()
// call's own comment says this needs to stay open to any origin "always",
// not just for local dev, so it's carved out explicitly rather than folded
// into the origin allowlist above (kept permissive on purpose, not an oversight).
app.use(
  cors((req, callback) => {
    if (req.path.startsWith('/api/public/')) {
      return callback(null, { origin: true });
    }
    const requestOrigin = req.headers.origin;
    // No Origin header at all (curl, server-to-server, the Vercel rewrite
    // hitting this function same-origin) isn't a browser CORS request —
    // nothing to restrict.
    return callback(null, { origin: !requestOrigin || isAllowedOrigin(requestOrigin) });
  }),
);
// Helmet's default Cross-Origin-Resource-Policy (`same-origin`) would have
// the browser block cross-origin fetches outright regardless of the cors()
// middleware above, so it's relaxed explicitly; everything else (HSTS,
// X-Content-Type-Options, frame protections, etc.) stays at Helmet's default.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Billing Integration webhooks (Paddle, Mercado Pago) need the raw, unparsed request body for
// HMAC signature verification — express.json() below would already have consumed/reparsed it by
// the time a route handler runs, and a reserialized JSON.stringify(parsed) isn't guaranteed
// byte-identical to what the provider actually signed. Mounted before the global json() parser
// so it wins for these two paths only; req.body is a Buffer there instead of a parsed object
// (see routes/webhooks.ts's rawBodyText helper). Every other route keeps the normal parsed body.
app.use('/api/webhooks/paddle', express.raw({ type: '*/*', limit: '2mb' }));
app.use('/api/webhooks/mercadopago', express.raw({ type: '*/*', limit: '2mb' }));
app.use(express.json({ limit: '2mb' })); // default 100kb is too small for a CSV import body

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Each router owns one domain's routes (see src/routes/) and already wraps
// its own get/post/patch/delete/put via createAsyncRouter() (src/lib/asyncRouter.ts),
// so async rejections here are caught the same way they were when this was
// all one file. Every router is mounted with no prefix — each route inside
// already carries its full path (e.g. '/api/hr/employees/:employeeId').
app.use(authRouter);
app.use(tenantsRouter);
app.use(employeesRouter);
app.use(catalogsRouter);
app.use(onboardingRouter);
app.use(viewsRouter);
app.use(timeOffRouter);
app.use(clientsRouter);
app.use(companiesRouter);
app.use(contactsRouter);
app.use(pipelinesRouter);
app.use(opportunitiesRouter);
app.use(publicFormsRouter);
app.use(publicRouter);
app.use(feedbackRouter);
app.use(tasksRouter);
app.use(notesRouter);
app.use(notificationsRouter);
app.use(payrollRouter);
app.use(platformRouter);
app.use(internalRouter);
app.use(subscriptionsRouter);
app.use(webhooksRouter);
app.use(googleCalendarIntegrationRouter);
app.use(stripeIntegrationRouter);
app.use(paymentsRouter);

// Catches anything an async route handler throws (e.g. Neon/Prisma dropping
// the connection) so it becomes a clean JSON response instead of crashing
// the process or leaking a stack trace to the client.
app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

export default app;
