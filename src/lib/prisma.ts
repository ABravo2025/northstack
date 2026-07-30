import { Prisma, PrismaClient } from '@prisma/client';

// Tenant isolation in this codebase is enforced by convention at the query
// call site, not by a Prisma middleware/extension — every module was audited
// (2026-07-30) and follows one of exactly two patterns:
//   1. List queries (findMany) on tenant-scoped models always filter by
//      `tenantId` directly, e.g. `prisma.company.findMany({ where: { tenantId } })`.
//      This is the one that matters: a findMany missing this filter would leak
//      every tenant's rows in a single response.
//   2. Single-record lookups by a global id (findUnique/findFirst — e.g.
//      findCompanyById, findEmployeeById, findUserById) are deliberately
//      unscoped, because the id itself is already globally unique. The caller
//      is required to check `result.tenantId === tenantId` before trusting the
//      row (see e.g. tenantUserService.ts's updateTenantUser). A handful of
//      findMany calls filter by an already tenant-verified parent foreign key
//      instead of tenantId directly (e.g. companyService.ts's deleteCompany
//      finding that company's Opportunities by `companyId`) — also safe, same
//      reasoning as pattern 2.
// A blanket "require tenantId in every where clause" $extends guard was
// considered and rejected: it would false-positive on pattern 2 (the
// deliberate global-lookup-then-verify convention used throughout auth/CRM/HR),
// so enforcing it would need to special-case most of the codebase rather than
// catch real mistakes. New tenant-scoped list queries should follow pattern 1
// above; there is currently no known query that doesn't.

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;

// Neon connections can drop or take a moment to wake up from idle. These are
// the Prisma error codes for connection-level failures (not query errors
// like a unique constraint violation, which should fail immediately).
const RETRYABLE_ERROR_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

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

function createPrismaClient() {
  return new PrismaClient().$extends({
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

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrismaClient };

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
