import { Prisma, PrismaClient } from '@prisma/client';
import type { ExtendedPrismaClient } from './prisma.js';

// Private API (spec-private-api-webhooks.md, decision #11) — a PrismaClient of its own for
// /api/external/v1/* traffic, separate from the shared `prisma` singleton (lib/prisma.ts) that
// every internal /api/* route uses. Same Postgres, same DATABASE_URL, but with its own small,
// explicit connection_limit so a flood or a bug against the external API can only exhaust ITS OWN
// connection budget — it can never starve the pool the rest of the app (the SPA) depends on.
// Deliberately not the same client with a bigger pool split some other way: Prisma pools per
// PrismaClient instance, so two instances are the only way to get two independently-bounded
// budgets out of one process.
//
// The retry-on-transient-Neon-error $extends below is a deliberate COPY of prisma.ts's own, not a
// shared import — see prisma.ts's comment on why: a static import of a real value from prisma.js
// would break any test that wholesale-mocks that module for something unrelated. Only the type
// (`ExtendedPrismaClient`, erased at compile time) is imported from there.
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;
const RETRYABLE_ERROR_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);
const EXTERNAL_API_CONNECTION_LIMIT = 5;

function isRetryableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return RETRYABLE_ERROR_CODES.has(error.code);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withConnectionLimit(databaseUrl: string, limit: number): string {
  const url = new URL(databaseUrl);
  url.searchParams.set('connection_limit', String(limit));
  return url.toString();
}

// No eager throw on a missing DATABASE_URL — mirrors prisma.ts's own client, which never
// validates the connection string at construction time either (Prisma only needs it at the first
// real query). Anything stricter here would break at *import* time: tests/apiKeyService.test.ts
// only needs externalApiAuth.ts's pure helpers (generateApiKey, hashApiKey, API_SCOPES), never
// prismaExternal itself, but a static import chain still runs this module's top-level code.
function createPrismaExternalClient(): ExtendedPrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  return new PrismaClient(
    databaseUrl ? { datasources: { db: { url: withConnectionLimit(databaseUrl, EXTERNAL_API_CONNECTION_LIMIT) } } } : undefined,
  ).$extends({
    query: {
      async $allOperations({ args, query }) {
        for (let attempt = 0; ; attempt++) {
          try {
            return await query(args);
          } catch (error) {
            if (attempt >= MAX_RETRIES || !isRetryableError(error)) {
              throw error;
            }
            await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
          }
        }
      },
    },
  });
}

const globalForPrismaExternal = globalThis as unknown as { prismaExternal?: ExtendedPrismaClient };

const prismaExternal = globalForPrismaExternal.prismaExternal ?? createPrismaExternalClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrismaExternal.prismaExternal = prismaExternal;
}

export default prismaExternal;
