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
  const lapsedTrials = await prisma.tenant.findMany({
    where: { status: 'trialing', trialEndsAt: { lte: now } },
    select: { id: true, trialEndsAt: true },
  });

  for (const tenant of lapsedTrials) {
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        status: 'past_due',
        gracePeriodEndsAt: new Date(tenant.trialEndsAt!.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
      },
    });
  }

  const suspended = await prisma.tenant.updateMany({
    where: { status: 'past_due', gracePeriodEndsAt: { lte: now } },
    data: { status: 'suspended' },
  });

  return { movedToPastDue: lapsedTrials.length, movedToSuspended: suspended.count };
}
