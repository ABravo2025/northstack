import prisma from '../../lib/prisma.js';

// 14 days, spec-subscription-plans.md — set the first time a tenant lapses out of `trialing`.
const GRACE_PERIOD_DAYS = 14;

export interface PlanTransitionResult {
  movedToPastDue: number;
  movedToSuspended: number;
}

// Driven by a Vercel Cron hitting /api/internal/plan-transitions/run once a day (see
// src/routes/internal.ts) — spec-subscription-plans.md's state machine:
// trialing -> past_due (trialEndsAt lapses) -> suspended (gracePeriodEndsAt lapses).
//
// Idempotent by construction: each tenant only matches the "before" state's where-clause, so
// a tenant already moved to past_due in an earlier run is invisible to the trialing branch on
// a later run, and likewise for past_due -> suspended. Safe to call more than once for the
// same day (overlapping cron invocations, manual re-runs while testing locally, etc.).
export async function runPlanTransitions(now: Date = new Date()): Promise<PlanTransitionResult> {
  // Single statement rather than a findMany + per-row update loop — each row's
  // gracePeriodEndsAt is derived from its own trialEndsAt (not a shared constant), which is
  // why this couldn't previously just be a plain updateMany; computing it in SQL keeps it to
  // one round trip instead of N. On a day with many lapsed trials (a missed cron run, a
  // backfill), that also avoids the previous version risking a serverless timeout mid-loop —
  // which would have left this step silently incomplete while still reporting success.
  const movedToPastDue = await prisma.$executeRaw`
    UPDATE "Tenant"
    SET status = 'past_due'::"TenantStatus", "gracePeriodEndsAt" = "trialEndsAt" + (INTERVAL '1 day' * ${GRACE_PERIOD_DAYS})
    WHERE status = 'trialing'::"TenantStatus" AND "trialEndsAt" <= ${now}
  `;

  const suspended = await prisma.tenant.updateMany({
    where: { status: 'past_due', gracePeriodEndsAt: { lte: now } },
    data: { status: 'suspended' },
  });

  return { movedToPastDue, movedToSuspended: suspended.count };
}
