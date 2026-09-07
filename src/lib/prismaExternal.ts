import { PrismaClient } from '@prisma/client';

// Private API (spec-private-api-webhooks.md, decision #11) — a PrismaClient of its own for
// /api/external/v1/* traffic, separate from the shared `prisma` singleton (lib/prisma.ts) that
// every internal /api/* route uses. Same Postgres, same DATABASE_URL, but with its own small,
// explicit connection_limit so a flood or a bug against the external API can only exhaust ITS OWN
// connection budget — it can never starve the pool the rest of the app (the SPA) depends on.
// Deliberately not the same client with a bigger pool split some other way: Prisma pools per
// PrismaClient instance, so two instances are the only way to get two independently-bounded
// budgets out of one process.
const EXTERNAL_API_CONNECTION_LIMIT = 5;

function withConnectionLimit(databaseUrl: string, limit: number): string {
  const url = new URL(databaseUrl);
  url.searchParams.set('connection_limit', String(limit));
  return url.toString();
}

function createPrismaExternalClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set — cannot construct the external API Prisma client.');
  }
  return new PrismaClient({
    datasources: { db: { url: withConnectionLimit(databaseUrl, EXTERNAL_API_CONNECTION_LIMIT) } },
  });
}

type ExternalPrismaClient = ReturnType<typeof createPrismaExternalClient>;

const globalForPrismaExternal = globalThis as unknown as { prismaExternal?: ExternalPrismaClient };

const prismaExternal = globalForPrismaExternal.prismaExternal ?? createPrismaExternalClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrismaExternal.prismaExternal = prismaExternal;
}

export default prismaExternal;
