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
  // Starting "extra seat" addon quantity (seatService.ts) — a tenant that already has more active
  // users than the plan includes by the time they actually add a card starts correctly billed
  // from the first invoice, instead of relying on the next syncSeatBilling call to catch up.
  extraSeats?: number;
  // -> metadata.plan (2026-09-15, QA-88) — the plan this checkout is FOR, read back by the
  // webhook's payment.succeeded handler to set Tenant.plan only once payment actually confirms,
  // instead of checkoutService.ts writing it upfront. Omit only for the "update payment method"
  // case, which never calls this (see checkoutService.ts's own comment).
  plan?: string;
}

export interface CheckoutSession {
  checkoutUrl: string;
}

// product_cart quantity is always 1 — one plan per tenant, no per-seat billing on the base
// product itself (mirrors Paddle's quantity: { minimum: 1, maximum: 1 } guard against an editable
// quantity stepper at checkout). Extra seats ride along as an addon with its own quantity instead
// (seatService.ts).
export async function createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession> {
  const session = await getClient().checkoutSessions.create({
    product_cart: [
      {
        product_id: input.productId,
        quantity: 1,
        ...(input.extraSeats
          ? { addons: [{ addon_id: requireExtraSeatAddonId(), quantity: input.extraSeats }] }
          : {}),
      },
    ],
    customer: { email: input.email },
    return_url: input.returnUrl,
    metadata: { subscriptionId: input.subscriptionId, ...(input.plan ? { plan: input.plan } : {}) },
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
//
// Re-sends the subscription's CURRENT addons (seatService.ts's "extra seat" addon) rather than
// omitting the field — changePlan's request body is a full replace of the cart, and the SDK's own
// doc on `addons` says "leaving this empty would remove any existing addons". Without this, a
// Starter<->Growth tier change would silently wipe whatever extra-seat quantity was billed,
// undercharging the tenant from that point on.
export async function changeSubscriptionPlan(externalSubscriptionId: string, input: ChangeSubscriptionPlanInput): Promise<void> {
  const client = getClient();
  const current = await client.subscriptions.retrieve(externalSubscriptionId);
  await client.subscriptions.changePlan(externalSubscriptionId, {
    product_id: input.productId,
    quantity: 1,
    proration_billing_mode: 'do_not_bill',
    addons: current.addons.map((a) => ({ addon_id: a.addon_id, quantity: a.quantity })),
  });
}

export interface UpdateSubscriptionSeatsInput {
  productId: string; // PlanPrice.dodoProductId of the subscription's CURRENT plan (required by changePlan even when only addons change)
  extraSeats: number; // 0 clears the addon entirely (passing an empty addons array removes it)
}

// Real-time seat billing (2026-09-14, Alejandro's call) — "extra seat" is a Dodo Addon (its own
// catalog object, provisioned once by scripts/setup-dodo-extra-seat-addon.ts), attached to the
// subscription with its own quantity independent of the base plan. `prorated_immediately` bills
// or credits for the exact number of days left in the CURRENT billing period — unlike
// changeSubscriptionPlan's `do_not_bill` above, this is deliberately immediate (Alejandro: "que se
// aplique un descuento proporcional a la cantidad de dias no utilizados"). Calling changePlan
// (rather than some other endpoint) to update ONLY the addon quantity is intentional — Dodo has no
// separate "update just the addon" call; changePlan's request body is the one place addons are
// set, so `product_id`/`quantity` must still be re-sent as the subscription's unchanged current
// plan. Because this never touches subscription_period fields, `next_billing_date` (the billing
// cycle anchor) is untouched — the cycle always stays anchored to the original subscription date.
export async function updateSubscriptionSeats(externalSubscriptionId: string, input: UpdateSubscriptionSeatsInput): Promise<void> {
  await getClient().subscriptions.changePlan(externalSubscriptionId, {
    product_id: input.productId,
    quantity: 1,
    proration_billing_mode: 'prorated_immediately',
    addons: input.extraSeats > 0 ? [{ addon_id: requireExtraSeatAddonId(), quantity: input.extraSeats }] : [],
  });
}

function requireExtraSeatAddonId(): string {
  const id = process.env.DODO_EXTRA_SEAT_ADDON_ID;
  if (!id) {
    throw new Error('DODO_EXTRA_SEAT_ADDON_ID is not configured — run scripts/setup-dodo-extra-seat-addon.ts');
  }
  return id;
}

// Only used by scripts/setup-dodo-extra-seat-addon.ts — one addon, shared by every plan/market
// (unlike Products, which are per-PlanPrice-row), since the $4/seat surcharge doesn't vary by
// plan tier.
export async function createExtraSeatAddon(priceCents: number): Promise<string> {
  const addon = await getClient().addons.create({
    name: 'Extra seat',
    description: 'Additional active user beyond the plan\'s included seats',
    currency: 'USD',
    price: priceCents,
    tax_category: 'saas',
  });
  return addon.id;
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

// Fallback plan signal for the webhook (2026-09-16, QA-91 — a real test payment's
// metadata.plan came back empty on the Payment resource; checkoutService.ts's metadata IS sent
// at checkout creation, but Dodo propagating arbitrary custom metadata onto every later
// webhook/resource was only ever an assumption, never confirmed against a real delivery until
// now). `product_id` is structural data on the Subscription resource itself, not custom
// metadata, so routes/webhooks.ts resolves the plan from this (via PlanPrice.dodoProductId) when
// metadata.plan isn't present, instead of trusting metadata alone.
export async function getSubscriptionProductId(externalSubscriptionId: string): Promise<string> {
  const subscription = await getClient().subscriptions.retrieve(externalSubscriptionId);
  return subscription.product_id;
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
