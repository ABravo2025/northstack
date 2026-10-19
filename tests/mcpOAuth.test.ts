import { createHash } from 'node:crypto';
import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// OAuth 2.1 for AI assistants (spec-mcp-server.md §4.1): DCR, authorization code + PKCE, refresh
// rotation with reuse detection, revocation and the discovery documents. Prisma is an in-memory
// fake so the whole flow runs end to end through the real service functions.

let clients: any[] = [];
let codes: any[] = [];
let connections: any[] = [];
let activity: any[] = [];
let seq = 0;

function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return (value as any[]).some((cond) => matches(row, cond));
    return row[key] === value;
  });
}

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    oAuthClient: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `c${++seq}`, createdAt: new Date(), ...data };
        clients.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: any) => clients.find((c) => c.clientId === where.clientId) ?? null),
    },
    oAuthAuthorizationCode: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `code${++seq}`, usedAt: null, createdAt: new Date(), ...data };
        codes.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const row = codes.find((c) => c.codeHash === where.codeHash);
        return row ? { ...row, client: clients.find((c) => c.clientId === row.clientId) } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const rows = codes.filter((c) => matches(c, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      }),
    },
    activityLogEntry: {
      create: vi.fn(async ({ data }: any) => {
        activity.push(data);
        return data;
      }),
    },
    aiConnection: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `conn${++seq}`, revokedAt: null, previousRefreshTokenHash: null, ...data };
        connections.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: any) => connections.find((c) => matches(c, where)) ?? null),
      findFirst: vi.fn(async ({ where }: any) => connections.find((c) => matches(c, where)) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const row = connections.find((c) => c.id === where.id);
        Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const rows = connections.filter((c) => matches(c, where));
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      }),
    },
  },
}));
vi.mock('../src/lib/rateLimit.js', () => ({ isRateLimited: vi.fn(async () => false) }));

import {
  createAuthorizationCode,
  exchangeAuthorizationCode,
  isAllowedRedirectUri,
  redirectUriMatches,
  refreshAccessToken,
  registerClient,
  revokeToken,
} from '../src/modules/integrations/mcp/oauthService.js';
import { mcpOAuthRouter } from '../src/routes/mcpOAuth.js';

const VERIFIER = 'a-long-random-pkce-verifier-string-0123456789-abcdefghij';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

beforeEach(() => {
  clients = [];
  codes = [];
  connections = [];
  activity = [];
});

describe('redirect URIs', () => {
  it('allows https, loopback http and private-use app schemes', () => {
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(isAllowedRedirectUri('http://localhost:33418/callback')).toBe(true);
    expect(isAllowedRedirectUri('http://127.0.0.1:5000/cb')).toBe(true);
    expect(isAllowedRedirectUri('cursor://anysphere.cursor-retrieval/oauth/callback')).toBe(true);
  });

  it('rejects plain http to a real host and script/file schemes', () => {
    expect(isAllowedRedirectUri('http://evil.example.com/cb')).toBe(false);
    expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false);
    expect(isAllowedRedirectUri('file:///etc/passwd')).toBe(false);
    expect(isAllowedRedirectUri('data:text/html,hi')).toBe(false);
    expect(isAllowedRedirectUri('not a url')).toBe(false);
  });

  it('matches exactly, except loopback where the port may change', () => {
    expect(redirectUriMatches(['https://claude.ai/cb'], 'https://claude.ai/cb')).toBe(true);
    expect(redirectUriMatches(['https://claude.ai/cb'], 'https://claude.ai/cb2')).toBe(false);
    expect(redirectUriMatches(['http://localhost:1111/callback'], 'http://localhost:2222/callback')).toBe(true);
    expect(redirectUriMatches(['http://localhost:1111/callback'], 'http://localhost:2222/other')).toBe(false);
  });
});

async function registerAndAuthorize() {
  const client = await registerClient({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] });
  const code = await createAuthorizationCode({
    clientId: client.client_id,
    userId: 'u1',
    tenantId: 't1',
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
    codeChallenge: CHALLENGE,
    resource: null,
  });
  return { client, code };
}

describe('authorization code + PKCE', () => {
  it('issues tokens and creates an OAuth connection named after the client', async () => {
    const { client, code } = await registerAndAuthorize();
    const tokens = await exchangeAuthorizationCode({ code, clientId: client.client_id, redirectUri: 'https://claude.ai/api/mcp/auth_callback', codeVerifier: VERIFIER });

    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.access_token.startsWith('nk_mcp_')).toBe(true);
    expect(tokens.refresh_token.startsWith('nk_rt_')).toBe(true);
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({ kind: 'oauth', clientName: 'Claude', userId: 'u1', tenantId: 't1' });
    // Only hashes are stored.
    expect(JSON.stringify(connections[0])).not.toContain(tokens.access_token);
    // Connecting an assistant is in the Activity Log, attributed to the person who approved it.
    expect(activity).toEqual([expect.objectContaining({ entityType: 'aiConnection', action: 'create', entityLabel: 'Claude', changedByUserId: 'u1', tenantId: 't1' })]);
  });

  it('rejects a wrong PKCE verifier', async () => {
    const { client, code } = await registerAndAuthorize();
    await expect(
      exchangeAuthorizationCode({ code, clientId: client.client_id, redirectUri: 'https://claude.ai/api/mcp/auth_callback', codeVerifier: 'wrong' }),
    ).rejects.toThrow('PKCE');
  });

  it('a code works once', async () => {
    const { client, code } = await registerAndAuthorize();
    const args = { code, clientId: client.client_id, redirectUri: 'https://claude.ai/api/mcp/auth_callback', codeVerifier: VERIFIER };
    await exchangeAuthorizationCode(args);
    await expect(exchangeAuthorizationCode(args)).rejects.toThrow();
  });

  it('a code is bound to its client and redirect URI', async () => {
    const { client, code } = await registerAndAuthorize();
    await expect(exchangeAuthorizationCode({ code, clientId: 'someone-else', redirectUri: 'https://claude.ai/api/mcp/auth_callback', codeVerifier: VERIFIER })).rejects.toThrow();
    await expect(exchangeAuthorizationCode({ code, clientId: client.client_id, redirectUri: 'https://evil.example.com/cb', codeVerifier: VERIFIER })).rejects.toThrow();
  });
});

describe('refresh tokens', () => {
  async function connected() {
    const { client, code } = await registerAndAuthorize();
    const tokens = await exchangeAuthorizationCode({ code, clientId: client.client_id, redirectUri: 'https://claude.ai/api/mcp/auth_callback', codeVerifier: VERIFIER });
    return { client, tokens };
  }

  it('rotates: a new pair each time, the old refresh token stops working', async () => {
    const { client, tokens } = await connected();
    const next = await refreshAccessToken({ refreshToken: tokens.refresh_token, clientId: client.client_id });
    expect(next.access_token).not.toBe(tokens.access_token);
    expect(next.refresh_token).not.toBe(tokens.refresh_token);
  });

  it('replaying an already-rotated refresh token revokes the whole connection', async () => {
    const { client, tokens } = await connected();
    await refreshAccessToken({ refreshToken: tokens.refresh_token, clientId: client.client_id });
    await expect(refreshAccessToken({ refreshToken: tokens.refresh_token, clientId: client.client_id })).rejects.toThrow();
    expect(connections[0].revokedAt).toBeInstanceOf(Date);
    expect(activity.at(-1)).toMatchObject({ entityType: 'aiConnection', action: 'delete' });
  });

  it('is bound to the client it was issued to', async () => {
    const { tokens } = await connected();
    await expect(refreshAccessToken({ refreshToken: tokens.refresh_token, clientId: 'other' })).rejects.toThrow();
  });

  it('revocation (RFC 7009) cuts the connection', async () => {
    const { client, tokens } = await connected();
    await revokeToken(tokens.access_token);
    expect(connections[0].revokedAt).toBeInstanceOf(Date);
    expect(activity.map((a) => a.action)).toEqual(['create', 'delete']);
    await expect(refreshAccessToken({ refreshToken: tokens.refresh_token, clientId: client.client_id })).rejects.toThrow();
  });
});

describe('registration', () => {
  it('rejects disallowed redirect URIs and confidential clients', async () => {
    await expect(registerClient({ redirect_uris: ['http://evil.example.com/cb'] })).rejects.toThrow();
    await expect(registerClient({ redirect_uris: [] })).rejects.toThrow();
    await expect(registerClient({ redirect_uris: ['https://ok.example.com/cb'], token_endpoint_auth_method: 'client_secret_post' })).rejects.toThrow();
  });
});

describe('HTTP endpoints', () => {
  let server: http.Server;
  let base: string;

  beforeAll(() => {
    const app = express();
    app.use(express.json());
    app.use(['/api/oauth/token', '/api/oauth/revoke'], express.urlencoded({ extended: false }));
    app.use(mcpOAuthRouter);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  afterAll(() => server.close());

  it('serves protected-resource and authorization-server metadata from the request origin', async () => {
    const resource = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json();
    expect(resource.resource).toBe(`${base}/mcp`);
    expect(resource.authorization_servers).toEqual([base]);

    const as = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
    expect(as).toMatchObject({
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      registration_endpoint: `${base}/api/oauth/register`,
      code_challenge_methods_supported: ['S256'],
    });
  });

  it('registers a client (201) and runs the full token exchange over form-encoded HTTP', async () => {
    const reg = await fetch(`${base}/api/oauth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_name: 'ChatGPT', redirect_uris: ['https://chatgpt.com/connector/oauth/cb'] }),
    });
    expect(reg.status).toBe(201);
    const client = await reg.json();

    const code = await createAuthorizationCode({ clientId: client.client_id, userId: 'u1', tenantId: 't1', redirectUri: 'https://chatgpt.com/connector/oauth/cb', codeChallenge: CHALLENGE, resource: null });
    const token = await fetch(`${base}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: client.client_id, redirect_uri: 'https://chatgpt.com/connector/oauth/cb', code_verifier: VERIFIER }),
    });
    expect(token.status).toBe(200);
    expect(token.headers.get('cache-control')).toBe('no-store');
    expect((await token.json()).access_token.startsWith('nk_mcp_')).toBe(true);
  });

  it('answers OAuth errors in the RFC 6749 shape', async () => {
    const res = await fetch(`${base}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: 'nope', client_id: 'x', redirect_uri: 'https://x/cb', code_verifier: VERIFIER }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'invalid_grant' });
  });
});
