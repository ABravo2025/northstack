import type express from 'express';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { validateSession } from '../lib/httpAuth.js';
import { canManageApiAccess } from '../modules/auth/permissionService.js';
import { createApiKey, listApiKeys, revokeApiKey } from '../modules/integrations/apiKeyService.js';
import {
  createSubscription,
  deleteSubscription,
  listDeliveries,
  listSubscriptions,
  regenerateSecret,
  retryDelivery,
  updateSubscription,
} from '../modules/integrations/webhookService.js';

// Settings → Integrations → API & Webhooks management (spec-private-api-webhooks.md §2, §7.4, §8)
// — normal Session-authenticated SPA traffic, not /api/external/v1/* itself (that router, Units
// 2-3, authenticates via ApiKey instead and lives in routes/externalApi.ts). Keys and webhook
// subscriptions share the same page and the same canManageApiAccess gate, so they share this
// router too.

export const apiAccessIntegrationRouter = createAsyncRouter();

function requireApiAccess(user: { roleContext: import('../modules/auth/roleService.js').RoleContext }, res: express.Response): boolean {
  if (!canManageApiAccess(user.roleContext)) {
    res.status(403).json({ error: 'Only the workspace owner (or a role granted API access) can manage API keys.' });
    return false;
  }
  return true;
}

apiAccessIntegrationRouter.get('/api/integrations/api-keys', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requireApiAccess(user, res)) return;

  const keys = await listApiKeys(user.tenantId!);
  return res.json(keys);
});

apiAccessIntegrationRouter.post('/api/integrations/api-keys', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requireApiAccess(user, res)) return;

  const name = typeof req.body?.name === 'string' ? req.body.name : '';
  const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes.filter((s: unknown) => typeof s === 'string') : [];

  try {
    const created = await createApiKey(user.tenantId!, user.id, { name, scopes });
    return res.status(201).json(created);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

apiAccessIntegrationRouter.delete('/api/integrations/api-keys/:id', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requireApiAccess(user, res)) return;

  await revokeApiKey(user.tenantId!, req.params.id);
  return res.status(204).end();
});

apiAccessIntegrationRouter.get('/api/integrations/webhooks', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requireApiAccess(user, res)) return;

  const subscriptions = await listSubscriptions(user.tenantId!);
  return res.json(subscriptions);
});

apiAccessIntegrationRouter.post('/api/integrations/webhooks', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requireApiAccess(user, res)) return;

  const url = typeof req.body?.url === 'string' ? req.body.url : '';
  const events = Array.isArray(req.body?.events) ? req.body.events.filter((e: unknown) => typeof e === 'string') : [];

  try {
    const created = await createSubscription(user.tenantId!, user.id, { url, events });
    return res.status(201).json(created);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

apiAccessIntegrationRouter.patch('/api/integrations/webhooks/:id', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requireApiAccess(user, res)) return;

  const input: { url?: string; events?: string[]; isActive?: boolean } = {};
  if (typeof req.body?.url === 'string') input.url = req.body.url;
  if (Array.isArray(req.body?.events)) input.events = req.body.events.filter((e: unknown) => typeof e === 'string');
  if (typeof req.body?.isActive === 'boolean') input.isActive = req.body.isActive;

  try {
    const updated = await updateSubscription(user.tenantId!, req.params.id, input);
    if (!updated) return res.status(404).json({ error: 'Webhook subscription not found' });
    return res.json(updated);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

apiAccessIntegrationRouter.delete('/api/integrations/webhooks/:id', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requireApiAccess(user, res)) return;

  await deleteSubscription(user.tenantId!, req.params.id);
  return res.status(204).end();
});

apiAccessIntegrationRouter.post('/api/integrations/webhooks/:id/regenerate-secret', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requireApiAccess(user, res)) return;

  const result = await regenerateSecret(user.tenantId!, req.params.id);
  if (!result) return res.status(404).json({ error: 'Webhook subscription not found' });
  return res.json(result);
});

apiAccessIntegrationRouter.get('/api/integrations/webhooks/:id/deliveries', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requireApiAccess(user, res)) return;

  const deliveries = await listDeliveries(user.tenantId!, req.params.id);
  if (!deliveries) return res.status(404).json({ error: 'Webhook subscription not found' });
  return res.json(deliveries);
});

apiAccessIntegrationRouter.post('/api/integrations/webhooks/deliveries/:deliveryId/retry', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requireApiAccess(user, res)) return;

  const result = await retryDelivery(user.tenantId!, req.params.deliveryId);
  if (!result) return res.status(404).json({ error: 'Delivery not found' });
  return res.json(result);
});
