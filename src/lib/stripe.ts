
// Payments v1 (spec-payments-v1.md) — hand-rolled wrapper (fetch + native crypto) instead of the
// official `stripe` SDK, matching this codebase's existing bias against a dependency for a small
// REST surface (see src/lib/mercadopago.ts — same reasoning, same category of integration: a
// payment provider's API). Unlike Mercado Pago, there is no single fixed
// API key for this file to read from an env var — each tenant supplies their OWN key (pasted by
// hand, see StripeConnection), so every function here takes the key as a parameter instead.
const STRIPE_API_BASE = 'https://api.stripe.com/v1';

export class StripeApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(`Stripe API error (${status}): ${message}`);
    this.status = status;
  }
}

// Stripe's REST API takes application/x-www-form-urlencoded bodies (and query strings for GET),
// never JSON — unlike Paddle/Mercado Pago above. Nested objects use PHP-style bracket notation
// (e.g. `metadata[foo]=bar`); none of the calls this file makes need array params, so that case
// isn't handled.
function toFormPairs(params: Record<string, unknown>, prefix = ''): string[] {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const paramKey = prefix ? `${prefix}[${key}]` : key;
    if (value !== null && typeof value === 'object') {
      pairs.push(...toFormPairs(value as Record<string, unknown>, paramKey));
    } else {
      pairs.push(`${encodeURIComponent(paramKey)}=${encodeURIComponent(String(value))}`);
    }
  }
  return pairs;
}

async function stripeRequest<T>(
  apiKey: string,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const pairs = params ? toFormPairs(params) : [];
  const query = method === 'GET' && pairs.length ? `?${pairs.join('&')}` : '';
  const body = method !== 'GET' && pairs.length ? pairs.join('&') : undefined;

  const response = await fetch(`${STRIPE_API_BASE}${path}${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body,
  });

  const json = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!response.ok) {
    throw new StripeApiError(response.status, json?.error?.message ?? JSON.stringify(json));
  }
  return json as T;
}

export interface StripeAccount {
  id: string;
  email?: string | null;
}

// Validation call for a freshly-pasted key (Unit 1) — most Restricted Keys won't have the
// "Account" read permission though, so connectStripe() falls back to listCustomers() below when
// this 401s/403s rather than treating that as proof the key is invalid.
export async function retrieveAccount(apiKey: string): Promise<StripeAccount> {
  return stripeRequest<StripeAccount>(apiKey, 'GET', '/account');
}

export interface StripeCustomer {
  id: string;
  email: string | null;
  name: string | null;
}

export interface StripeList<T> {
  data: T[];
  has_more: boolean;
}

export async function listCustomers(
  apiKey: string,
  params: { email?: string; limit?: number; starting_after?: string } = {},
): Promise<StripeList<StripeCustomer>> {
  return stripeRequest<StripeList<StripeCustomer>>(apiKey, 'GET', '/customers', params);
}

// Payments v1, Unit 3 — a Charge object already carries `refunded`/`amount_refunded`/`status`
// directly, which is what makes it the single source for both "refunds" and "failed payments" in
// getCompanyPaymentSummary/getCompanyPaymentEvents below, rather than a separate call per concern.
// Confirmed against Stripe's real API docs (2026-08-26, `docs.stripe.com/api/refunds/list`): the
// List Refunds endpoint does NOT accept a `customer` filter (only `charge`/`payment_intent`), so
// "list refunds for this customer" isn't actually a call Stripe's API supports directly — Charges
// (which DOES accept `customer`) is the correct source, not a spec oversight to work around later.
export interface StripeCharge {
  id: string;
  amount: number; // cents
  currency: string; // lowercase ISO-4217, e.g. "usd" — a Charge's own, not necessarily the tenant's
  status: 'succeeded' | 'pending' | 'failed';
  refunded: boolean;
  amount_refunded: number; // cents, partial or full
  created: number; // unix seconds
  // Stripe's own hosted, customer-facing receipt page — present on the Charge object by default,
  // no expand needed. null for a charge that hasn't succeeded (e.g. still failed/pending).
  receipt_url: string | null;
  // Whether this charge has an open or resolved dispute against it — present on the Charge object
  // by default, no separate /v1/disputes call needed for a company-level count/total.
  disputed: boolean;
}

// Stripe's `created[gte]`/`created[lte]` list filter, in unix seconds (toFormPairs nests it).
export interface StripeCreatedFilter {
  gte?: number;
  lte?: number;
}

export async function listCharges(
  apiKey: string,
  params: { customer: string; limit?: number; starting_after?: string; created?: StripeCreatedFilter },
): Promise<StripeList<StripeCharge>> {
  return stripeRequest<StripeList<StripeCharge>>(apiKey, 'GET', '/charges', params);
}

export interface StripeSubscription {
  id: string;
  status: string; // 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | ...
  customer: string;
  created: number;
}

// `status: 'all'` (confirmed against Stripe's docs) — the default (no status param) silently
// excludes canceled subscriptions, which would hide a churned customer's history entirely.
export async function listSubscriptions(
  apiKey: string,
  params: { customer: string; status?: string; limit?: number; starting_after?: string },
): Promise<StripeList<StripeSubscription>> {
  return stripeRequest<StripeList<StripeSubscription>>(apiKey, 'GET', '/subscriptions', params);
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: any; previous_attributes?: any };
}

// Powers the twice-daily notification poll (runStripeEventPolling, stripePaymentsService.ts) —
// replaced the per-tenant manual webhook entirely (backlog QA, 2026-08-28): Stripe's Events API
// returns the exact same Event objects a webhook would have delivered, so
// processStripeWebhookEvent can be reused unchanged regardless of push vs. pull. No `type` filter
// on the request — that function already discards anything it doesn't handle via its own
// `default:` case, so filtering here would just be a second place to keep the event list in sync.
export async function listEvents(
  apiKey: string,
  params: { createdGte: number; limit?: number; starting_after?: string },
): Promise<StripeList<StripeEvent>> {
  return stripeRequest<StripeList<StripeEvent>>(apiKey, 'GET', '/events', {
    created: { gte: params.createdGte },
    limit: params.limit,
    starting_after: params.starting_after,
  });
}

// ---------------------------------------------------------------------------
// Payments v1 Unidad 8 — sending Stripe-hosted invoices (the first write calls in this file).
// Needs the Restricted Key's "Invoices" resource set to Write; a read-only key gets a 403 here.
// ---------------------------------------------------------------------------

export interface StripeInvoice {
  id: string;
  number: string | null; // assigned by Stripe at finalization, null while draft
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  currency: string;
  amount_due: number; // smallest currency unit
  amount_remaining: number;
  created: number;
  due_date: number | null;
  hosted_invoice_url: string | null; // customer-facing payment page, set once finalized
  description: string | null;
  metadata: Record<string, string>;
}

// pending_invoice_items_behavior: 'exclude' (also Stripe's default, stated explicitly so it can't
// silently flip) keeps any unrelated pending invoice items already on this customer out of it —
// our own lines are attached by id in createInvoiceItem below.
export async function createInvoice(
  apiKey: string,
  params: {
    customer: string;
    currency: string;
    daysUntilDue: number;
    description?: string;
    metadata?: Record<string, string>;
  },
  idempotencyKey: string,
): Promise<StripeInvoice> {
  return stripeRequest<StripeInvoice>(
    apiKey,
    'POST',
    '/invoices',
    {
      customer: params.customer,
      currency: params.currency,
      collection_method: 'send_invoice',
      days_until_due: params.daysUntilDue,
      description: params.description,
      auto_advance: false,
      pending_invoice_items_behavior: 'exclude',
      metadata: params.metadata,
    },
    idempotencyKey,
  );
}

export async function createInvoiceItem(
  apiKey: string,
  params: { customer: string; invoice: string; amount: number; currency: string; description: string },
  idempotencyKey: string,
): Promise<{ id: string }> {
  return stripeRequest<{ id: string }>(apiKey, 'POST', '/invoiceitems', params, idempotencyKey);
}

export async function finalizeInvoice(apiKey: string, invoiceId: string, idempotencyKey: string): Promise<StripeInvoice> {
  return stripeRequest<StripeInvoice>(apiKey, 'POST', `/invoices/${invoiceId}/finalize`, { auto_advance: false }, idempotencyKey);
}

// Emails the finalized invoice (with its hosted payment link) to the customer's email on file.
export async function sendInvoice(apiKey: string, invoiceId: string, idempotencyKey: string): Promise<StripeInvoice> {
  return stripeRequest<StripeInvoice>(apiKey, 'POST', `/invoices/${invoiceId}/send`, undefined, idempotencyKey);
}

// Only drafts can be deleted — used to clean up a half-built invoice when a later step fails.
export async function deleteDraftInvoice(apiKey: string, invoiceId: string): Promise<void> {
  await stripeRequest<unknown>(apiKey, 'DELETE', `/invoices/${invoiceId}`);
}

export async function listInvoices(
  apiKey: string,
  params: { customer: string; status?: StripeInvoice['status']; limit?: number; starting_after?: string; created?: StripeCreatedFilter },
): Promise<StripeList<StripeInvoice>> {
  return stripeRequest<StripeList<StripeInvoice>>(apiKey, 'GET', '/invoices', params);
}

// Set on every invoice Northstack creates, so the event poll can tell "an invoice we sent was
// paid" apart from the tenant's own subscription/renewal invoices (which must not notify).
export const NORTHSTACK_SENT_METADATA_KEY = 'northstack_sent';
