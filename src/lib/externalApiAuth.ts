import { createHash, randomBytes } from 'node:crypto';
import type express from 'express';
import { getBearerToken } from './httpAuth.js';
import { bestEffort } from './bestEffort.js';
import prismaExternal from './prismaExternal.js';

// Private API (spec-private-api-webhooks.md §2/§3) — authentication and authorization for
// /api/external/v1/*, completely separate from Session/authenticateToken (httpAuth.ts): an ApiKey
// never logs into the SPA, a session token never authenticates here. getBearerToken is reused
// (same `Authorization: Bearer <token>` header shape) but everything downstream reads ApiKey, not
// Session.

const KEY_PREFIX = 'nk_live_';
const RANDOM_BYTES_LENGTH = 32;
// "nk_live_" (8 chars) + the first 6 chars of the random part — enough to tell a tenant's own keys
// apart in a list (spec §1's example: "nk_live_ab12cd") without exposing anything closer to the
// full secret.
const KEY_PREFIX_DISPLAY_LENGTH = 14;
const BASE62_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function toBase62(bytes: Buffer): string {
  let value = BigInt(`0x${bytes.toString('hex')}`);
  if (value === 0n) return '0';
  const base = BigInt(62);
  let out = '';
  while (value > 0n) {
    out = BASE62_ALPHABET[Number(value % base)] + out;
    value /= base;
  }
  return out;
}

export interface GeneratedApiKey {
  fullKey: string;
  keyPrefix: string;
}

// 32 random bytes (crypto.randomBytes, same source as every other secret this project generates)
// base62-encoded — collisions are astronomically unlikely, so no uniqueness retry loop; the DB's
// unique index on ApiKey.keyHash is the real backstop.
export function generateApiKey(): GeneratedApiKey {
  const fullKey = `${KEY_PREFIX}${toBase62(randomBytes(RANDOM_BYTES_LENGTH))}`;
  return { fullKey, keyPrefix: fullKey.slice(0, KEY_PREFIX_DISPLAY_LENGTH) };
}

// Plain SHA-256, not scrypt (User.passwordHash, authService.ts) — scrypt defends against brute-
// forcing a LOW-entropy human-chosen secret; this key is 256 random bits, already infeasible to
// brute-force, so a fast hash is enough (same choice Stripe/GitHub make for their own API keys).
// Lookup happens via the DB's unique index on keyHash (an indexed equality match against an
// already-unguessable value), not an in-process string comparison against a stored secret, so
// there's no constant-time-compare concern to add here either.
export function hashApiKey(fullKey: string): string {
  return createHash('sha256').update(fullKey).digest('hex');
}

// Full scope catalog (spec §3) — the allowlist apiKeyService.createApiKey validates a requested
// scope set against, and, as each resource's endpoints land in Unit 2/3, what each route's
// requireScope call checks against. `crm.pipelines` is read-only on purpose (spec §3: pipelines
// are configuration, not a "movimiento" a machine-to-machine integration should be writing).
// `hr.payroll:write` is deliberately NOT in this catalog (Alejandro, 2026-09-07, spec §10 risk #1)
// — it's the single highest-risk scope (a leaked key with it could trigger real pay runs), and no
// extra safeguard (e.g. an email-confirmation step) is built for it in v1. `hr.payroll:read` stays
// available; a key can never be granted the write half until that's revisited for v2.
export const API_SCOPES = [
  'hr.employees:read', 'hr.employees:write',
  'hr.timeoff:read', 'hr.timeoff:write',
  'hr.payroll:read',
  'crm.companies:read', 'crm.companies:write',
  'crm.contacts:read', 'crm.contacts:write',
  'crm.opportunities:read', 'crm.opportunities:write',
  'crm.pipelines:read',
  'tasks:read', 'tasks:write',
  'notes:read', 'notes:write',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export interface AuthenticatedApiKey {
  id: string;
  tenantId: string;
  scopes: string[];
  // Unit 3 (write endpoints) attributes every entity this key creates/edits to whoever created
  // the key (createdById/changedByUserId — every existing service function requires a User id
  // there, and an ApiKey isn't a User/session, so it has none of its own to supply).
  createdByUserId: string;
}

// 401s immediately on any failure, no anonymous fallback — every route under /api/external/v1/*
// requires a valid key (spec §6, decision #7: this API has no equivalent of /api/public/*'s
// deliberately-open form endpoints).
export async function authenticateApiKey(req: express.Request, res: express.Response): Promise<AuthenticatedApiKey | null> {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required', code: 'missing_api_key' });
    return null;
  }

  const apiKey = await prismaExternal.apiKey.findUnique({ where: { keyHash: hashApiKey(token) } });
  if (!apiKey || apiKey.revokedAt) {
    res.status(401).json({ error: 'Invalid or revoked API key', code: 'invalid_api_key' });
    return null;
  }

  // Best-effort per bestEffort.ts: still awaited (so it's done before the response is sent, given
  // Vercel can freeze the function right after), but a failure here never fails the request itself.
  await bestEffort(
    prismaExternal.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }),
    `Failed to update ApiKey.lastUsedAt for ${apiKey.id}`,
  );

  return { id: apiKey.id, tenantId: apiKey.tenantId, scopes: apiKey.scopes, createdByUserId: apiKey.createdByUserId };
}

export function hasScope(apiKey: AuthenticatedApiKey, scope: string): boolean {
  return apiKey.scopes.includes(scope);
}

// Called manually inside each route handler (like requirePaymentsAccess in paymentsAccess.ts) —
// createAsyncRouter (asyncRouter.ts) only wraps exact (path, singleHandler) registrations, so a
// real Express middleware chain here would silently lose the async-error-catching wrapper. Routes
// under /api/external/v1/* (routes/externalApi.ts, Unit 2) use `hasScope` directly instead, since
// their 403 response also needs to write an ApiRequestLog row before responding.
export function requireScope(apiKey: AuthenticatedApiKey, scope: string, res: express.Response): boolean {
  if (!hasScope(apiKey, scope)) {
    res.status(403).json({
      error: `This API key is missing the required scope: ${scope}`,
      code: 'missing_scope',
      required: scope,
    });
    return false;
  }
  return true;
}
