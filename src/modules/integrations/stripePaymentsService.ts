import prisma from '../../lib/prisma.js';
import {
  listCharges,
  listCustomers,
  listSubscriptions,
  StripeApiError,
  type StripeCharge,
} from '../../lib/stripe.js';
import { getActiveConnectionForTenant, markNeedsAttention } from './stripeService.js';
import { createNotification } from '../notifications/notificationService.js';
import type { NotificationType } from '@prisma/client';

// Payments v1, Units 2-4 (spec-payments-v1.md). Company ownership (tenantId match, 404 if not)
// is checked by the route before calling any of these — every function here takes an
// already-validated Company row, it doesn't re-fetch/re-check on its own.

// Routes Stripe 401/403s into markNeedsAttention (see stripeService.ts) instead of letting a
// revoked/edited key look silently healthy — every real network call in this file goes through
// this wrapper, not just the connection-setup ones in Unit 1.
async function withNeedsAttentionTracking<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof StripeApiError && (error.status === 401 || error.status === 403)) {
      await markNeedsAttention(tenantId);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Unit 2 — lookup / matching Company <-> Stripe Customer
// ---------------------------------------------------------------------------

export interface StripeCustomerMatch {
  id: string;
  email: string | null;
  name: string | null;
  matchedViaEmail: string;
}

// Iterates this Company's active Contacts' emails against Stripe (never by domain — see spec
// decision #3), consolidating duplicate customer.id matches from different Contacts into one
// entry (keeping whichever Contact email was tried first).
export async function searchStripeCustomersForCompany(
  tenantId: string,
  companyId: string
): Promise<StripeCustomerMatch[]> {
  const { apiKey } = await getActiveConnectionForTenant(tenantId);
  const contacts = await prisma.contact.findMany({
    where: { tenantId, companyId, isActive: true },
  });

  const matches = new Map<string, StripeCustomerMatch>();
  for (const contact of contacts) {
    const result = await withNeedsAttentionTracking(tenantId, () =>
      listCustomers(apiKey, { email: contact.email, limit: 3 })
    );
    for (const customer of result.data) {
      if (!matches.has(customer.id)) {
        matches.set(customer.id, {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          matchedViaEmail: contact.email,
        });
      }
    }
  }
  return Array.from(matches.values());
}

export interface LinkCompanyToStripeInput {
  companyId: string;
  stripeCustomerId: string;
  matchedViaEmail: string;
}

// The "already linked to a different customer, need confirmation" check lives in the route
// (routes/payments.ts) — it already has the Company row loaded for the ownership check, so
// re-fetching it here would just be a second round-trip for the same data.
export async function linkCompanyToStripeCustomer(input: LinkCompanyToStripeInput) {
  return prisma.company.update({
    where: { id: input.companyId },
    data: { stripeCustomerId: input.stripeCustomerId, stripeCustomerMatchedVia: input.matchedViaEmail },
  });
}

// ---------------------------------------------------------------------------
// Unit 3 — live payment visibility (no local store — Stripe is the source of truth)
// ---------------------------------------------------------------------------

export interface StripePaymentSummary {
  linked: boolean;
  refundsCount: number;
  refundsAmountCents: number;
  // The Charge currency `refundsAmountCents` is denominated in — a Charge's own, not necessarily
  // the tenant's default (Tenant.currency). Null when there are no charges to derive it from.
  // Known simplification: if this customer has charges in more than one currency, the total is a
  // sum across currencies labeled with just one of them — not expected in practice for a single
  // customer, not worth the complexity of a multi-currency breakdown for v1.
  currency: string | null;
  failedCount: number;
  subscriptionStatus: string | null;
}

const UNLINKED_SUMMARY: StripePaymentSummary = {
  linked: false,
  refundsCount: 0,
  refundsAmountCents: 0,
  currency: null,
  failedCount: 0,
  subscriptionStatus: null,
};

function summarizeCharges(charges: StripeCharge[]): Omit<StripePaymentSummary, 'linked' | 'subscriptionStatus'> {
  let refundsCount = 0;
  let refundsAmountCents = 0;
  let failedCount = 0;
  for (const charge of charges) {
    if (charge.amount_refunded > 0) {
      refundsCount += 1;
      refundsAmountCents += charge.amount_refunded;
    }
    if (charge.status === 'failed') {
      failedCount += 1;
    }
  }
  return { refundsCount, refundsAmountCents, failedCount, currency: charges[0]?.currency ?? null };
}

// `limit: 100` (Stripe's max) for the summary — good enough for counts/totals at this stage; a
// customer with more than 100 charges would undercount, acceptable for v1 (no store, no
// pagination-through-everything just to add up a badge). getCompanyPaymentEvents below paginates
// properly for anyone who needs to see the full history, not just the summary.
export async function getCompanyPaymentSummary(
  tenantId: string,
  company: { stripeCustomerId: string | null }
): Promise<StripePaymentSummary> {
  if (!company.stripeCustomerId) {
    return UNLINKED_SUMMARY;
  }

  const { apiKey } = await getActiveConnectionForTenant(tenantId);
  const [chargesResult, subscriptionsResult] = await withNeedsAttentionTracking(tenantId, () =>
    Promise.all([
      listCharges(apiKey, { customer: company.stripeCustomerId!, limit: 100 }),
      listSubscriptions(apiKey, { customer: company.stripeCustomerId!, status: 'all', limit: 10 }),
    ])
  );

  // Prefer a subscription that's actually meaningful to a merchant glancing at this Company
  // (currently billing or at risk) over whatever Stripe happens to return first — falls back to
  // the most recent subscription of any status (e.g. canceled) so a churned customer still shows
  // something instead of a blank dash.
  const relevant = subscriptionsResult.data.find((s) => ['active', 'trialing', 'past_due'].includes(s.status));
  const subscriptionStatus = relevant?.status ?? subscriptionsResult.data[0]?.status ?? null;

  return { linked: true, subscriptionStatus, ...summarizeCharges(chargesResult.data) };
}

export interface StripePaymentEvent {
  id: string;
  type: 'charge_failed' | 'charge_refunded' | 'charge_succeeded';
  amountCents: number;
  currency: string;
  createdAt: string;
  dashboardUrl: string;
}

export interface StripePaymentEventsPage {
  events: StripePaymentEvent[];
  nextCursor: string | null;
}

function chargeToEvent(charge: StripeCharge, apiKeyMode: 'test' | 'live'): StripePaymentEvent {
  const type: StripePaymentEvent['type'] =
    charge.status === 'failed' ? 'charge_failed' : charge.amount_refunded > 0 ? 'charge_refunded' : 'charge_succeeded';
  return {
    id: charge.id,
    type,
    amountCents: type === 'charge_refunded' ? charge.amount_refunded : charge.amount,
    currency: charge.currency,
    createdAt: new Date(charge.created * 1000).toISOString(),
    dashboardUrl: `https://dashboard.stripe.com/${apiKeyMode === 'test' ? 'test/' : ''}payments/${charge.id}`,
  };
}

// Charges (not a separate Refunds/Payment Intents call) is the event feed — see the comment on
// listCharges (src/lib/stripe.ts) for why: Stripe's List Refunds endpoint has no `customer`
// filter, and a Charge already carries everything needed to classify it as failed/refunded/plain.
export async function getCompanyPaymentEvents(
  tenantId: string,
  company: { stripeCustomerId: string | null },
  cursor?: string
): Promise<StripePaymentEventsPage> {
  if (!company.stripeCustomerId) {
    return { events: [], nextCursor: null };
  }

  const { apiKey, apiKeyMode } = await getActiveConnectionForTenant(tenantId);
  const result = await withNeedsAttentionTracking(tenantId, () =>
    listCharges(apiKey, { customer: company.stripeCustomerId!, limit: 20, starting_after: cursor })
  );

  const events = result.data.map((charge) => chargeToEvent(charge, apiKeyMode));
  return { events, nextCursor: result.has_more ? (events[events.length - 1]?.id ?? null) : null };
}

// Small hand-rolled concurrency limiter — no new dependency (e.g. p-limit) for something this
// short, same bias against adding a package for a few lines of logic already applied throughout
// this spec (no `stripe` SDK either, see stripe.ts).
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await fn(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export interface PaymentsOverviewRow {
  companyId: string;
  companyName: string;
  summary: StripePaymentSummary;
}

export interface PaymentsOverviewTotals {
  refundsCount: number;
  refundsAmountCents: number;
  // Same simplification as StripePaymentSummary.currency, one level up: the currency of the
  // first Company with a charge to report, not a true multi-currency breakdown across the tenant.
  currency: string | null;
  failedCount: number;
  activeSubscriptions: number;
}

export interface PaymentsOverview {
  connected: boolean;
  totals: PaymentsOverviewTotals;
  companies: PaymentsOverviewRow[];
}

const EMPTY_OVERVIEW: PaymentsOverview = {
  connected: false,
  totals: { refundsCount: 0, refundsAmountCents: 0, currency: null, failedCount: 0, activeSubscriptions: 0 },
  companies: [],
};

// Checks the connection once upfront rather than letting every Company in the fan-out below fail
// independently — a tenant that disconnected Stripe after linking some Companies would otherwise
// see N identical "no active connection" failures instead of one clear state.
export async function getPaymentsOverview(tenantId: string): Promise<PaymentsOverview> {
  try {
    await getActiveConnectionForTenant(tenantId);
  } catch {
    return EMPTY_OVERVIEW;
  }

  const companies = await prisma.company.findMany({
    where: { tenantId, stripeCustomerId: { not: null } },
    select: { id: true, name: true, stripeCustomerId: true },
  });

  const rows = await mapWithConcurrency(companies, 10, async (company) => ({
    companyId: company.id,
    companyName: company.name,
    summary: await getCompanyPaymentSummary(tenantId, company),
  }));

  const totals = rows.reduce<PaymentsOverviewTotals>(
    (acc, row) => ({
      refundsCount: acc.refundsCount + row.summary.refundsCount,
      refundsAmountCents: acc.refundsAmountCents + row.summary.refundsAmountCents,
      currency: acc.currency ?? row.summary.currency,
      failedCount: acc.failedCount + row.summary.failedCount,
      activeSubscriptions: acc.activeSubscriptions + (row.summary.subscriptionStatus === 'active' ? 1 : 0),
    }),
    { refundsCount: 0, refundsAmountCents: 0, currency: null, failedCount: 0, activeSubscriptions: 0 }
  );

  return { connected: true, totals, companies: rows };
}

// ---------------------------------------------------------------------------
// Unit 4 — webhook-driven proactive notifications
// ---------------------------------------------------------------------------

// Recipient: the Company's Account Owner if set, otherwise the tenant's owner — never an admin,
// even though a tenant could have one. Payments visibility is owner-only (canManagePayments), so
// notifying an admin who couldn't even open the page to act on it would be pointless. Skips
// silently (no Notification at all) in the rare case neither exists — same "unowned, skip"
// degradation already used by the stalled-Opportunity cron, not a new pattern for this file.
export async function notifyCompanyStripeEvent(
  tenantId: string,
  company: { id: string; accountOwnerId: string | null },
  type: NotificationType,
  message: string
): Promise<void> {
  let recipientId = company.accountOwnerId;
  if (!recipientId) {
    const owner = await prisma.user.findFirst({ where: { tenantId, role: 'owner', status: 'active' } });
    recipientId = owner?.id ?? null;
  }
  if (!recipientId) {
    return;
  }

  await createNotification({
    tenantId,
    userId: recipientId,
    type,
    entityType: 'company',
    entityId: company.id,
    message,
  });
}

// Takes the already-verified, parsed Stripe event (signature check + rawBody parsing stay in
// routes/webhooks.ts, alongside Paddle/Mercado Pago's own signature checks) and resolves it to
// zero or one Notification. Returns a short status string for the route's response body — mirrors
// what the Paddle/Mercado Pago handlers already return, useful for eyeballing deliveries in
// Stripe's own dashboard log without needing server logs.
export async function processStripeWebhookEvent(tenantId: string, event: any): Promise<string> {
  const eventType = String(event?.type ?? '');
  const dataObject = event?.data?.object ?? {};
  const customerId = typeof dataObject.customer === 'string' ? dataObject.customer : null;

  if (!customerId) {
    return 'no customer on event';
  }

  // No match (Company never linked, or linked to a different customer) -> discard without saving
  // anything, per the spec's own "sin reprocesamiento de eventos sin match".
  const company = await prisma.company.findFirst({ where: { tenantId, stripeCustomerId: customerId } });
  if (!company) {
    return 'no matching Company';
  }

  const amountCents = typeof dataObject.amount === 'number' ? dataObject.amount : null;
  const amountRefundedCents = typeof dataObject.amount_refunded === 'number' ? dataObject.amount_refunded : null;
  const currency = typeof dataObject.currency === 'string' ? dataObject.currency.toUpperCase() : '';
  const formatAmount = (cents: number) => ` (${(cents / 100).toFixed(2)} ${currency})`;

  switch (eventType) {
    case 'charge.refunded':
      await notifyCompanyStripeEvent(
        tenantId,
        company,
        'stripe_charge_refunded',
        `A payment was refunded for ${company.name}${amountRefundedCents !== null ? formatAmount(amountRefundedCents) : ''}`
      );
      return 'notified';
    case 'charge.failed':
      await notifyCompanyStripeEvent(
        tenantId,
        company,
        'stripe_charge_failed',
        `A payment failed for ${company.name}${amountCents !== null ? formatAmount(amountCents) : ''}`
      );
      return 'notified';
    case 'payment_intent.payment_failed':
      await notifyCompanyStripeEvent(tenantId, company, 'stripe_payment_failed', `A payment attempt failed for ${company.name}`);
      return 'notified';
    case 'customer.subscription.updated': {
      // previous_attributes only lists what actually changed on an *.updated event (confirmed
      // against Stripe's docs) — without this check, every unrelated update to a subscription
      // that's already past_due (e.g. a quantity change) would re-fire the same notification.
      const previousStatus = event?.data?.previous_attributes?.status;
      if (dataObject.status === 'past_due' && previousStatus !== undefined && previousStatus !== 'past_due') {
        await notifyCompanyStripeEvent(tenantId, company, 'stripe_subscription_past_due', `${company.name}'s subscription is past due`);
        return 'notified';
      }
      return 'no relevant status transition';
    }
    case 'customer.subscription.deleted':
      await notifyCompanyStripeEvent(tenantId, company, 'stripe_subscription_canceled', `${company.name}'s subscription was canceled`);
      return 'notified';
    default:
      return 'unhandled event type';
  }
}
