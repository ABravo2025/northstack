import { authenticateUser, getClientIp } from '../lib/httpAuth.js';
import { isRateLimited } from '../lib/rateLimit.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { decideByCustomer, pendingForUser, redeemEntryCode } from '../modules/platform/supportAccessService.js';

// Admin Center v2, stage 5 (2026-10-04): the customer's side of "Entrar como soporte" — see a
// request, accept or decline it, end an active access — plus the exchange of the one-time code
// Northstack staff opens the support session with.
export const supportAccessRouter = createAsyncRouter();

supportAccessRouter.get('/api/support-access/mine', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) {
    return;
  }
  // A support session never sees (or answers) the consent prompt for the user it's acting as.
  if (user.support) {
    return res.json([]);
  }
  return res.json(await pendingForUser(user.id));
});

for (const decision of ['approve', 'reject', 'end'] as const) {
  supportAccessRouter.post(`/api/support-access/:id/${decision}`, async (req, res) => {
    const user = await authenticateUser(req, res);
    if (!user) {
      return;
    }
    if (user.support) {
      return res.status(403).json({ error: 'Only the account owner can decide on support access.' });
    }
    const result = await decideByCustomer(user.id, req.params.id, decision);
    return result.success ? res.json(result) : res.status(400).json({ error: result.error });
  });
}

supportAccessRouter.post('/api/support-access/redeem', async (req, res) => {
  if (await isRateLimited(`support-redeem:${getClientIp(req)}`, { maxRequests: 10, windowMs: 60_000 })) {
    return res.status(429).json({ error: 'Too many attempts. Wait a minute.' });
  }
  const result = await redeemEntryCode(typeof req.body?.code === 'string' ? req.body.code : '');
  return result.success ? res.json({ token: result.token, expiresAt: result.expiresAt }) : res.status(400).json({ error: result.error });
});
