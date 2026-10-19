import type express from 'express';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { validateSession } from '../lib/httpAuth.js';
import { canManageApiAccess, canUseAiAssistants } from '../modules/auth/permissionService.js';
import { isApiAccessAllowed } from '../modules/tenant/planLimits.js';
import { listAiConnections, revokeAiConnection } from '../modules/integrations/mcp/aiConnectionService.js';
import type { SessionUser } from '../lib/payrollAccess.js';

// Settings → Integrations → AI assistants (spec-mcp-server.md §2b, §7). Session-authenticated SPA
// traffic for listing and revoking connections (they're created by the OAuth flow, routes/mcpOAuth.ts); the MCP server itself (Unit 3) calls /api/external/v1/* with
// the token, never these routes. Growth-only, same plan flag as API keys (apiAccessEnabled).

export const mcpIntegrationRouter = createAsyncRouter();

function requireAiAssistants(user: SessionUser, res: express.Response): boolean {
  if (!isApiAccessAllowed(user.tenant)) {
    res.status(403).json({ error: 'AI assistants require the Growth plan.', code: 'plan_upgrade_required' });
    return false;
  }
  if (!canUseAiAssistants(user.roleContext)) {
    res.status(403).json({ error: "Your role doesn't allow connecting AI assistants." });
    return false;
  }
  return true;
}

// `?scope=all` → every connection in the tenant, for whoever manages integrations
// (manage_api_access); otherwise only the caller's own.
mcpIntegrationRouter.get('/api/integrations/ai-connections', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;

  if (req.query.scope === 'all') {
    if (!isApiAccessAllowed(user.tenant) || !canManageApiAccess(user.roleContext)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    return res.json(await listAiConnections(user.tenantId!, null));
  }

  if (!requireAiAssistants(user, res)) return;
  return res.json(await listAiConnections(user.tenantId!, user.id));
});

// Anyone may revoke their own connection — even after losing use_ai_assistants or the Growth plan,
// so cutting access never depends on still having it. manage_api_access may revoke anyone's.
mcpIntegrationRouter.delete('/api/integrations/ai-connections/:id', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;

  const ownerScope = canManageApiAccess(user.roleContext) ? null : user.id;
  const revoked = await revokeAiConnection(user.tenantId!, req.params.id, ownerScope, user.id);
  if (!revoked) return res.status(404).json({ error: 'Connection not found' });
  return res.status(204).end();
});
