import prisma from '../../../lib/prisma.js';
import { generateAiToken, hashApiKey } from '../../../lib/externalApiAuth.js';

// Settings → Integrations → AI assistants (spec-mcp-server.md §2b, §7) — a user's own AI
// connections. Uses the shared `prisma` client like apiKeyService.ts: this is normal Session-
// authenticated SPA traffic, not /api/external/v1/* itself.

export interface AiConnectionSummary {
  id: string;
  kind: 'personal_token' | 'oauth';
  clientName: string;
  tokenPrefix: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
  user: { id: string; firstName: string; lastName: string };
}

export interface CreatePersonalTokenResult extends AiConnectionSummary {
  fullToken: string;
}

const SUMMARY_SELECT = {
  id: true,
  kind: true,
  clientName: true,
  tokenPrefix: true,
  lastUsedAt: true,
  createdAt: true,
  revokedAt: true,
  user: { select: { id: true, firstName: true, lastName: true } },
} as const;

const MAX_NAME_LENGTH = 60;

// For assistants that only accept a fixed header (no OAuth). The full token is returned exactly
// once, here — only its SHA-256 hash is stored, same as an API key.
export async function createPersonalToken(tenantId: string, userId: string, name: string): Promise<CreatePersonalTokenResult> {
  const clientName = name.trim();
  if (!clientName) throw new Error('Name is required.');
  if (clientName.length > MAX_NAME_LENGTH) throw new Error(`Name must be at most ${MAX_NAME_LENGTH} characters.`);

  const { fullKey, keyPrefix } = generateAiToken();
  const created = await prisma.aiConnection.create({
    data: {
      tenantId,
      userId,
      kind: 'personal_token',
      clientName,
      tokenPrefix: keyPrefix,
      personalTokenHash: hashApiKey(fullKey),
    },
    select: SUMMARY_SELECT,
  });
  return { ...created, fullToken: fullKey };
}

// `userId` set → that user's own connections; null → every connection in the tenant (the
// manage_api_access view, so whoever administers integrations can see and cut any of them).
export async function listAiConnections(tenantId: string, userId: string | null): Promise<AiConnectionSummary[]> {
  return prisma.aiConnection.findMany({
    where: { tenantId, ...(userId ? { userId } : {}) },
    orderBy: { createdAt: 'desc' },
    select: SUMMARY_SELECT,
  });
}

// `userId` set → may only revoke their own; null → any connection in the tenant. updateMany with
// `revokedAt: null` makes a repeat revoke (or someone else's id) a silent no-op, same as
// apiKeyService.revokeApiKey. Returns whether anything was revoked.
export async function revokeAiConnection(tenantId: string, id: string, userId: string | null): Promise<boolean> {
  const result = await prisma.aiConnection.updateMany({
    where: { id, tenantId, revokedAt: null, ...(userId ? { userId } : {}) },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}
