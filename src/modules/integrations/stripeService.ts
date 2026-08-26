import prisma from '../../lib/prisma.js';
import { listCustomers, retrieveAccount, StripeApiError } from '../../lib/stripe.js';
import { decryptStripeSecret, encryptStripeSecret } from '../../lib/stripeEncryption.js';

// Payments v1, Unit 1 (spec-payments-v1.md) — connect/disconnect a tenant's own Stripe account.
// Lookup/matching (Unit 2) and live payment summaries (Unit 3) build on getApiKeyForTenant below;
// they live in their own functions added when those units are built, not here.

const API_KEY_PATTERN = /^(sk|rk)_(test|live)_/;

export function detectApiKeyMode(apiKey: string): 'test' | 'live' {
  const match = apiKey.match(API_KEY_PATTERN);
  if (!match) {
    throw new Error(
      "That doesn't look like a Stripe secret or restricted key — it should start with sk_ or rk_."
    );
  }
  return match[2] as 'test' | 'live';
}

export interface StripeConnectionStatus {
  connected: boolean;
  apiKeyMode: 'test' | 'live' | null;
  connectedAt: string | null;
  needsAttention: boolean;
  hasWebhookSecret: boolean;
}

const DISCONNECTED_STATUS: StripeConnectionStatus = {
  connected: false,
  apiKeyMode: null,
  connectedAt: null,
  needsAttention: false,
  hasWebhookSecret: false,
};

export async function getStripeConnectionStatus(tenantId: string): Promise<StripeConnectionStatus> {
  const connection = await prisma.stripeConnection.findUnique({ where: { tenantId } });
  if (!connection || connection.disconnectedAt) {
    return DISCONNECTED_STATUS;
  }
  return {
    connected: true,
    apiKeyMode: connection.apiKeyMode as 'test' | 'live',
    connectedAt: connection.connectedAt.toISOString(),
    needsAttention: connection.needsAttention,
    hasWebhookSecret: !!connection.webhookSigningSecretEncrypted,
  };
}

export interface ConnectStripeInput {
  tenantId: string;
  userId: string;
  apiKey: string;
}

// Validates the pasted key against Stripe itself before storing anything. retrieveAccount()
// (GET /account) is the natural validation call, but a Restricted Key scoped without the
// "Account" read permission 401s/403s on it even when the key is otherwise perfectly valid — the
// fallback to listCustomers() (a call any read-only key should be able to make) avoids rejecting
// those keys outright, per the spec's own Unit 1 task list.
export async function connectStripe({ tenantId, userId, apiKey }: ConnectStripeInput): Promise<StripeConnectionStatus> {
  const trimmedKey = apiKey.trim();
  const apiKeyMode = detectApiKeyMode(trimmedKey);

  let stripeAccountId: string | undefined;
  try {
    const account = await retrieveAccount(trimmedKey);
    stripeAccountId = account.id;
  } catch (error) {
    if (error instanceof StripeApiError && (error.status === 401 || error.status === 403)) {
      try {
        await listCustomers(trimmedKey, { limit: 1 });
      } catch {
        throw new Error('Stripe rejected this key. Double-check it was copied in full and has not been revoked.');
      }
    } else {
      throw error;
    }
  }

  await prisma.stripeConnection.upsert({
    where: { tenantId },
    create: {
      tenantId,
      apiKeyEncrypted: encryptStripeSecret(trimmedKey),
      apiKeyMode,
      stripeAccountId,
      connectedByUserId: userId,
    },
    update: {
      apiKeyEncrypted: encryptStripeSecret(trimmedKey),
      apiKeyMode,
      stripeAccountId,
      connectedByUserId: userId,
      connectedAt: new Date(),
      disconnectedAt: null,
      needsAttention: false,
    },
  });

  return getStripeConnectionStatus(tenantId);
}

export async function saveStripeWebhookSecret(tenantId: string, secret: string): Promise<StripeConnectionStatus> {
  const connection = await prisma.stripeConnection.findUnique({ where: { tenantId } });
  if (!connection || connection.disconnectedAt) {
    throw new Error('Connect Stripe first before saving a webhook signing secret.');
  }

  await prisma.stripeConnection.update({
    where: { tenantId },
    data: { webhookSigningSecretEncrypted: encryptStripeSecret(secret.trim()) },
  });
  return getStripeConnectionStatus(tenantId);
}

// Soft — same reasoning as Contact/Opportunity's isActive (docs/tareas/specredisenosalesv2.md
// §2.2): keeps the row (and its audit trail: who connected it, when) instead of losing it, and
// lets a future reconnect go through the same upsert() path as a first-time connect. Idempotent —
// disconnecting a tenant with no connection (or one already disconnected) is a no-op, not a
// Prisma "record to update not found" crash; the route doesn't gate this on current status.
export async function disconnectStripe(tenantId: string): Promise<void> {
  await prisma.stripeConnection.updateMany({
    where: { tenantId, disconnectedAt: null },
    data: { disconnectedAt: new Date() },
  });
}

// Units 2-4 build on this — resolves the tenant's own Stripe key (+ mode, needed to build correct
// dashboard.stripe.com links — test-mode objects live under a /test/ prefix, live-mode don't).
// Callers should route Stripe 401/403s here into markNeedsAttention rather than letting the
// connection look silently healthy forever.
export async function getActiveConnectionForTenant(
  tenantId: string
): Promise<{ apiKey: string; apiKeyMode: 'test' | 'live' }> {
  const connection = await prisma.stripeConnection.findUnique({ where: { tenantId } });
  if (!connection || connection.disconnectedAt) {
    throw new Error('This tenant has no active Stripe connection.');
  }
  return {
    apiKey: decryptStripeSecret(connection.apiKeyEncrypted),
    apiKeyMode: connection.apiKeyMode as 'test' | 'live',
  };
}

export async function getApiKeyForTenant(tenantId: string): Promise<string> {
  return (await getActiveConnectionForTenant(tenantId)).apiKey;
}

export async function markNeedsAttention(tenantId: string): Promise<void> {
  await prisma.stripeConnection.updateMany({
    where: { tenantId, disconnectedAt: null },
    data: { needsAttention: true },
  });
}
