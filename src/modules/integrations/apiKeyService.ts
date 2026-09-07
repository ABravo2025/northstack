import prisma from '../../lib/prisma.js';
import { API_SCOPES, generateApiKey, hashApiKey, type ApiScope } from '../../lib/externalApiAuth.js';

// Management CRUD for Settings → Integrations → API & Webhooks (spec §2, §8). Uses the shared
// `prisma` client, not `prismaExternal` — these endpoints are normal Session-authenticated SPA
// traffic (owner managing their own keys), not /api/external/v1/* itself, so they don't need the
// isolated connection pool that exists to contain a flood against that other, third-party-facing
// surface.

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface CreateApiKeyResult extends ApiKeySummary {
  fullKey: string;
}

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
}

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
}

function sanitize(key: ApiKeyRow): ApiKeySummary {
  // Never includes keyHash or the full key — keyPrefix is the only fragment of the secret that's
  // ever shown again after creation (spec §2).
  return {
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
    revokedAt: key.revokedAt,
  };
}

// Creating a key with zero scopes is deliberately rejected — "a key that can never do anything" is
// almost certainly a mistake, and the spec's own security model (decision #1: every key is
// scopeless until the owner explicitly grants scopes) is about ensuring nothing is granted by
// default, not about permitting a genuinely useless key.
export async function createApiKey(tenantId: string, userId: string, input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Name is required.');
  }

  const scopes = Array.from(new Set(input.scopes));
  if (scopes.length === 0) {
    throw new Error('At least one scope is required.');
  }
  const unknownScopes = scopes.filter((scope) => !API_SCOPES.includes(scope as ApiScope));
  if (unknownScopes.length > 0) {
    throw new Error(`Unknown scope(s): ${unknownScopes.join(', ')}`);
  }

  const { fullKey, keyPrefix } = generateApiKey();
  const created = await prisma.apiKey.create({
    data: {
      tenantId,
      name,
      keyPrefix,
      keyHash: hashApiKey(fullKey),
      scopes,
      createdByUserId: userId,
    },
  });

  // The only point in this key's lifetime the full value is ever returned — the caller (the route
  // handler) is responsible for making sure the response reaches the owner and nowhere else.
  return { ...sanitize(created), fullKey };
}

export async function listApiKeys(tenantId: string): Promise<ApiKeySummary[]> {
  const keys = await prisma.apiKey.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
  return keys.map(sanitize);
}

// updateMany (not update) so revoking an already-revoked or nonexistent key is a silent no-op
// instead of a Prisma "record not found" throw — same fix already applied once to
// StripeConnection.disconnectedAt (Payments v1 Unit 1, and the pattern this task explicitly calls
// out to reuse). The `revokedAt: null` filter is what makes a double-revoke a no-op: the second
// call matches zero rows instead of re-stamping the timestamp.
export async function revokeApiKey(tenantId: string, id: string): Promise<void> {
  await prisma.apiKey.updateMany({
    where: { id, tenantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
