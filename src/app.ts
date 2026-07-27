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
import { publicFormsRouter } from './routes/publicForms.js';
import { publicRouter } from './routes/public.js';
import { feedbackRouter } from './routes/feedback.js';

dotenv.config();

const app = express();

// This is a JSON-only API, consumed cross-origin by design (the Vite dev
// server on a different port locally, and the public /apply pages always).
// Helmet's default Cross-Origin-Resource-Policy (`same-origin`) would have
// the browser block those fetches outright regardless of the cors()
// middleware below, so it's relaxed explicitly; everything else (HSTS,
// X-Content-Type-Options, frame protections, etc.) stays at Helmet's default.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors());
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
app.use(publicFormsRouter);
app.use(publicRouter);
app.use(feedbackRouter);

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
