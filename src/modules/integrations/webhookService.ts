import { randomBytes } from 'node:crypto';
import prisma from '../../lib/prisma.js';
import { encryptWebhookSecret } from '../../lib/webhookEncryption.js';
import { WEBHOOK_EVENTS, deliverWebhookDelivery, type WebhookEvent } from './webhookDispatchService.js';
import type { Prisma } from '@prisma/client';

// Management CRUD for Settings → Integrations → API & Webhooks (spec §7.4, §8) — normal
// Session-authenticated SPA traffic, same as apiKeyService.ts (which this mirrors closely).

const WEBHOOK_SECRET_PREFIX = 'whsec_';

function generateWebhookSecret(): string {
  return `${WEBHOOK_SECRET_PREFIX}${randomBytes(32).toString('hex')}`;
}

export interface WebhookSubscriptionSummary {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  needsAttention: boolean;
  createdAt: Date;
}

export interface CreateWebhookSubscriptionResult extends WebhookSubscriptionSummary {
  secret: string;
}

interface WebhookSubscriptionRow {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  needsAttention: boolean;
  createdAt: Date;
}

function sanitize(sub: WebhookSubscriptionRow): WebhookSubscriptionSummary {
  // Never includes secretEncrypted — the secret is shown in full only at creation and on
  // regenerateSecret, exactly like ApiKey.fullKey.
  return { id: sub.id, url: sub.url, events: sub.events, isActive: sub.isActive, needsAttention: sub.needsAttention, createdAt: sub.createdAt };
}

function assertValidEvents(events: string[]): void {
  if (events.length === 0) {
    throw new Error('At least one event is required.');
  }
  const unknown = events.filter((event) => !WEBHOOK_EVENTS.includes(event as WebhookEvent));
  if (unknown.length > 0) {
    throw new Error(`Unknown event(s): ${unknown.join(', ')}`);
  }
}

function assertValidUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('url must be a valid URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('url must use https.');
  }
}

export interface CreateWebhookSubscriptionInput {
  url: string;
  events: string[];
}

export async function createSubscription(tenantId: string, userId: string, input: CreateWebhookSubscriptionInput): Promise<CreateWebhookSubscriptionResult> {
  const url = input.url.trim();
  assertValidUrl(url);
  const events = Array.from(new Set(input.events));
  assertValidEvents(events);

  const secret = generateWebhookSecret();
  const created = await prisma.webhookSubscription.create({
    data: { tenantId, url, secretEncrypted: encryptWebhookSecret(secret), events, createdByUserId: userId },
  });

  return { ...sanitize(created), secret };
}

export async function listSubscriptions(tenantId: string): Promise<WebhookSubscriptionSummary[]> {
  const subscriptions = await prisma.webhookSubscription.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  return subscriptions.map(sanitize);
}

export interface UpdateWebhookSubscriptionInput {
  url?: string;
  events?: string[];
  isActive?: boolean;
}

// Returns null when the subscription doesn't exist or belongs to a different tenant (the app-wide
// "unscoped global lookup, then verify tenantId" convention — lib/prisma.ts's header comment).
export async function updateSubscription(tenantId: string, id: string, input: UpdateWebhookSubscriptionInput): Promise<WebhookSubscriptionSummary | null> {
  const existing = await prisma.webhookSubscription.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) return null;

  const data: Prisma.WebhookSubscriptionUncheckedUpdateInput = {};
  if (input.url !== undefined) {
    const url = input.url.trim();
    assertValidUrl(url);
    data.url = url;
  }
  if (input.events !== undefined) {
    const events = Array.from(new Set(input.events));
    assertValidEvents(events);
    data.events = events;
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
    // Reactivating gives the subscription a fresh chance, same reasoning as a successful
    // delivery clearing needsAttention in webhookDispatchService.ts.
    if (input.isActive) data.needsAttention = false;
  }

  const updated = await prisma.webhookSubscription.update({ where: { id }, data });
  return sanitize(updated);
}

// Soft delete (isActive: false) — the spec's own schema has no separate deletedAt field, and
// deliveries need to stay attached/readable either way (same "never hard-delete" instinct as
// ApiKey.revokedAt). updateMany (not update) so deleting an already-deleted or nonexistent
// subscription is a silent no-op instead of a Prisma "record not found" throw.
export async function deleteSubscription(tenantId: string, id: string): Promise<void> {
  await prisma.webhookSubscription.updateMany({ where: { id, tenantId }, data: { isActive: false } });
}

export async function regenerateSecret(tenantId: string, id: string): Promise<{ secret: string } | null> {
  const existing = await prisma.webhookSubscription.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) return null;

  const secret = generateWebhookSecret();
  await prisma.webhookSubscription.update({ where: { id }, data: { secretEncrypted: encryptWebhookSecret(secret) } });
  return { secret };
}

export interface WebhookDeliverySummary {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  lastAttemptAt: Date | null;
  responseStatusCode: number | null;
  createdAt: Date;
}

// Returns null if the subscription doesn't exist or belongs to a different tenant — same
// ownership-check convention as the other functions here.
export async function listDeliveries(tenantId: string, subscriptionId: string, limit = 20): Promise<WebhookDeliverySummary[] | null> {
  const subscription = await prisma.webhookSubscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription || subscription.tenantId !== tenantId) return null;

  return prisma.webhookDelivery.findMany({
    where: { webhookSubscriptionId: subscriptionId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, eventType: true, status: true, attempts: true, lastAttemptAt: true, responseStatusCode: true, createdAt: true },
  });
}

// Manual retry from the UI's delivery log (spec §7.4) — deliberately NOT an endpoint a third
// party could call on their own (no equivalent under /api/external/v1/*): this is Session-gated,
// owner-only, one delivery at a time. Returns null if the delivery doesn't belong to a
// subscription owned by this tenant.
export async function retryDelivery(tenantId: string, deliveryId: string): Promise<{ success: true } | null> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhookSubscription: true },
  });
  if (!delivery || delivery.webhookSubscription.tenantId !== tenantId) return null;

  await deliverWebhookDelivery(delivery);
  return { success: true };
}
