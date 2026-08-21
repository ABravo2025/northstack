import { createHmac, timingSafeEqual } from 'crypto';

// Billing Integration (spec-billing-integration.md) — hand-rolled wrapper (fetch + native
// crypto) instead of the official `mercadopago` SDK, matching this codebase's existing bias
// against a dependency for something this small (see src/lib/encryption.ts's native `crypto`
// instead of a library, csvService.ts's hand-rolled parser). Mercado Pago's REST surface here is
// three plain calls plus an HMAC check — none of it justifies a new package.
const MP_API_BASE = 'https://api.mercadopago.com';

function requireAccessToken(): string {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new Error('MP_ACCESS_TOKEN is not configured');
  }
  return token;
}

// No special "sandbox mode" header needed (unlike Paddle's separate sandbox hostname) — Mercado
// Pago infers test vs. real purely from which identity MP_ACCESS_TOKEN belongs to. Confirmed
// 2026-08-19 the hard way: an `X-scope: stage` header (documented for a *different* testing
// pattern — a real dev account's own TEST- credential, no separate test-seller swap) was tried
// here first and made things worse (500 -> 503) once paired with a genuine test-seller token;
// removing it is what actually made POST /preapproval succeed (201, real init_point returned).
async function mpRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${MP_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${requireAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Mercado Pago API error (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

export interface CreatePreapprovalInput {
  subscriptionId: string; // becomes external_reference — the join key back to our Subscription row (spec: "no confiar solo en externalSubscriptionId")
  reason: string;
  payerEmail: string;
  transactionAmount: number; // major currency units (ARS) — MP's API takes a decimal amount, not cents
  backUrl: string;
  // Card collected now, first real charge delayed this many days (Alejandro's 2026-08-20
  // correction — genuinely "free for 15 days"). Caller passes tenantService.ts's
  // SIGNUP_TRIAL_DAYS rather than this file importing it directly. Omit (or 0) for the
  // "update payment method" fallback (cancel + recreate a preapproval for an already-active
  // subscriber) — that must never grant a second free trial.
  trialDays?: number;
}

export interface MercadoPagoPreapproval {
  id: string;
  status: string;
  init_point?: string;
  external_reference?: string;
  auto_recurring?: { transaction_amount: number; currency_id: string };
}

// spec's "Mercado Pago — Suscripciones, sin plan asociado": `status: 'pending'` (no
// `card_token_id`) is what makes the response carry `init_point` for the hosted checkout
// redirect — we never build a card form ourselves.
//
// free_trial verified 2026-08-20 against a real sandbox preapproval: response echoes
// `auto_recurring.free_trial: { frequency: 15, frequency_type: 'days', first_invoice_offset: 15 }`
// and `next_payment_date` 15 days out from creation — card is attached once the payer completes
// checkout (fires `preapproval` status `authorized`, already handled), but the actual first
// charge (the `authorized_payment` webhook, already handled) only happens at next_payment_date.
export async function createPreapproval(input: CreatePreapprovalInput): Promise<MercadoPagoPreapproval> {
  return mpRequest<MercadoPagoPreapproval>('POST', '/preapproval', {
    reason: input.reason,
    external_reference: input.subscriptionId,
    payer_email: input.payerEmail,
    back_url: input.backUrl,
    status: 'pending',
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: input.transactionAmount,
      currency_id: 'ARS',
      ...(input.trialDays ? { free_trial: { frequency: input.trialDays, frequency_type: 'days' } } : {}),
    },
  });
}

// Webhook security (spec's "Seguridad" section) — never trust the webhook body directly, always
// round-trip to MP's API for the real resource before acting on it.
export async function getPreapproval(id: string): Promise<MercadoPagoPreapproval> {
  return mpRequest<MercadoPagoPreapproval>('GET', `/preapproval/${id}`);
}

// Not in the original task-breakdown wrapper list (createPreapproval/getPreapproval/
// updatePreapproval only) — added because the webhook contract table requires reacting to
// `authorized_payment` events (recurring payment confirmed/failed) separately from `preapproval`
// events, and those need their own round-trip: GET /authorized_payments/{id}, not
// /preapproval/{id}. Without this, "pago recurrente confirmado/falla" can't be verified securely.
// payment_method_id/card are UNVERIFIED against a real payload (not surfaced in any response
// seen so far, since sandbox never got past a `pending` preapproval) — best-effort field names
// following MP's general Payments API convention, confirm against a real authorized_payment
// before relying on them for anything beyond the display-only paymentMethodBrand/Last4 fields.
export interface MercadoPagoAuthorizedPayment {
  id: string;
  status: string;
  preapproval_id: string;
  transaction_amount: number;
  payment_method_id?: string; // e.g. "visa", "master"
  card?: { last_four_digits?: string };
}

export async function getAuthorizedPayment(id: string): Promise<MercadoPagoAuthorizedPayment> {
  return mpRequest<MercadoPagoAuthorizedPayment>('GET', `/authorized_payments/${id}`);
}

export interface UpdatePreapprovalInput {
  status?: 'authorized' | 'paused' | 'cancelled';
  transactionAmount?: number;
}

export async function updatePreapproval(id: string, input: UpdatePreapprovalInput): Promise<MercadoPagoPreapproval> {
  const data: Record<string, unknown> = {};
  if (input.status !== undefined) {
    data.status = input.status;
  }
  if (input.transactionAmount !== undefined) {
    data.auto_recurring = { transaction_amount: input.transactionAmount };
  }
  return mpRequest<MercadoPagoPreapproval>('PUT', `/preapproval/${id}`, data);
}

export interface VerifyMercadoPagoSignatureInput {
  xSignature: string;
  xRequestId: string;
  dataId: string;
}

// spec's webhook contract: header `x-signature` is "ts=<unix>,v1=<hex>" (comma-separated —
// different from Paddle's semicolon format below), manifest string is
// "id:{data.id};request-id:{x-request-id};ts:{ts};", HMAC-SHA256 with MP_WEBHOOK_SECRET, hex
// digest, compared against v1. `dataId` must be exactly the raw `data.id` query-param value MP
// sent (case/encoding matters — a known source of real-world verification mismatches), so pass
// it through unmodified from the request, don't re-derive it from the parsed body.
export function verifyMercadoPagoSignature(input: VerifyMercadoPagoSignatureInput): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    return false;
  }

  const parts = new Map<string, string>();
  for (const part of input.xSignature.split(',')) {
    const [key, value] = part.split('=');
    if (key && value) {
      parts.set(key.trim(), value.trim());
    }
  }
  const ts = parts.get('ts');
  const v1 = parts.get('v1');
  if (!ts || !v1) {
    return false;
  }

  const manifest = `id:${input.dataId};request-id:${input.xRequestId};ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(v1, 'utf8');
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
