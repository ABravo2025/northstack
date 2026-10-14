import type { Request, Response } from 'express';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import prisma from '../lib/prisma.js';
import { sendClientReportEmail } from '../lib/mailer.js';
import { canApproveTimesheets, canManageProjects } from '../modules/auth/permissionService.js';
import { getPlanLimits } from '../modules/tenant/planLimits.js';
import { isValidDateString } from '../modules/shifts/shiftTime.js';
import { collectClientReport, createClientReportLink, findReportByToken, renderClientReportPdf } from '../modules/shifts/clientReportService.js';

// Shifts phase 2, block D: hours report for a client (Growth). Built by whoever approves timesheets
// or manages projects; read by the client through a private link that needs no login.
export const clientReportsRouter = createAsyncRouter();

const appBaseUrl = () => process.env.APP_BASE_URL ?? 'http://localhost:5173';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function authorized(req: Request, res: Response) {
  const user = await validateSession(req, res);
  if (!user) return null;
  if (!getPlanLimits(user.tenant).billableHoursEnabled) {
    res.status(403).json({ error: 'Client hours reports are part of the Growth plan', code: 'plan_limit_client_report' });
    return null;
  }
  if (!canApproveTimesheets(user.roleContext) && !canManageProjects(user.roleContext)) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return null;
  }
  return user;
}

function parseBody(body: Record<string, unknown>) {
  const { companyId, projectId, from, to } = body;
  if (typeof companyId !== 'string' || !companyId) return { error: 'Pick a company', field: 'companyId' } as const;
  if (!isValidDateString(from) || !isValidDateString(to) || from > to) return { error: 'Pick a period', field: 'from' } as const;
  return {
    value: {
      companyId,
      projectId: typeof projectId === 'string' && projectId ? projectId : null,
      from,
      to,
      showPeople: body.showPeople !== false,
    },
  } as const;
}

const lang = (v: unknown): 'en' | 'es' => (typeof v === 'string' && v.startsWith('es') ? 'es' : 'en');

// What the form needs for a company: its projects and its primary contact's email.
clientReportsRouter.get('/api/shifts/client-reports/defaults', async (req, res) => {
  const user = await authorized(req, res);
  if (!user) return;
  const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : '';
  const company = await prisma.company.findFirst({ where: { id: companyId, tenantId: user.tenantId! }, select: { id: true } });
  if (!company) return res.status(404).json({ error: 'Company not found' });
  const [projects, contact] = await Promise.all([
    prisma.project.findMany({ where: { tenantId: user.tenantId!, companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.contact.findFirst({ where: { tenantId: user.tenantId!, companyId, isPrimary: true, isActive: true }, select: { email: true } }),
  ]);
  return res.json({ projects, email: contact?.email ?? null });
});

// Download the PDF (no link created).
clientReportsRouter.post('/api/shifts/client-reports/pdf', async (req, res) => {
  const user = await authorized(req, res);
  if (!user) return;
  const parsed = parseBody(req.body ?? {});
  if ('error' in parsed) return res.status(400).json(parsed);
  const data = await collectClientReport(user.tenantId!, parsed.value);
  if (!data.success) return res.status(400).json({ error: data.error, field: data.field });
  const pdf = await renderClientReportPdf(user.tenantId!, data.value, lang(req.body?.lang));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="hours-${data.value.from}-${data.value.to}.pdf"`);
  return res.send(Buffer.from(pdf));
});

// Private link (30 days) and, when an email is given, the email with the PDF attached.
clientReportsRouter.post('/api/shifts/client-reports', async (req, res) => {
  const user = await authorized(req, res);
  if (!user) return;
  const parsed = parseBody(req.body ?? {});
  if ('error' in parsed) return res.status(400).json(parsed);
  const email = typeof req.body?.email === 'string' && req.body.email.trim() ? req.body.email.trim() : null;
  if (email && !EMAIL.test(email)) return res.status(400).json({ error: 'Enter a valid email', field: 'email' });
  const data = await collectClientReport(user.tenantId!, parsed.value);
  if (!data.success) return res.status(400).json({ error: data.error, field: data.field });
  const link = await createClientReportLink(user.tenantId!, parsed.value, user.id, email);
  const url = `${appBaseUrl()}/client-report/${link.token}`;
  if (email) {
    const l = lang(req.body?.lang);
    const pdf = await renderClientReportPdf(user.tenantId!, data.value, l);
    await sendClientReportEmail({ to: email, locale: l, companyName: data.value.company.name, tenantName: data.value.tenantName, period: `${data.value.from} – ${data.value.to}`, url, pdf });
  }
  return res.status(201).json({ url, expiresAt: link.expiresAt.toISOString(), emailedTo: email });
});

// --- public (the client, no login) ----------------------------------------------------------

async function publicReport(req: Request, res: Response) {
  const row = await findReportByToken(String(req.params.token));
  if (!row) {
    res.status(404).json({ error: 'This link has expired or doesn’t exist.' });
    return null;
  }
  const data = await collectClientReport(row.tenantId, {
    companyId: row.companyId,
    projectId: row.projectId,
    from: row.from.toISOString().slice(0, 10),
    to: row.to.toISOString().slice(0, 10),
    showPeople: row.showPeople,
  });
  if (!data.success) {
    res.status(404).json({ error: data.error });
    return null;
  }
  return { row, data: data.value };
}

clientReportsRouter.get('/api/public/client-reports/:token/view', async (req, res) => {
  const r = await publicReport(req, res);
  if (!r) return;
  return res.json({ ...r.data, expiresAt: r.row.expiresAt.toISOString() });
});

clientReportsRouter.get('/api/public/client-reports/:token/pdf', async (req, res) => {
  const r = await publicReport(req, res);
  if (!r) return;
  const pdf = await renderClientReportPdf(r.row.tenantId, r.data, lang(req.query.lang));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="hours-${r.data.from}-${r.data.to}.pdf"`);
  return res.send(Buffer.from(pdf));
});
