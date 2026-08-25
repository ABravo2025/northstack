import nodemailer from 'nodemailer';
import { createAsyncRouter } from '../lib/asyncRouter.js';

// TEMPORARY — 2026-08-25 production SMTP diagnostic (signup verification emails not arriving,
// no other way to inspect production env vars/logs available right now). Deliberately its own
// file/router (not added to mailer.ts/internal.ts) so it doesn't touch files with unrelated
// in-progress uncommitted work. Never returns the credential values themselves, only whether
// they're set and whether Zoho actually accepts them. Delete this file and its app.ts import
// the moment this is answered.
export const mailerDiagnosticRouter = createAsyncRouter();

const DIAGNOSTIC_TOKEN = '25d33b07-f45d-450c-9857-62235f500387847c9d80-4762-4d7c-998f-5423ec80bea2';

mailerDiagnosticRouter.get('/api/internal/_mailer-diagnostic', async (req, res) => {
  if (req.headers.authorization !== `Bearer ${DIAGNOSTIC_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userConfigured = !!process.env.ZOHO_SMTP_USER;
  const passwordConfigured = !!process.env.ZOHO_SMTP_PASSWORD;

  if (!userConfigured || !passwordConfigured) {
    return res.json({ userConfigured, passwordConfigured, verifyOk: false });
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 465,
    secure: true,
    auth: { user: process.env.ZOHO_SMTP_USER, pass: process.env.ZOHO_SMTP_PASSWORD },
  });

  try {
    await transporter.verify();
    return res.json({ userConfigured, passwordConfigured, verifyOk: true });
  } catch (err) {
    return res.json({
      userConfigured,
      passwordConfigured,
      verifyOk: false,
      verifyError: err instanceof Error ? err.message : String(err),
    });
  }
});
