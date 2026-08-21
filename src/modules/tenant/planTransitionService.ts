import prisma from '../../lib/prisma.js';
import { updatePreapproval } from '../../lib/mercadopago.js';
import { syncSubscriptionAndTenant } from './subscriptionService.js';

// 14 days, spec-subscription-plans.md — set the first time a tenant lapses out of `trialing`.
// Exported since Billing Integration's webhook handlers (routes/webhooks.ts) reuse the same
// grace period when a recurring payment fails (spec's webhook contract table).
export const GRACE_PERIOD_DAYS = 14;

export interface PlanTransitionResult {
  movedToPastDue: number;
  movedToSuspended: number;
  cancelledMercadoPagoSubscriptions: number;
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
  //
  // NOT EXISTS guard added 2026-08-20 (Billing Integration, "genuinely free for 15 days"): a
  // tenant can now attach a real payment method (Paddle trial_period / Mercado Pago free_trial)
  // while still inside our own internal trialEndsAt window — that tenant's Subscription.provider
  // is already set, and the *provider* is what will transition them to active (or past_due, on a
  // failed first charge) via webhook. Without this guard, this cron would incorrectly bump them
  // to past_due on our own trialEndsAt clock even though Paddle/Mercado Pago haven't actually
  // failed to charge them yet — a false "your trial lapsed" banner for someone who already gave
  // us a card. A tenant that never attached a provider (still genuinely trialing with no card,
  // e.g. picked Free Trial) has no Subscription.provider set and is unaffected by this guard.
  const movedToPastDue = await prisma.$executeRaw`
    UPDATE "Tenant"
    SET status = 'past_due'::"TenantStatus", "gracePeriodEndsAt" = "trialEndsAt" + (INTERVAL '1 day' * ${GRACE_PERIOD_DAYS})
    WHERE status = 'trialing'::"TenantStatus" AND "trialEndsAt" <= ${now}
      AND NOT EXISTS (
        SELECT 1 FROM "Subscription" WHERE "Subscription"."tenantId" = "Tenant"."id" AND "Subscription"."provider" IS NOT NULL
      )
  `;

  const suspended = await prisma.tenant.updateMany({
    where: { status: 'past_due', gracePeriodEndsAt: { lte: now } },
    data: { status: 'suspended' },
  });

  // Billing Integration (task-breakdown Unidad 9) — Mercado Pago has no native "cancel at period
  // end" concept in its API (unlike Paddle's effective_from: next_billing_period), so the
  // self-serve cancel endpoint (Etapa D) only sets cancellationEffectiveAt locally; this is what
  // actually calls Mercado Pago once that date arrives. Paddle needs no equivalent step here —
  // its own cancel call already schedules the cancellation on Paddle's side.
  const dueMercadoPagoCancellations = await prisma.subscription.findMany({
    where: { provider: 'mercadopago', status: { not: 'cancelled' }, cancellationEffectiveAt: { lte: now } },
  });

  for (const subscription of dueMercadoPagoCancellations) {
    if (subscription.externalSubscriptionId) {
      await updatePreapproval(subscription.externalSubscriptionId, { status: 'cancelled' });
    }
    await syncSubscriptionAndTenant({ tenantId: subscription.tenantId, status: 'cancelled' });
  }

  return {
    movedToPastDue,
    movedToSuspended: suspended.count,
    cancelledMercadoPagoSubscriptions: dueMercadoPagoCancellations.length,
  };
}
