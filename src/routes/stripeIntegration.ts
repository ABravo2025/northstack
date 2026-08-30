import { createAsyncRouter } from '../lib/asyncRouter.js';
import { validateSession } from '../lib/httpAuth.js';
import { requirePaymentsAccess as requirePaymentsAccessBase, type SessionUser } from '../lib/paymentsAccess.js';
import { connectStripe, disconnectStripe, getStripeConnectionStatus } from '../modules/integrations/stripeService.js';

export const stripeIntegrationRouter = createAsyncRouter();

function requirePaymentsAccess(user: SessionUser, res: import('express').Response): boolean {
  return requirePaymentsAccessBase(user, res, 'Only the workspace owner can manage the Stripe connection.');
}

stripeIntegrationRouter.get('/api/integrations/stripe/status', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requirePaymentsAccess(user, res)) return;

  const status = await getStripeConnectionStatus(user.tenantId!);
  return res.json(status);
});

stripeIntegrationRouter.post('/api/integrations/stripe/connect', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requirePaymentsAccess(user, res)) return;

  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : '';
  if (!apiKey.trim()) {
    return res.status(400).json({ error: 'apiKey is required' });
  }

  try {
    const status = await connectStripe({ tenantId: user.tenantId!, userId: user.id, apiKey });
    return res.json(status);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

stripeIntegrationRouter.delete('/api/integrations/stripe', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requirePaymentsAccess(user, res)) return;

  await disconnectStripe(user.tenantId!);
  return res.status(204).end();
});
