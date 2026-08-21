import { createHmac, timingSafeEqual } from 'crypto';

// Billing Integration (spec-billing-integration.md) — hand-rolled wrapper (fetch + native
// crypto), same reasoning as src/lib/mercadopago.ts: no SDK for a handful of plain REST calls
// plus an HMAC check.
//
// Paddle uses two entirely different hostnames for sandbox vs. live (unlike Mercado Pago, where
// a test access token hits the same api.mercadopago.com host) — a sandbox API key simply won't
// authenticate against api.paddle.com at all, and vice versa. Defaults to sandbox: safer to fail
// toward "never accidentally charges a real card" if PADDLE_ENV is ever left unset than the
// other way around. Set PADDLE_ENV=production only once PADDLE_API_KEY is a real live key.
const PADDLE_API_BASE = process.env.PADDLE_ENV === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com';

function requireApiKey(): string {
  const key = process.env.PADDLE_API_KEY;
  if (!key) {
    throw new Error('PADDLE_API_KEY is not configured');
  }
  return key;
}

async function paddleRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${PADDLE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Paddle API error (${response.status}): ${text}`);
  }

  // Verified 2026-08-19 against a real Paddle sandbox response — every Paddle API response
  // wraps the actual entity in a `{ data, meta }` envelope, never the bare entity. Without this
  // unwrap, e.g. createNonCatalogTransaction's `transaction.id` would silently be `undefined`
  // instead of throwing, since `id` only exists on `response.data.id`.
  const json = (await response.json()) as { data: T };
  return json.data;
}

export interface NonCatalogTransactionInput {
  subscriptionId: string; // -> custom_data.subscriptionId, the join key back to our Subscription row on the webhook (same role as Mercado Pago's external_reference)
  description: string;
  amountCents: number;
  currencyCode: string; // "USD"
  // Card collected now, first real charge delayed this many days (Alejandro's 2026-08-20
  // correction — genuinely "free for 15 days", not "pay immediately when you pick a plan").
  // Caller passes tenantService.ts's SIGNUP_TRIAL_DAYS rather than this file importing it
  // directly, keeping this a generic provider wrapper with no business-logic dependencies.
  // Omit (or 0) for a fresh transaction that should charge immediately — e.g. checkoutService.ts's
  // Mercado Pago "update payment method" fallback (cancel + recreate a preapproval for an
  // already-active subscriber) must never grant a second free trial.
  trialDays?: number;
}

export interface PaddleTransaction {
  id: string;
  status: string;
}

// Full transaction detail, confirmed 2026-08-19 against a real completed sandbox transaction
// (GET /transactions/{id}). Used by the webhook handler's security round-trip — never trust the
// webhook body directly (same principle already applied to Mercado Pago) — and specifically
// because the webhook payload's own `payments` array was observed empty/incomplete at the exact
// moment transaction.completed fired, while this same endpoint had the full card details.
export interface PaddleTransactionDetail {
  id: string;
  status: string;
  subscription_id: string | null;
  payments: { status: string; method_details?: { type: string; card?: { type: string; last4: string } } }[];
  details: { totals: { total: string } };
}

export async function getTransaction(id: string): Promise<PaddleTransactionDetail> {
  return paddleRequest<PaddleTransactionDetail>('GET', `/transactions/${id}`);
}

// Real invoice document, per Alejandro's request (2026-08-19) — Invoices should link to the
// actual PDF Paddle generates, not just our own DB row. The URL Paddle returns is temporary
// (expires ~1h per their docs), so this is called fresh on each "View invoice" click rather than
// cached on the Invoice row. No Mercado Pago equivalent — AFIP electronic invoicing for
// Argentina is explicitly out of scope (spec's "Facturación fiscal Argentina" section).
// disposition confirmed against Paddle's docs — 'inline' opens the PDF in the browser,
// 'attachment' (their default) makes the browser save it directly.
export async function getInvoicePdfUrl(transactionId: string, disposition: 'inline' | 'attachment' = 'inline'): Promise<string> {
  const result = await paddleRequest<{ url: string }>('GET', `/transactions/${transactionId}/invoice?disposition=${disposition}`);
  return result.url;
}

// spec's "Paddle — Checkout (Overlay)" says the price is passed dynamically "in the call" — in
// practice, Paddle.js's Checkout.open() only takes a `priceId` (catalog) or a `transactionId`,
// never an inline price. The actual mechanism that achieves the same dynamic-price outcome (no
// fixed catalog Price ID, since lockedPriceCents varies per tenant) is: create a Transaction here
// with a non-catalog inline price — Paddle creates ephemeral Price/Product entities for it — then
// the frontend opens the Overlay with `Checkout.open({ transactionId: transaction.id })`.
//
// Verified 2026-08-19 against a real Paddle sandbox (POST /transactions): a non-catalog `price`
// must nest an inline `product` too (name + tax_category) — a bare price with no product_id and
// no product object 400s with "product_id is required" / "product is required". customer_id was
// NOT required for the transaction to be created in `draft` status — the overlay collects it.
//
// trial_period verified 2026-08-20 against a real sandbox transaction: response echoes back
// `trial_period: { interval: 'day', frequency: 15, requires_payment_method: true }` and
// `details.totals.total: "0"` — card is collected at checkout, nothing is actually charged until
// the trial period ends, exactly the "genuinely free for N days" behavior this needs. Paddle
// fires `subscription.created` (not transaction.completed, which lands here as a $0 event —
// see routes/webhooks.ts's isPaymentMethodUpdateOnly branch) once checkout completes; the real
// first charge later fires as an ordinary non-zero transaction.completed, already handled.
export async function createNonCatalogTransaction(input: NonCatalogTransactionInput): Promise<PaddleTransaction> {
  return paddleRequest<PaddleTransaction>('POST', '/transactions', {
    items: [
      {
        quantity: 1,
        price: {
          description: input.description,
          product: { name: input.description, tax_category: 'standard' },
          unit_price: { amount: String(input.amountCents), currency_code: input.currencyCode },
          billing_cycle: { interval: 'month', frequency: 1 },
          // Without this, Paddle defaults to { minimum: 1, maximum: 100 } and the checkout shows
          // an editable quantity stepper — wrong for a per-seat-less subscription to one plan.
          quantity: { minimum: 1, maximum: 1 },
          ...(input.trialDays ? { trial_period: { interval: 'day', frequency: input.trialDays } } : {}),
        },
      },
    ],
    custom_data: { subscriptionId: input.subscriptionId },
  });
}

// Update payment method on an EXISTING subscription (Alejandro's 2026-08-19 correction: this is
// distinct from subscribing — must never create a second, competing Paddle subscription). Paddle
// has a dedicated mechanism for this: GET this transaction, then open it the same way as any
// other Overlay checkout (Checkout.open({ transactionId })). Paddle bills it as a $0/minimal
// validation charge, not a real period charge — routes/webhooks.ts skips creating an Invoice for
// it, only updates paymentMethodBrand/Last4.
export async function getUpdatePaymentMethodTransaction(subscriptionId: string): Promise<PaddleTransaction> {
  return paddleRequest<PaddleTransaction>('GET', `/subscriptions/${subscriptionId}/update-payment-method-transaction`);
}

export interface UpdateSubscriptionItemsInput {
  description: string;
  amountCents: number; // dynamic — lockedPriceCents varies per tenant, never a catalog Price ID
  currencyCode: string;
}

// Self-serve change-plan (Etapa D) — `proration_billing_mode: 'do_not_bill'` per the spec ("Sin
// prorrateo"): the new amount only applies starting next_billing_period, nothing charged now.
export async function updateSubscriptionItems(subscriptionId: string, input: UpdateSubscriptionItemsInput): Promise<unknown> {
  return paddleRequest('PATCH', `/subscriptions/${subscriptionId}`, {
    items: [
      {
        quantity: 1,
        price: {
          description: input.description,
          product: { name: input.description, tax_category: 'standard' },
          unit_price: { amount: String(input.amountCents), currency_code: input.currencyCode },
          billing_cycle: { interval: 'month', frequency: 1 },
          // Without this, Paddle defaults to { minimum: 1, maximum: 100 } and the checkout shows
          // an editable quantity stepper — wrong for a per-seat-less subscription to one plan.
          quantity: { minimum: 1, maximum: 1 },
        },
      },
    ],
    proration_billing_mode: 'do_not_bill',
  });
}

// Self-serve cancel (Etapa D) — Paddle supports scheduled cancellation natively
// (effective_from: next_billing_period, the default), unlike Mercado Pago which needs the cron
// (planTransitionService.ts) to make a separate call once cancellationEffectiveAt arrives.
export async function cancelSubscription(
  subscriptionId: string,
  effectiveFrom: 'next_billing_period' | 'immediately' = 'next_billing_period',
): Promise<unknown> {
  return paddleRequest('POST', `/subscriptions/${subscriptionId}/cancel`, { effective_from: effectiveFrom });
}

// Self-serve resume (Etapa D) — undoes a scheduled cancellation/pause. Not in the original
// task-breakdown ("resume... no requiere llamar a ningún proveedor") — that's only true for
// Mercado Pago (which never got a provider call at cancel time to begin with). Paddle DID get a
// real cancelSubscription() call, so resuming has to clear that scheduled_change too, or Paddle
// cancels the subscription on the scheduled date regardless of what our local DB says.
// Confirmed against Paddle's docs: PATCH /subscriptions/{id} with scheduled_change: null clears
// any pending scheduled change (cancel or pause).
export async function removeScheduledChange(subscriptionId: string): Promise<unknown> {
  return paddleRequest('PATCH', `/subscriptions/${subscriptionId}`, { scheduled_change: null });
}

export interface VerifyPaddleSignatureInput {
  signatureHeader: string;
  rawBody: string;
}

// spec's webhook contract: header `Paddle-Signature` is "ts=<unix>;h1=<hex>" (semicolon-separated
// — different from Mercado Pago's comma format above). Signed payload is "{ts}:{rawBody}"
// (literal colon, confirmed against Paddle's own Go SDK), HMAC-SHA256 with PADDLE_WEBHOOK_SECRET,
// hex digest, compared against h1. Must run against the raw, unparsed request body — a
// reserialized JSON.stringify(parsed) is not guaranteed byte-identical to what Paddle signed.
export function verifyPaddleSignature(input: VerifyPaddleSignatureInput): boolean {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    return false;
  }

  const parts = new Map<string, string>();
  for (const part of input.signatureHeader.split(';')) {
    const [key, value] = part.split('=');
    if (key && value) {
      parts.set(key.trim(), value.trim());
    }
  }
  const ts = parts.get('ts');
  const h1 = parts.get('h1');
  if (!ts || !h1) {
    return false;
  }

  const signedPayload = `${ts}:${input.rawBody}`;
  const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(h1, 'utf8');
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
