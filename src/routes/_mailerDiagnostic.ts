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

  let verifyOk = false;
  let verifyError: string | undefined;
  try {
    await transporter.verify();
    verifyOk = true;
  } catch (err) {
    verifyError = err instanceof Error ? err.message : String(err);
  }

  // Optional real send, only when the caller (this diagnostic session, via
  // the same bearer token) explicitly opts in with ?sendTo=<address> — never
  // a hardcoded recipient baked into deployed code. verify() alone can pass
  // while an actual send still gets rejected or silently dropped downstream.
  const sendTo = typeof req.query.sendTo === 'string' ? req.query.sendTo : undefined;
  let sendOk: boolean | undefined;
  let sendError: string | undefined;
  let sendResponse: string | undefined;
  if (sendTo) {
    try {
      const info = await transporter.sendMail({
        from: `"Northstack" <${process.env.ZOHO_SMTP_USER}>`,
        to: sendTo,
        subject: 'Mailer diagnostic test send',
        text: 'Real test send from the temporary production mailer diagnostic endpoint.',
      });
      sendOk = true;
      sendResponse = JSON.stringify({ messageId: info.messageId, response: info.response, accepted: info.accepted, rejected: info.rejected });
    } catch (err) {
      sendOk = false;
      sendError = err instanceof Error ? err.message : String(err);
    }
  }

  return res.json({ userConfigured, passwordConfigured, verifyOk, verifyError, sendOk, sendError, sendResponse });
});
