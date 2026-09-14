import DodoPayments from 'dodopayments';
import type { UnwrapWebhookEvent } from 'dodopayments/resources/webhooks/webhooks.js';

// Billing Integration (spec-billing-integration.md) — unlike paddle.ts/mercadopago.ts (hand-rolled
// fetch + native crypto, deliberately no SDK for a handful of REST calls), this uses the official
// `dodopayments` npm package. Reasoning (Alejandro's plan, 2026-09-13): every other wrapper in this
// file family got its request/response shapes "verified against a real sandbox" before being
// trusted — we don't have that yet for Dodo. Leaning on the officially maintained, typed SDK
// (confirmed 2026-09-13 against dodopayments@2.50.0's own .d.ts files, not just the docs site)
// reduces the risk of a subtly wrong request shape or a broken webhook signature check, in exactly
// the most sensitive code in the repo. `client.webhooks.unwrap()` internally uses the
// `standardwebhooks` package already bundled as a transitive dependency — no separate package
// needed for signature verification either.
function getClient(): DodoPayments {
  if (!process.env.DODO_PAYMENTS_API_KEY) {
    throw new Error('DODO_PAYMENTS_API_KEY is not configured');
  }
  // BILLING_ENV is shared across both providers (see checkoutService.ts) — there's never a
  // scenario with one provider live and the other sandboxed in practice.
  return new DodoPayments({
    environment: process.env.BILLING_ENV === 'production' ? 'live_mode' : 'test_mode',
  });
}

export interface CreateCheckoutSessionInput {
  subscriptionId: string; // -> metadata.subscriptionId, the join key back to our Subscription row on the webhook (same role as Paddle's custom_data/Mercado Pago's external_reference)
  email: string;
  productId: string; // PlanPrice.dodoProductId — Dodo requires a pre-created catalog Product, no inline non-catalog price like Paddle
  returnUrl: string;
  // Card collected now, first real charge delayed this many days — same semantics as
  // paddle.ts's createNonCatalogTransaction#trialDays. Omit (or 0) to charge immediately.
  trialDays?: number;
}

export interface CheckoutSession {
  checkoutUrl: string;
}

// product_cart quantity is always 1 — one plan per tenant, no per-seat billing (mirrors Paddle's
// quantity: { minimum: 1, maximum: 1 } guard against an editable quantity stepper at checkout).
export async function createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession> {
  const session = await getClient().checkoutSessions.create({
    product_cart: [{ product_id: input.productId, quantity: 1 }],
    customer: { email: input.email },
    return_url: input.returnUrl,
    metadata: { subscriptionId: input.subscriptionId },
    ...(input.trialDays ? { subscription_data: { trial_period_days: input.trialDays } } : {}),
  });

  if (!session.checkout_url) {
    throw new Error('Dodo Payments checkout session was created without a checkout_url');
  }
  return { checkoutUrl: session.checkout_url };
}

// Update payment method on an EXISTING subscription (never creates a second, competing
// subscription) — Dodo's mechanism for this is the Customer Portal, a hosted page where the
// customer can replace their card. `customerId` isn't stored locally (see schema.prisma's comment
// on Subscription.externalSubscriptionId) — read fresh off the subscription itself rather than
// adding a column just to cache it.
export async function getCustomerPortalUrl(externalSubscriptionId: string, returnUrl: string): Promise<string> {
  const client = getClient();
  const subscription = await client.subscriptions.retrieve(externalSubscriptionId);
  const session = await client.customers.customerPortal.create(subscription.customer.customer_id, { return_url: returnUrl });
  return session.link;
}

export interface ChangeSubscriptionPlanInput {
  productId: string; // PlanPrice.dodoProductId of the new plan
}

// Self-serve change-plan (Etapa D) — `proration_billing_mode: 'do_not_bill'` per the spec ("Sin
// prorrateo"): the new price only applies starting the next billing date, nothing charged now.
export async function changeSubscriptionPlan(externalSubscriptionId: string, input: ChangeSubscriptionPlanInput): Promise<void> {
  await getClient().subscriptions.changePlan(externalSubscriptionId, {
    product_id: input.productId,
    quantity: 1,
    proration_billing_mode: 'do_not_bill',
  });
}

// Self-serve cancel (Etapa D) — Dodo supports scheduled cancellation natively (takes effect at
// the subscription's own next_billing_date), unlike Mercado Pago which needs the cron
// (planTransitionService.ts) to make a separate call once cancellationEffectiveAt arrives.
export async function cancelSubscription(externalSubscriptionId: string): Promise<void> {
  await getClient().subscriptions.update(externalSubscriptionId, { cancel_at_next_billing_date: true });
}

// Self-serve resume (Etapa D) — undoes a scheduled cancellation. Mercado Pago genuinely never got
// a provider call at cancel time, nothing to undo there, but Dodo did (see cancelSubscription
// above), so resuming has to clear that flag too, or Dodo cancels the subscription on the
// scheduled date regardless of what our local DB says.
export async function removeScheduledCancellation(externalSubscriptionId: string): Promise<void> {
  await getClient().subscriptions.update(externalSubscriptionId, { cancel_at_next_billing_date: false });
}

// Precise current-period-end for a real (non-trial, non-$0) charge — used instead of a flat
// +30-days approximation (what paddle.ts's now-deleted equivalent did, for lack of a cheap way to
// get it) since the payment.succeeded webhook payload itself doesn't carry next_billing_date, only
// the Subscription resource does.
export async function getNextBillingDate(externalSubscriptionId: string): Promise<Date> {
  const subscription = await getClient().subscriptions.retrieve(externalSubscriptionId);
  return new Date(subscription.next_billing_date);
}

// Real invoice PDF, same "fetched fresh on each click, never cached" reasoning as
// getInvoicePdfUrl did for Paddle (paddle.ts's now-deleted equivalent) — unlike Paddle, Dodo
// returns this URL directly on the Payment resource, no separate signed-URL request needed.
export async function getInvoiceUrl(externalPaymentId: string): Promise<string | null> {
  const payment = await getClient().payments.retrieve(externalPaymentId);
  return payment.invoice_url ?? null;
}

export interface CreateRecurringProductInput {
  name: string;
  priceCents: number;
}

// Only used by scripts/setup-dodo-products.ts — Dodo requires a pre-created catalog Product for
// any recurring subscription (unlike Paddle's inline non-catalog price), so this provisions one
// Product per PlanPrice row rather than at checkout time. `payment_frequency_interval`/
// `subscription_period_interval` both 'Month'/1 — every plan today is a flat monthly charge, no
// annual tier yet.
export async function createRecurringProduct(input: CreateRecurringProductInput): Promise<string> {
  const product = await getClient().products.create({
    name: input.name,
    tax_category: 'saas',
    price: {
      type: 'recurring_price',
      currency: 'USD',
      price: input.priceCents,
      payment_frequency_interval: 'Month',
      payment_frequency_count: 1,
      subscription_period_interval: 'Month',
      subscription_period_count: 1,
      // Alejandro's call (2026-09-14): the tenant always pays exactly launchPriceCents, same
      // number the pricing table/UI already advertises — Northstack absorbs tax inside that
      // price rather than adding it on top (which would make the real charge vary by country).
      tax_inclusive: true,
    },
  });
  return product.product_id;
}

// spec's webhook contract: Dodo implements the "Standard Webhooks" spec (headers `webhook-id`/
// `webhook-signature`/`webhook-timestamp`) — client.webhooks.unwrap() verifies the signature
// against DODO_WEBHOOK_KEY and throws on a bad/missing signature; never trust the body without it.
// Express lowercases incoming header names already, and a header can arrive as string[] if the
// client sent it twice — normalized to a single string (first value) since Dodo only ever sends
// one of each.
export function unwrapDodoWebhookEvent(rawBody: string, headers: Record<string, string | string[] | undefined>): UnwrapWebhookEvent {
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      normalizedHeaders[key] = value;
    } else if (Array.isArray(value) && value.length > 0) {
      normalizedHeaders[key] = value[0];
    }
  }

  const key = process.env.DODO_WEBHOOK_KEY;
  if (!key) {
    throw new Error('DODO_WEBHOOK_KEY is not configured');
  }

  return getClient().webhooks.unwrap(rawBody, { headers: normalizedHeaders, key });
}
