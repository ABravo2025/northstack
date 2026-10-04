import type express from 'express';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { validateSession } from '../lib/httpAuth.js';
import { requirePlatformRole } from '../lib/platformAuth.js';
import { REFERRAL } from '../config/pricing.js';
import {
  createPayout,
  getMemberForAdmin,
  getMyReferrals,
  getPayoutReceiptForAdmin,
  getPayoutReceiptForUser,
  joinReferralProgram,
  listMembersForAdmin,
  updateReferralPayoutDetails,
  voidCommission,
} from '../modules/referral/referralService.js';

// Referral program (2026-10-04). /api/referrals/me/* — the signed-in user's own membership.
// /api/platform/admin/referrals/* — Admin Center (platform_admin only: it shows bank details).

export const referralsRouter = createAsyncRouter();

// A support session (staff signed in as this user) never sees or changes the person's payout data.
async function referralUser(req: express.Request, res: express.Response) {
  const user = await validateSession(req, res);
  if (!user) return null;
  if (user.support) {
    res.status(403).json({ error: 'Not available in a support session.' });
    return null;
  }
  return user;
}

function sendReceipt(res: express.Response, receipt: { bytes: Buffer; mimeType: string; fileName: string } | null) {
  if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
  res.set('Content-Type', receipt.mimeType);
  res.set('Content-Disposition', `attachment; filename="${receipt.fileName.replace(/"/g, '')}"`);
  res.set('Cache-Control', 'private, no-store');
  return res.send(receipt.bytes);
}

// Public: the program rules, for the terms page (readable before signing in).
referralsRouter.get('/api/public/referral-rules', (_req, res) => {
  const { commissionPercent, commissionPayments, holdDays, minPayoutCents, trialDays, termsVersion } = REFERRAL;
  return res.json({ commissionPercent, commissionPayments, holdDays, minPayoutCents, trialDays, termsVersion });
});

referralsRouter.get('/api/referrals/me', async (req, res) => {
  const user = await referralUser(req, res);
  if (!user) return;
  return res.json(await getMyReferrals(user.id));
});

referralsRouter.post('/api/referrals/me/join', async (req, res) => {
  const user = await referralUser(req, res);
  if (!user) return;
  const result = await joinReferralProgram(user.id, req.body ?? {});
  if (!result.success) return res.status(400).json({ error: result.error, field: result.field });
  return res.status(201).json(await getMyReferrals(user.id));
});

referralsRouter.put('/api/referrals/me/payout-details', async (req, res) => {
  const user = await referralUser(req, res);
  if (!user) return;
  const result = await updateReferralPayoutDetails(user.id, req.body ?? {});
  if (!result.success) return res.status(400).json({ error: result.error, field: result.field });
  return res.json(await getMyReferrals(user.id));
});

referralsRouter.get('/api/referrals/me/payouts/:id/receipt', async (req, res) => {
  const user = await referralUser(req, res);
  if (!user) return;
  return sendReceipt(res, await getPayoutReceiptForUser(user.id, req.params.id));
});

// ---------- Admin Center ----------

referralsRouter.get('/api/platform/admin/referrals', async (req, res) => {
  const user = await requirePlatformRole()(req, res);
  if (!user) return;
  return res.json(await listMembersForAdmin());
});

referralsRouter.get('/api/platform/admin/referrals/:memberId', async (req, res) => {
  const user = await requirePlatformRole()(req, res);
  if (!user) return;
  const member = await getMemberForAdmin(req.params.memberId);
  if (!member) return res.status(404).json({ error: 'No existe ese miembro.' });
  return res.json(member);
});

// Body: { currency, transferredAt, reference?, receipt: data URL, receiptFileName } — app.ts gives
// this path a larger JSON limit for the receipt.
referralsRouter.post('/api/platform/admin/referrals/:memberId/payouts', async (req, res) => {
  const user = await requirePlatformRole()(req, res);
  if (!user) return;
  const result = await createPayout(req.params.memberId, req.body ?? {}, user.id);
  if (!result.success) return res.status(400).json({ error: result.error, field: result.field });
  return res.status(201).json(result);
});

referralsRouter.post('/api/platform/admin/referrals/commissions/:id/void', async (req, res) => {
  const user = await requirePlatformRole()(req, res);
  if (!user) return;
  const result = await voidCommission(req.params.id, req.body?.reason);
  if (!result.success) return res.status(400).json({ error: result.error, field: result.field });
  return res.json(result);
});

referralsRouter.get('/api/platform/admin/referrals/payouts/:id/receipt', async (req, res) => {
  const user = await requirePlatformRole()(req, res);
  if (!user) return;
  return sendReceipt(res, await getPayoutReceiptForAdmin(req.params.id));
});
