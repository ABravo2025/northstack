import type { Request, Response } from 'express';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { validateSession } from '../lib/httpAuth.js';
import { requirePayrollAccess } from '../lib/payrollAccess.js';
import prisma from '../lib/prisma.js';
import { sendPayslipEmail } from '../lib/mailer.js';
import { canManagePayroll } from '../modules/auth/permissionService.js';
import { getPlanLimits } from '../modules/tenant/planLimits.js';
import { listPayslips, numberLabel, renderIssuedPayslip, verifyPayslip } from '../modules/hr/payslipV2Service.js';

// Payroll v2 (spec-payroll-v2.md, units 5–6): issued payslips. Whoever runs payroll (owner or
// manage_payroll) sees and resends everyone's; everyone else, only their own (§0.1–2). The
// verification page is public and never shows amounts.
export const payslipsRouter = createAsyncRouter();

const appBaseUrl = () => process.env.APP_BASE_URL ?? 'http://localhost:5173';

async function ownEmployeeId(tenantId: string, userId: string): Promise<string | null> {
  const e = await prisma.employee.findFirst({ where: { tenantId, userId }, select: { id: true } });
  return e?.id ?? null;
}

// Sends one payslip to its person (their login email, else the employee email). Used on confirm and
// on "resend". Never throws: a mail problem must not undo a confirmed pay run.
export async function emailPayslip(payslipId: string, tenantId: string): Promise<boolean> {
  const p = await prisma.payslip.findFirst({
    where: { id: payslipId, tenantId },
    include: { employee: { select: { firstName: true, email: true, user: { select: { email: true, locale: true } } } }, tenant: { select: { name: true } } },
  });
  if (!p) return false;
  const pdf = await renderIssuedPayslip(p.id, tenantId);
  const settings = await prisma.payslipSettings.findUnique({ where: { tenantId } });
  if (!pdf) return false;
  try {
    await sendPayslipEmail({
      to: p.employee.user?.email ?? p.employee.email,
      locale: p.employee.user?.locale ?? p.locale,
      firstName: p.employee.firstName,
      companyName: p.tenant.name,
      period: p.periodLabel,
      number: numberLabel(settings?.prefix ?? 1, p.number),
      url: `${appBaseUrl()}/payroll/mine`,
      pdf,
    });
    await prisma.payslip.update({ where: { id: p.id }, data: { emailedAt: new Date() } });
    return true;
  } catch {
    return false;
  }
}

async function sendPdf(res: Response, payslipId: string, tenantId: string) {
  const pdf = await renderIssuedPayslip(payslipId, tenantId);
  if (!pdf) return res.status(404).json({ error: 'Payslip not found' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="payslip-${payslipId.slice(0, 8)}.pdf"`);
  return res.send(Buffer.from(pdf));
}

// --- whoever runs payroll ------------------------------------------------------------------------

payslipsRouter.get('/api/hr/payroll/payslips', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user || !requirePayrollAccess(user, res)) return;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : undefined;
  const runId = typeof req.query.runId === 'string' ? req.query.runId : undefined;
  return res.json(await listPayslips(user.tenantId!, { q, runId }));
});

payslipsRouter.post('/api/hr/payroll/payslips/:id/resend', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user || !requirePayrollAccess(user, res)) return;
  const ok = await emailPayslip(String(req.params.id), user.tenantId!);
  if (!ok) return res.status(400).json({ error: 'The payslip could not be sent' });
  return res.json({ ok: true });
});

// --- anyone: their own (or any, for whoever runs payroll) ----------------------------------------

async function ownOrManager(req: Request, res: Response) {
  const user = await validateSession(req, res);
  if (!user) return null;
  if (!getPlanLimits(user.tenant).payrollEnabled) {
    res.status(403).json({ error: 'Payroll is part of the Growth plan' });
    return null;
  }
  return { user, manager: canManagePayroll(user.roleContext), own: await ownEmployeeId(user.tenantId!, user.id) };
}

payslipsRouter.get('/api/payroll/me/payslips', async (req, res) => {
  const ctx = await ownOrManager(req, res);
  if (!ctx) return;
  if (!ctx.own) return res.json([]);
  return res.json(await listPayslips(ctx.user.tenantId!, { employeeId: ctx.own }));
});

payslipsRouter.get('/api/payroll/payslips/:id/pdf', async (req, res) => {
  const ctx = await ownOrManager(req, res);
  if (!ctx) return;
  const p = await prisma.payslip.findFirst({ where: { id: String(req.params.id), tenantId: ctx.user.tenantId! }, select: { id: true, employeeId: true } });
  if (!p || (!ctx.manager && p.employeeId !== ctx.own)) return res.status(404).json({ error: 'Payslip not found' });
  return sendPdf(res, p.id, ctx.user.tenantId!);
});

// --- public ---------------------------------------------------------------------------------------

payslipsRouter.get('/api/public/payslips/:code', async (req, res) => {
  const result = await verifyPayslip(String(req.params.code));
  if (!result) return res.status(404).json({ error: 'No payslip with that code' });
  return res.json(result);
});

// --- Settings → Payroll → Payslip ----------------------------------------------------------------

const MAX_SIGNATURE_BYTES = 300_000;

payslipsRouter.get('/api/hr/payroll/payslip-settings', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user || !requirePayrollAccess(user, res)) return;
  const s = await prisma.payslipSettings.findUnique({ where: { tenantId: user.tenantId! } });
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId! }, select: { country: true } });
  return res.json({
    prefix: s?.prefix ?? 1,
    nextNumber: s?.nextNumber ?? 1,
    nextLabel: numberLabel(s?.prefix ?? 1, s?.nextNumber ?? 1),
    signerName: s?.signerName ?? null,
    signature: s?.signatureData && s.signatureMime ? `data:${s.signatureMime};base64,${Buffer.from(s.signatureData).toString('base64')}` : null,
    layout: (tenant.country ?? '').toUpperCase() === 'AR' ? 'ar' : 'us',
  });
});

payslipsRouter.put('/api/hr/payroll/payslip-settings', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user || !requirePayrollAccess(user, res)) return;
  const prefix = Number(req.body?.prefix);
  if (!Number.isInteger(prefix) || prefix < 1 || prefix > 9999) return res.status(400).json({ error: 'Use a number from 1 to 9999', field: 'prefix' });
  const signerName = typeof req.body?.signerName === 'string' && req.body.signerName.trim() ? req.body.signerName.trim().slice(0, 80) : null;
  let signature: { data: Buffer; mime: string } | null | undefined;
  if (req.body?.signature === null) signature = null;
  else if (typeof req.body?.signature === 'string') {
    const m = /^data:(image\/png|image\/jpeg);base64,(.+)$/.exec(req.body.signature);
    if (!m) return res.status(400).json({ error: 'Upload a PNG or JPG image', field: 'signature' });
    const data = Buffer.from(m[2], 'base64');
    if (data.length > MAX_SIGNATURE_BYTES) return res.status(400).json({ error: 'The image is too big (max 300 KB)', field: 'signature' });
    signature = { data, mime: m[1] };
  }
  const signatureData = signature === undefined ? {} : signature === null ? { signatureData: null, signatureMime: null } : { signatureData: signature.data, signatureMime: signature.mime };
  await prisma.payslipSettings.upsert({
    where: { tenantId: user.tenantId! },
    create: { tenantId: user.tenantId!, prefix, signerName, ...signatureData },
    update: { prefix, signerName, ...signatureData },
  });
  return res.json({ ok: true });
});
