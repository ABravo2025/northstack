import { createHash, randomBytes } from 'node:crypto';
import prisma from '../../../lib/prisma.js';
import { generateAiToken, hashApiKey } from '../../../lib/externalApiAuth.js';

// OAuth 2.1 authorization server for AI assistants (spec-mcp-server.md §4.1, Alejandro 2026-10-16:
// connections are OAuth-only). Implements just what MCP clients (claude.ai, ChatGPT, Claude Code,
// Cursor, VS Code) need: Dynamic Client Registration (RFC 7591) for public clients, the
// authorization-code grant with mandatory PKCE S256, refresh tokens with rotation + reuse
// detection, and revocation (RFC 7009). Lives in the app's API function (it needs the database);
// the MCP function itself never touches any of this.

export const ACCESS_TOKEN_TTL_MS = 60 * 60_000; // 1 hour
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000; // 30 days
const AUTHORIZATION_CODE_TTL_MS = 10 * 60_000; // 10 minutes
const REFRESH_TOKEN_PREFIX = 'nk_rt_';
const MAX_CLIENT_NAME_LENGTH = 80;
const MAX_REDIRECT_URIS = 10;

export class OAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// RFC 8252 / OAuth 2.1: https anywhere, plain http only on loopback (desktop clients like Claude
// Code listen on localhost), or a private-use scheme for native apps (cursor://, vscode://…).
// Never script-capable or local-file schemes.
export function isAllowedRedirectUri(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:') return LOOPBACK_HOSTS.has(url.hostname);
  const scheme = url.protocol.slice(0, -1);
  if (['javascript', 'data', 'file', 'vbscript', 'blob', 'about', 'ftp', 'ws', 'wss'].includes(scheme)) return false;
  return /^[a-z][a-z0-9+.-]*$/.test(scheme);
}

// Exact match, except loopback redirects, whose port the client picks at runtime (RFC 8252 §7.3).
export function redirectUriMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  let req: URL;
  try {
    req = new URL(requested);
  } catch {
    return false;
  }
  if (req.protocol !== 'http:' || !LOOPBACK_HOSTS.has(req.hostname)) return false;
  return registered.some((candidate) => {
    try {
      const reg = new URL(candidate);
      return reg.protocol === 'http:' && reg.hostname === req.hostname && reg.pathname === req.pathname && reg.search === req.search;
    } catch {
      return false;
    }
  });
}

export interface RegisteredClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: 'none';
  client_id_issued_at: number;
}

export async function registerClient(input: { client_name?: unknown; redirect_uris?: unknown; token_endpoint_auth_method?: unknown }): Promise<RegisteredClient> {
  const redirectUris = Array.isArray(input.redirect_uris) ? input.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
  if (redirectUris.length === 0 || redirectUris.length > MAX_REDIRECT_URIS) {
    throw new OAuthError('invalid_redirect_uri', `Provide between 1 and ${MAX_REDIRECT_URIS} redirect_uris.`);
  }
  const bad = redirectUris.find((uri) => !isAllowedRedirectUri(uri));
  if (bad) throw new OAuthError('invalid_redirect_uri', `Redirect URI not allowed: ${bad}`);
  if (input.token_endpoint_auth_method !== undefined && input.token_endpoint_auth_method !== 'none') {
    throw new OAuthError('invalid_client_metadata', 'Only public clients (token_endpoint_auth_method "none") are supported.');
  }

  const rawName = typeof input.client_name === 'string' ? input.client_name.trim() : '';
  const clientName = (rawName || 'AI assistant').slice(0, MAX_CLIENT_NAME_LENGTH);
  const client = await prisma.oAuthClient.create({
    data: { clientId: `nsc_${randomToken(18)}`, clientName, redirectUris },
  });
  return {
    client_id: client.clientId,
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
  };
}

export async function findClientForRedirect(clientId: string, redirectUri: string) {
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) throw new OAuthError('invalid_client', 'Unknown client.');
  if (!redirectUriMatches(client.redirectUris, redirectUri)) {
    throw new OAuthError('invalid_redirect_uri', 'This redirect URI is not registered for the client.');
  }
  return client;
}

export async function createAuthorizationCode(input: {
  clientId: string;
  userId: string;
  tenantId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
}): Promise<string> {
  const code = randomToken();
  await prisma.oAuthAuthorizationCode.create({
    data: {
      codeHash: hashApiKey(code),
      clientId: input.clientId,
      userId: input.userId,
      tenantId: input.tenantId,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      resource: input.resource,
      expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
    },
  });
  return code;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

function s256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function issueTokenPair() {
  const { fullKey: accessToken, keyPrefix } = generateAiToken();
  const refreshToken = `${REFRESH_TOKEN_PREFIX}${randomToken()}`;
  const now = Date.now();
  return {
    accessToken,
    refreshToken,
    columns: {
      tokenPrefix: keyPrefix,
      accessTokenHash: hashApiKey(accessToken),
      accessTokenExpiresAt: new Date(now + ACCESS_TOKEN_TTL_MS),
      refreshTokenHash: hashApiKey(refreshToken),
      refreshTokenExpiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
    },
  };
}

function tokenResponse(accessToken: string, refreshToken: string): TokenResponse {
  return { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_MS / 1000, refresh_token: refreshToken, scope: 'mcp' };
}

export async function exchangeAuthorizationCode(input: { code: string; clientId: string; redirectUri: string; codeVerifier: string }): Promise<TokenResponse> {
  const record = await prisma.oAuthAuthorizationCode.findUnique({ where: { codeHash: hashApiKey(input.code) }, include: { client: true } });
  if (!record || record.clientId !== input.clientId || record.redirectUri !== input.redirectUri) {
    throw new OAuthError('invalid_grant', 'Invalid authorization code.');
  }
  if (record.usedAt || record.expiresAt < new Date()) {
    throw new OAuthError('invalid_grant', 'Authorization code expired or already used.');
  }
  if (!input.codeVerifier || s256(input.codeVerifier) !== record.codeChallenge) {
    throw new OAuthError('invalid_grant', 'PKCE verification failed.');
  }

  // Mark used first, conditionally, so two concurrent exchanges of the same code can't both win.
  const claimed = await prisma.oAuthAuthorizationCode.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count === 0) throw new OAuthError('invalid_grant', 'Authorization code already used.');

  const pair = issueTokenPair();
  await prisma.aiConnection.create({
    data: {
      tenantId: record.tenantId,
      userId: record.userId,
      kind: 'oauth',
      clientName: record.client.clientName,
      oauthClientId: record.clientId,
      ...pair.columns,
    },
  });
  return tokenResponse(pair.accessToken, pair.refreshToken);
}

export async function refreshAccessToken(input: { refreshToken: string; clientId: string }): Promise<TokenResponse> {
  const hash = hashApiKey(input.refreshToken);
  const connection = await prisma.aiConnection.findUnique({ where: { refreshTokenHash: hash } });

  if (!connection) {
    // A refresh token we already rotated away from: it was copied and replayed. Cut the connection.
    const replayed = await prisma.aiConnection.findUnique({ where: { previousRefreshTokenHash: hash } });
    if (replayed && !replayed.revokedAt) {
      await prisma.aiConnection.update({ where: { id: replayed.id }, data: { revokedAt: new Date() } });
    }
    throw new OAuthError('invalid_grant', 'Invalid refresh token.');
  }
  if (connection.oauthClientId !== input.clientId) throw new OAuthError('invalid_grant', 'Refresh token was issued to a different client.');
  if (connection.revokedAt || !connection.refreshTokenExpiresAt || connection.refreshTokenExpiresAt < new Date()) {
    throw new OAuthError('invalid_grant', 'Refresh token expired or revoked. Connect the assistant again.');
  }

  const pair = issueTokenPair();
  const rotated = await prisma.aiConnection.updateMany({
    where: { id: connection.id, refreshTokenHash: hash },
    data: { ...pair.columns, previousRefreshTokenHash: hash },
  });
  if (rotated.count === 0) throw new OAuthError('invalid_grant', 'Refresh token already used.');
  return tokenResponse(pair.accessToken, pair.refreshToken);
}

// RFC 7009: always succeeds from the caller's point of view, whether or not the token existed.
export async function revokeToken(token: string): Promise<void> {
  const hash = hashApiKey(token);
  await prisma.aiConnection.updateMany({
    where: { OR: [{ accessTokenHash: hash }, { refreshTokenHash: hash }], revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
