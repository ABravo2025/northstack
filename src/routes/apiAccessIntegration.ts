import type express from 'express';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { validateSession } from '../lib/httpAuth.js';
import { canManageApiAccess } from '../modules/auth/permissionService.js';
import { createApiKey, listApiKeys, revokeApiKey } from '../modules/integrations/apiKeyService.js';

// Settings → Integrations → API & Webhooks key management (spec-private-api-webhooks.md §2, §8) —
// normal Session-authenticated SPA traffic, not /api/external/v1/* itself (that router, Unit 2,
// authenticates via ApiKey instead and lives in routes/externalApi.ts).

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
