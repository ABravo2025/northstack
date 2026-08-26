import { createHmac, timingSafeEqual } from 'crypto';

// Payments v1 (spec-payments-v1.md) — hand-rolled wrapper (fetch + native crypto) instead of the
// official `stripe` SDK, matching this codebase's existing bias against a dependency for a small
// REST surface (see src/lib/paddle.ts / src/lib/mercadopago.ts — same reasoning, same category of
// integration: a payment provider's API). Unlike Paddle/Mercado Pago, there is no single fixed
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
): Promise<T> {
  const pairs = params ? toFormPairs(params) : [];
  const query = method === 'GET' && pairs.length ? `?${pairs.join('&')}` : '';
  const body = method !== 'GET' && pairs.length ? pairs.join('&') : undefined;

  const response = await fetch(`${STRIPE_API_BASE}${path}${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
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

export interface VerifyStripeSignatureInput {
  signatureHeader: string;
  rawBody: string;
  secret: string;
}

// Stripe's webhook contract: header `Stripe-Signature` is "t=<unix>,v1=<hex>[,v0=<hex>]"
// (comma-separated, same shape as Mercado Pago's x-signature but with `t` instead of `ts`).
// Signed payload is "{t}.{rawBody}" (literal dot — Paddle uses a colon, Mercado Pago a
// semicolon-delimited manifest string), HMAC-SHA256 with the secret, hex digest, compared
// against v1. Per-tenant secret (StripeConnection.webhookSigningSecretEncrypted), not a single
// env var like Paddle/Mercado Pago's *_WEBHOOK_SECRET — confirmed against Stripe's own docs
// (stripe.com/docs/webhooks/signatures). Unused until Unit 4 (the webhook route itself).
export function verifyStripeSignature(input: VerifyStripeSignatureInput): boolean {
  const parts = new Map<string, string>();
  for (const part of input.signatureHeader.split(',')) {
    const [key, value] = part.split('=');
    if (key && value) {
      parts.set(key.trim(), value.trim());
    }
  }
  const t = parts.get('t');
  const v1 = parts.get('v1');
  if (!t || !v1) {
    return false;
  }

  const signedPayload = `${t}.${input.rawBody}`;
  const expected = createHmac('sha256', input.secret).update(signedPayload).digest('hex');

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(v1, 'utf8');
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
