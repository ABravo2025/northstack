import prisma from '../../lib/prisma.js';
import { getInvoicePdfUrl } from '../../lib/paddle.js';
import { CURRENT_PLAN_PRICES_CENTS } from './planService.js';
import { recordActivity } from '../activity/activityLogService.js';
import { subscriptionActivityFieldConfig } from '../activity/fieldConfigs/subscriptionFieldConfig.js';
import { bestEffort } from '../../lib/bestEffort.js';
import type { PaymentProvider, Prisma, Subscription, SubscriptionStatus, TenantStatus } from '@prisma/client';

// spec-billing-integration.md — Argentina is billed in ARS via Mercado Pago (its own,
// non-USD-indexed price); every other country, including tenants with no country on file yet
// (legacy signups predating spec-tenant-signup.md's required country field), defaults to Paddle.
export function resolveProvider(tenant: { country: string | null }): PaymentProvider {
  return tenant.country === 'Argentina' ? 'mercadopago' : 'paddle';
}

const BILLING_SUMMARY_SELECT = {
  plan: true,
  status: true,
  provider: true,
  currency: true,
  lockedPriceCents: true,
  trialEndsAt: true,
  gracePeriodEndsAt: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelledAt: true,
  cancellationEffectiveAt: true,
  paymentMethodBrand: true,
  paymentMethodLast4: true,
  invoices: {
    select: {
      id: true,
      provider: true,
      amountCents: true,
      currency: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      paidAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.SubscriptionSelect;

// Same value set on both enums by design (see schema.prisma) — kept as an explicit map rather
// than a cast, matching planService.ts's/scripts/backfill-billing-subscriptions.ts's own copies.
const TENANT_TO_SUBSCRIPTION_STATUS: Record<TenantStatus, SubscriptionStatus> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  suspended: 'suspended',
  cancelled: 'cancelled',
};

// Not in the original task-breakdown (units 1-15 are all writes) — added for Etapa E, since
// BillingPage.tsx has nothing to read from without this. Read-only, any authenticated tenant
// member (same bar as GET /api/tenants/current) — the mutating self-serve endpoints stay
// owner-only via canManageBilling, this just exposes plan/invoice state, no payment credentials
// (paymentMethodBrand/Last4 are already display-only, never sensitive).
export async function getBillingSummary(tenantId: string) {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId }, select: BILLING_SUMMARY_SELECT });
  if (subscription) {
    return subscription;
  }

  // Self-heal: a tenant created before Billing Integration shipped has no Subscription row
  // until scripts/backfill-billing-subscriptions.ts is run for its environment — without this,
  // the Billing page 404s forever for every pre-existing tenant. Mirrors that same script's
  // placeholder shape (same 'starter'/USD fallback registerTenantWithOwner now sets for brand
  // new signups) rather than depending on that manual step ever running.
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true, plan: true, trialEndsAt: true, gracePeriodEndsAt: true, lockedPriceCents: true },
  });
  if (!tenant) {
    return null;
  }

  const created = await prisma.subscription.upsert({
    where: { tenantId },
    update: {},
    create: {
      tenantId,
      plan: tenant.plan ?? 'starter',
      status: TENANT_TO_SUBSCRIPTION_STATUS[tenant.status],
      lockedPriceCents: tenant.lockedPriceCents ?? CURRENT_PLAN_PRICES_CENTS.starter,
      currency: 'USD',
      trialEndsAt: tenant.trialEndsAt,
      gracePeriodEndsAt: tenant.gracePeriodEndsAt,
    },
  });

  return { ...created, invoices: [] };
}

export interface GetInvoiceDocumentUrlResult {
  success: boolean;
  url?: string;
  error?: string;
}

// Real invoice PDF, per Alejandro's request (2026-08-19) — never trusts a client-supplied
// invoiceId blindly: only returns a URL for an Invoice that actually belongs to this tenant's
// Subscription. Paddle-only (see getInvoicePdfUrl's comment in paddle.ts); Mercado Pago invoices
// have no equivalent document yet.
export async function getInvoiceDocumentUrl(
  tenantId: string,
  invoiceId: string,
  disposition: 'inline' | 'attachment' = 'inline',
): Promise<GetInvoiceDocumentUrlResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { provider: true, externalInvoiceId: true, subscription: { select: { tenantId: true } } },
  });

  if (!invoice || invoice.subscription.tenantId !== tenantId) {
    return { success: false, error: 'Invoice not found' };
  }
  if (invoice.provider !== 'paddle' || !invoice.externalInvoiceId) {
    return { success: false, error: 'No document available for this invoice yet.' };
  }

  const url = await getInvoicePdfUrl(invoice.externalInvoiceId, disposition);
  return { success: true, url };
}

// Same value set on both enums by design (see schema.prisma) — kept as an explicit map rather
// than a cast so a future divergence between the two is a one-line change here, not a silent
// mismatch.
const SUBSCRIPTION_TO_TENANT_STATUS: Record<SubscriptionStatus, TenantStatus> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  suspended: 'suspended',
  cancelled: 'cancelled',
};

export interface SyncSubscriptionAndTenantInput {
  tenantId: string;
  status?: SubscriptionStatus;
  plan?: Prisma.SubscriptionUpdateInput['plan'];
  provider?: PaymentProvider | null;
  externalSubscriptionId?: string | null;
  lockedPriceCents?: number;
  currency?: string;
  trialEndsAt?: Date | null;
  gracePeriodEndsAt?: Date | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelledAt?: Date | null;
  cancellationEffectiveAt?: Date | null;
  cancellationReason?: string | null;
  paymentMethodBrand?: string | null;
  paymentMethodLast4?: string | null;
  // Present only for the 3 synchronous self-serve actions (changePlan/requestCancellation/
  // resumeSubscription), which have a real actor right there in the route handler. Every
  // webhook/cron call site omits this — see resolveRecentActorId below for how those instead
  // fall back to Subscription's own lastActionByUserId/lastActionAt pointer.
  changedByUserId?: string;
}

// How long a user's own action (startCheckout, or one of the 3 self-serve functions) stays
// "trusted" as the likely cause of a later webhook-confirmed change with no actor of its own.
// Paddle's overlay checkout confirms in seconds; Mercado Pago's hosted-redirect flow can take a
// user several minutes to complete. 60 min comfortably covers a real completion without
// misattributing an unrelated later event (renewals/retries land days-to-weeks later, per
// GRACE_PERIOD_DAYS/billing-cycle timing elsewhere in this module) — deliberately not cleared
// after use, since Paddle/Mercado Pago commonly fire several related webhook events in a row for
// one action and each should attribute to the same user.
const SUBSCRIPTION_ACTOR_TRUST_WINDOW_MS = 60 * 60 * 1000;

function resolveRecentActorId(before: { lastActionByUserId: string | null; lastActionAt: Date | null }): string | null {
  if (!before.lastActionByUserId || !before.lastActionAt) return null;
  if (Date.now() - before.lastActionAt.getTime() > SUBSCRIPTION_ACTOR_TRUST_WINDOW_MS) return null;
  return before.lastActionByUserId;
}

// Records that a user just initiated a checkout for this subscription, without touching any
// real billing state — startCheckout's own comment explains why it deliberately doesn't write
// Subscription fields on the "subscribe" path; this is the one narrow exception (tracking
// metadata for later webhook attribution, not billing state). Read back by
// syncSubscriptionAndTenant via resolveRecentActorId once the webhook confirms.
export async function recordSubscriptionActionAttempt(tenantId: string, userId: string): Promise<void> {
  await bestEffort(
    prisma.subscription.update({
      where: { tenantId },
      data: { lastActionByUserId: userId, lastActionAt: new Date() },
    }),
    `subscriptionService.recordSubscriptionActionAttempt(${tenantId})`,
  );
}

// The single writer of Subscription.status + its mirror on Tenant.status/plan/trialEndsAt/
// gracePeriodEndsAt/lockedPriceCents (spec-billing-integration.md) — only the daily cron
// (planTransitionService.ts, once it grows a Subscription-aware branch) and the two webhook
// handlers (paddle.ts/mercadopago.ts routes, not yet built) call this. No other code should
// write Tenant.status directly from here on; updateTenantPlan (planService.ts) is the one
// deliberate exception, since it's the pre-billing "which plan do you want" choice, not a status
// transition — it writes both rows itself, inline, for that one field.
//
// Only whitelisted `fields` are written to Subscription; only the subset that has a real Tenant
// mirror (status/plan/trialEndsAt/gracePeriodEndsAt/lockedPriceCents) is written to Tenant, and
// only when actually present in this call — a webhook that only touches
// paymentMethodBrand/Last4, for instance, never touches Tenant at all.
export async function syncSubscriptionAndTenant(input: SyncSubscriptionAndTenantInput): Promise<Subscription> {
  const { tenantId, changedByUserId, ...fields } = input;

  const { before, subscription } = await prisma.$transaction(async (tx) => {
    const before = await tx.subscription.findUniqueOrThrow({
      where: { tenantId },
      include: { tenant: { select: { name: true } } },
    });

    const subscription = await tx.subscription.update({
      where: { tenantId },
      data: {
        ...fields,
        ...(changedByUserId ? { lastActionByUserId: changedByUserId, lastActionAt: new Date() } : {}),
      },
    });

    const tenantMirror: Prisma.TenantUpdateInput = {};
    if (fields.status !== undefined) {
      tenantMirror.status = SUBSCRIPTION_TO_TENANT_STATUS[fields.status];
    }
    if (fields.plan !== undefined) {
      tenantMirror.plan = fields.plan;
    }
    if (fields.trialEndsAt !== undefined) {
      tenantMirror.trialEndsAt = fields.trialEndsAt;
    }
    if (fields.gracePeriodEndsAt !== undefined) {
      tenantMirror.gracePeriodEndsAt = fields.gracePeriodEndsAt;
    }
    if (fields.lockedPriceCents !== undefined) {
      tenantMirror.lockedPriceCents = fields.lockedPriceCents;
    }

    if (Object.keys(tenantMirror).length > 0) {
      await tx.tenant.update({ where: { id: tenantId }, data: tenantMirror });
    }

    return { before, subscription };
  });

  // changedByUserId (self-serve, synchronous) wins outright when present; otherwise this is a
  // webhook/cron call with no actor of its own, so fall back to the subscription's own rolling
  // "who touched this last" pointer, only if still fresh — see resolveRecentActorId's comment.
  const actorId = changedByUserId ?? resolveRecentActorId(before);
  if (actorId) {
    await recordActivity({
      tenantId,
      entityType: 'subscription',
      entityId: subscription.id,
      entityLabel: before.tenant.name,
      action: 'update',
      changedByUserId: actorId,
      before,
      after: subscription,
      fieldConfig: subscriptionActivityFieldConfig,
    });
  }

  return subscription;
}
