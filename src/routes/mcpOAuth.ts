import type express from 'express';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { getClientIp, validateSession } from '../lib/httpAuth.js';
import { isRateLimited } from '../lib/rateLimit.js';
import { canUseAiAssistants } from '../modules/auth/permissionService.js';
import { isApiAccessAllowed } from '../modules/tenant/planLimits.js';
import {
  OAuthError,
  createAuthorizationCode,
  exchangeAuthorizationCode,
  findClientForRedirect,
  refreshAccessToken,
  registerClient,
  revokeToken,
} from '../modules/integrations/mcp/oauthService.js';

// OAuth 2.1 for AI assistants (spec-mcp-server.md §4.1) — how an assistant gets a connection: the
// person pastes https://<app>/mcp into it, the assistant discovers this server through the two
// .well-known documents, registers itself, sends the person to /oauth/authorize (the consent page in
// the SPA) and exchanges the code here. The discovery and token endpoints are public by design.

export const mcpOAuthRouter = createAsyncRouter();

// The deployment's own public origin (staging → staging, production → production) — also the
// issuer. From the forwarded headers Vercel sets, so it's right behind its proxy.
export function publicOrigin(req: express.Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() || req.headers.host;
  return `${proto}://${host}`;
}

function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp'],
    authorization_response_iss_parameter_supported: true,
  };
}

function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp'],
    resource_name: 'Northstack',
  };
}

// RFC 9728 — clients look it up both at the root and suffixed with the resource path.
for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
  mcpOAuthRouter.get(path, async (req, res) => res.json(protectedResourceMetadata(publicOrigin(req))));
}
// RFC 8414, plus the OpenID path some clients fall back to — same document.
for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/mcp', '/.well-known/openid-configuration']) {
  mcpOAuthRouter.get(path, async (req, res) => res.json(authorizationServerMetadata(publicOrigin(req))));
}

function oauthErrorResponse(res: express.Response, error: unknown) {
  if (error instanceof OAuthError) {
    return res.status(error.status).json({ error: error.code, error_description: error.message });
  }
  throw error;
}

// RFC 7591 Dynamic Client Registration — open (no initial access token), as MCP clients expect,
// so it's rate-limited per IP instead.
mcpOAuthRouter.post('/api/oauth/register', async (req, res) => {
  if (await isRateLimited(`oauth-register:${getClientIp(req)}`, { windowMs: 60 * 60_000, maxRequests: 20 })) {
    return res.status(429).json({ error: 'too_many_requests', error_description: 'Too many registrations. Try again later.' });
  }
  try {
    return res.status(201).json(await registerClient(req.body ?? {}));
  } catch (error) {
    return oauthErrorResponse(res, error);
  }
});

interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string | undefined;
  resource: string | undefined;
}

function readAuthorizeParams(source: Record<string, unknown>): AuthorizeParams {
  const str = (key: string) => (typeof source[key] === 'string' ? (source[key] as string) : '');
  return {
    clientId: str('client_id'),
    redirectUri: str('redirect_uri'),
    codeChallenge: str('code_challenge'),
    codeChallengeMethod: str('code_challenge_method') || 'plain',
    state: str('state') || undefined,
    resource: str('resource') || undefined,
  };
}

// Checks everything the consent screen depends on. Throws OAuthError for a broken request (shown
// on the page — never redirected to an unverified redirect_uri).
async function validateAuthorizeRequest(req: express.Request, params: AuthorizeParams) {
  if (!params.clientId || !params.redirectUri) throw new OAuthError('invalid_request', 'Missing client_id or redirect_uri.');
  const client = await findClientForRedirect(params.clientId, params.redirectUri);
  if (!params.codeChallenge || params.codeChallengeMethod !== 'S256') {
    throw new OAuthError('invalid_request', 'PKCE with code_challenge_method=S256 is required.');
  }
  if (params.resource) {
    const origin = publicOrigin(req);
    if (params.resource !== `${origin}/mcp` && params.resource !== origin) {
      throw new OAuthError('invalid_target', 'Unknown resource.');
    }
  }
  return client;
}

// The consent page (frontend /oauth/authorize) asks this what to show: which assistant, and
// whether this person can connect one at all (Growth plan + "Use AI assistants").
mcpOAuthRouter.get('/api/oauth/authorize/context', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  try {
    const client = await validateAuthorizeRequest(req, readAuthorizeParams(req.query as Record<string, unknown>));
    const blocked = !isApiAccessAllowed(user.tenant) ? 'plan' : !canUseAiAssistants(user.roleContext) ? 'permission' : null;
    return res.json({ clientName: client.clientName, redirectHost: new URL(readAuthorizeParams(req.query as Record<string, unknown>).redirectUri).host, blocked });
  } catch (error) {
    return oauthErrorResponse(res, error);
  }
});

function buildRedirect(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

// The person's decision on the consent page. Returns where to send the browser — the client's own
// redirect URI with a code (approve) or error=access_denied (deny).
mcpOAuthRouter.post('/api/oauth/authorize', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  const params = readAuthorizeParams(req.body ?? {});
  try {
    await validateAuthorizeRequest(req, params);
  } catch (error) {
    return oauthErrorResponse(res, error);
  }
  const iss = publicOrigin(req);

  if (req.body?.decision !== 'approve') {
    return res.json({ redirectTo: buildRedirect(params.redirectUri, { error: 'access_denied', state: params.state, iss }) });
  }
  if (!isApiAccessAllowed(user.tenant) || !canUseAiAssistants(user.roleContext)) {
    return res.status(403).json({ error: 'access_denied', error_description: "Your plan or role doesn't allow AI assistants." });
  }

  const code = await createAuthorizationCode({
    clientId: params.clientId,
    userId: user.id,
    tenantId: user.tenantId!,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    resource: params.resource ?? null,
  });
  return res.json({ redirectTo: buildRedirect(params.redirectUri, { code, state: params.state, iss }) });
});

// Token endpoint (form-encoded per the spec; JSON accepted too). Public clients, so no client
// secret — the PKCE verifier proves it's the same client that started the flow.
mcpOAuthRouter.post('/api/oauth/token', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const body = (req.body ?? {}) as Record<string, string | undefined>;
  try {
    if (body.grant_type === 'authorization_code') {
      return res.json(
        await exchangeAuthorizationCode({
          code: body.code ?? '',
          clientId: body.client_id ?? '',
          redirectUri: body.redirect_uri ?? '',
          codeVerifier: body.code_verifier ?? '',
        }),
      );
    }
    if (body.grant_type === 'refresh_token') {
      return res.json(await refreshAccessToken({ refreshToken: body.refresh_token ?? '', clientId: body.client_id ?? '' }));
    }
    return res.status(400).json({ error: 'unsupported_grant_type', error_description: 'Use authorization_code or refresh_token.' });
  } catch (error) {
    return oauthErrorResponse(res, error);
  }
});

mcpOAuthRouter.post('/api/oauth/revoke', async (req, res) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  if (token) await revokeToken(token);
  return res.status(200).end();
});
