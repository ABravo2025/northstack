import { createHmac, randomUUID } from 'node:crypto';
import prisma from '../../lib/prisma.js';
import { decryptWebhookSecret } from '../../lib/webhookEncryption.js';
import type { WebhookDelivery } from '@prisma/client';

// Private API + Webhooks Unit 4 (spec §7) — outbound webhooks. Northstack signs and pushes a POST
// to every WebhookSubscription.url subscribed to an event, instead of the tenant having to poll
// /api/external/v1/*.

// Event catalog (spec §7.1) — a plain string, not a Prisma enum (unlike NotificationType), so a
// new event can be added without a schema migration. This is the allowlist
// webhookService.ts's createSubscription/updateSubscription validate a requested `events` list
// against.
export const WEBHOOK_EVENTS = [
  'employee.created', 'employee.updated', 'employee.terminated',
  'timeoff.requested', 'timeoff.approved', 'timeoff.rejected',
  'opportunity.created', 'opportunity.stage_changed', 'opportunity.won', 'opportunity.lost',
  'company.created', 'contact.created',
  'task.created', 'task.completed',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

// 1 immediate attempt + 3 retries (spec §7.3: "inmediato → +1 min → +5 min → +30 min").
const BACKOFF_SCHEDULE_MS = [60_000, 5 * 60_000, 30 * 60_000];
const MAX_ATTEMPTS = BACKOFF_SCHEDULE_MS.length + 1;
const DELIVERY_TIMEOUT_MS = 10_000;
// needsAttention flips after this many CONSECUTIVE fully-failed deliveries for the same
// subscription (spec §7.3) — not consecutive failed HTTP attempts within one delivery.
const CONSECUTIVE_FAILURES_FOR_ATTENTION = 5;

export interface EmitWebhookEventInput {
  tenantId: string;
  type: WebhookEvent;
  entity: { type: string; id: string };
  data: unknown;
}

// Called from each producer *Service.ts via `bestEffort()` (never a bare `.catch()` — see
// bestEffort.ts on why an un-awaited promise can be silently killed by Vercel before it runs).
// This function's own job stops at creating `pending` WebhookDelivery rows — that write is the
// part that must survive, and bestEffort's await guarantees it completes before the producer's
// HTTP response is sent. Delivering isn't awaited by the caller (see the loop at the bottom):
// blocking the user's own request on N outbound HTTP calls (up to a 10s timeout each) would be a
// real regression for something the user didn't ask to wait for. If Vercel kills the process
// before that fires, nothing is actually lost — the row is already `pending` with
// `nextAttemptAt: now`, so the retry cron (routes/internal.ts) picks it up on its next pass
// exactly like any other retry.
export async function emitWebhookEvent(input: EmitWebhookEventInput): Promise<void> {
  const subscriptions = await prisma.webhookSubscription.findMany({
    where: { tenantId: input.tenantId, isActive: true, events: { has: input.type } },
  });
  if (subscriptions.length === 0) return;

  const payload = {
    id: `evt_${randomUUID()}`,
    type: input.type,
    tenantId: input.tenantId,
    entity: input.entity,
    data: input.data,
    createdAt: new Date().toISOString(),
  };

  const now = new Date();
  const deliveries = await prisma.$transaction(
    subscriptions.map((subscription) =>
      prisma.webhookDelivery.create({
        data: {
          webhookSubscriptionId: subscription.id,
          eventType: input.type,
          payload,
          status: 'pending',
          nextAttemptAt: now,
        },
      }),
    ),
  );

  for (const delivery of deliveries) {
    void deliverWebhookDelivery(delivery).catch((err) => console.error(`Webhook delivery ${delivery.id} failed:`, err));
  }
}

// Signs and POSTs one delivery, then updates its own row (attempts/lastAttemptAt/
// responseStatusCode/status/nextAttemptAt) based on the outcome. Called both for the immediate
// first attempt (emitWebhookEvent above) and for each retry (the cron in routes/internal.ts) — the
// function itself doesn't know or care which caller invoked it.
export async function deliverWebhookDelivery(delivery: WebhookDelivery): Promise<void> {
  const subscription = await prisma.webhookSubscription.findUnique({ where: { id: delivery.webhookSubscriptionId } });
  if (!subscription || !subscription.isActive) {
    // The subscription was deleted/paused between this delivery being queued and picked up —
    // nothing to send to anymore, and nothing to retry.
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: 'failed', attempts: delivery.attempts + 1, lastAttemptAt: new Date(), nextAttemptAt: null },
    });
    return;
  }

  const rawBody = JSON.stringify(delivery.payload);
  const timestamp = Date.now();
  // Same algorithm Northstack already verifies in the other direction against Stripe/Paddle/
  // Mercado Pago (lib/stripe.ts et al.), now applied as the signer instead of the verifier.
  // Anti-replay: the timestamp is part of the signed string (spec §7.3), same pattern Stripe uses
  // for its own webhooks — Northstack doesn't impose its own tolerance window, that's on the
  // receiver.
  const secret = decryptWebhookSecret(subscription.secretEncrypted);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');

  let responseStatusCode: number | null = null;
  let success = false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      const response = await fetch(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Northstack-Signature': `sha256=${signature}`,
          'X-Northstack-Timestamp': String(timestamp),
        },
        body: rawBody,
        signal: controller.signal,
      });
      responseStatusCode = response.status;
      success = response.ok;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error(`Webhook delivery ${delivery.id} request to ${subscription.url} failed:`, err);
  }

  const attempts = delivery.attempts + 1;
  const now = new Date();

  if (success) {
    await prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: 'success', attempts, lastAttemptAt: now, responseStatusCode, nextAttemptAt: null },
    });
    // A successful delivery clears needsAttention — same "give it a fresh chance" reasoning as
    // reconnecting a StripeConnection after it was flagged.
    if (subscription.needsAttention) {
      await prisma.webhookSubscription.update({ where: { id: subscription.id }, data: { needsAttention: false } });
    }
    return;
  }

  const isFinalAttempt = attempts >= MAX_ATTEMPTS;
  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: isFinalAttempt ? 'failed' : 'pending',
      attempts,
      lastAttemptAt: now,
      responseStatusCode,
      nextAttemptAt: isFinalAttempt ? null : new Date(now.getTime() + BACKOFF_SCHEDULE_MS[attempts - 1]),
    },
  });

  if (isFinalAttempt) {
    await maybeFlagSubscriptionNeedsAttention(subscription.id);
  }
}

async function maybeFlagSubscriptionNeedsAttention(subscriptionId: string): Promise<void> {
  const recentDeliveries = await prisma.webhookDelivery.findMany({
    where: { webhookSubscriptionId: subscriptionId },
    orderBy: { createdAt: 'desc' },
    take: CONSECUTIVE_FAILURES_FOR_ATTENTION,
    select: { status: true },
  });
  const allFailed =
    recentDeliveries.length === CONSECUTIVE_FAILURES_FOR_ATTENTION && recentDeliveries.every((d) => d.status === 'failed');
  if (allFailed) {
    await prisma.webhookSubscription.update({ where: { id: subscriptionId }, data: { needsAttention: true } });
  }
}

// Retry cron (routes/internal.ts) — every WebhookDelivery whose backoff window has elapsed,
// across every tenant. Delivered sequentially, not in parallel: this runs on a schedule, not in
// front of a user, so there's no latency to optimize for, and sequential keeps it simple to reason
// about (no risk of overwhelming a single flaky endpoint with concurrent retries).
export async function runWebhookDeliveryRetries(): Promise<{ processed: number }> {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
  });
  for (const delivery of due) {
    await deliverWebhookDelivery(delivery);
  }
  return { processed: due.length };
}
