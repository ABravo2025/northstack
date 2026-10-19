import prisma from '../../../lib/prisma.js';
import { recordAiConnectionActivity } from './oauthService.js';

// Settings → Integrations → AI assistants (spec-mcp-server.md §2b, §7) — a user's own AI
// connections. They're created only by the OAuth flow (oauthService.ts); here they're listed and
// revoked. Uses the shared `prisma` client like apiKeyService.ts: this is normal Session-
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

// `userId` set → that user's own connections; null → every connection in the tenant (the
// manage_api_access view, so whoever administers integrations can see and cut any of them).
// OAuth connections only — personal tokens from early staging testing aren't accepted anymore.
export async function listAiConnections(tenantId: string, userId: string | null): Promise<AiConnectionSummary[]> {
  return prisma.aiConnection.findMany({
    where: { tenantId, kind: 'oauth', ...(userId ? { userId } : {}) },
    orderBy: { createdAt: 'desc' },
    select: SUMMARY_SELECT,
  });
}

// `userId` set → may only revoke their own; null → any connection in the tenant. updateMany with
// `revokedAt: null` makes a repeat revoke (or someone else's id) a silent no-op, same as
// apiKeyService.revokeApiKey. Returns whether anything was revoked.
// `actingUserId` is who clicked Disconnect — the owner of the connection, or an admin cutting
// someone else's — and is who the Activity Log entry names.
export async function revokeAiConnection(tenantId: string, id: string, userId: string | null, actingUserId: string): Promise<boolean> {
  const connection = await prisma.aiConnection.findFirst({ where: { id, tenantId, revokedAt: null, ...(userId ? { userId } : {}) } });
  if (!connection) return false;
  const result = await prisma.aiConnection.updateMany({ where: { id: connection.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (result.count === 0) return false;
  await recordAiConnectionActivity(connection, 'delete', actingUserId);
  return true;
}
