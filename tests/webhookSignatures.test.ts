import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyPaddleSignature } from '../src/lib/paddle.js';
import { verifyMercadoPagoSignature } from '../src/lib/mercadopago.js';
import { verifyStripeSignature } from '../src/lib/stripe.js';

describe('verifyPaddleSignature', () => {
  const secret = 'test-paddle-secret';

  beforeEach(() => {
    process.env.PADDLE_WEBHOOK_SECRET = secret;
  });

  afterEach(() => {
    delete process.env.PADDLE_WEBHOOK_SECRET;
  });

  it('accepts a correctly signed payload — signed_payload is "{ts}:{rawBody}", HMAC-SHA256 hex', () => {
    const ts = '1700000000';
    const rawBody = '{"event_type":"transaction.completed"}';
    const h1 = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex');

    expect(verifyPaddleSignature({ signatureHeader: `ts=${ts};h1=${h1}`, rawBody })).toBe(true);
  });

  it('rejects when the raw body was tampered with after signing', () => {
    const ts = '1700000000';
    const rawBody = '{"event_type":"transaction.completed"}';
    const h1 = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex');

    expect(verifyPaddleSignature({ signatureHeader: `ts=${ts};h1=${h1}`, rawBody: `${rawBody}tampered` })).toBe(false);
  });

  it('rejects a malformed or missing header', () => {
    expect(verifyPaddleSignature({ signatureHeader: 'not-a-valid-header', rawBody: '{}' })).toBe(false);
    expect(verifyPaddleSignature({ signatureHeader: 'ts=123', rawBody: '{}' })).toBe(false);
  });

  it('fails closed when PADDLE_WEBHOOK_SECRET is not configured', () => {
    delete process.env.PADDLE_WEBHOOK_SECRET;
    const ts = '1700000000';
    const rawBody = '{}';
    const h1 = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex');

    expect(verifyPaddleSignature({ signatureHeader: `ts=${ts};h1=${h1}`, rawBody })).toBe(false);
  });
});

describe('verifyMercadoPagoSignature', () => {
  const secret = 'test-mp-secret';

  beforeEach(() => {
    process.env.MP_WEBHOOK_SECRET = secret;
  });

  afterEach(() => {
    delete process.env.MP_WEBHOOK_SECRET;
  });

  it('accepts a correctly signed manifest — "id:{dataId};request-id:{xRequestId};ts:{ts};", HMAC-SHA256 hex', () => {
    const ts = '1700000000';
    const dataId = 'abc123';
    const xRequestId = 'req-1';
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const v1 = createHmac('sha256', secret).update(manifest).digest('hex');

    expect(verifyMercadoPagoSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId, dataId })).toBe(true);
  });

  it('rejects when dataId does not match what was actually signed', () => {
    const ts = '1700000000';
    const xRequestId = 'req-1';
    const manifest = `id:abc123;request-id:${xRequestId};ts:${ts};`;
    const v1 = createHmac('sha256', secret).update(manifest).digest('hex');

    expect(verifyMercadoPagoSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId, dataId: 'different-id' })).toBe(false);
  });

  it('rejects a malformed x-signature header', () => {
    expect(verifyMercadoPagoSignature({ xSignature: 'garbage', xRequestId: 'r', dataId: 'd' })).toBe(false);
  });

  it('fails closed when MP_WEBHOOK_SECRET is not configured', () => {
    delete process.env.MP_WEBHOOK_SECRET;
    expect(verifyMercadoPagoSignature({ xSignature: 'ts=1,v1=abc', xRequestId: 'r', dataId: 'd' })).toBe(false);
  });
});

// Payments v1 (spec-payments-v1.md) — unlike Paddle/Mercado Pago above, Stripe's secret is
// per-tenant (StripeConnection.webhookSigningSecretEncrypted), so verifyStripeSignature takes it
// as a parameter instead of reading a single global env var — no "unconfigured env var" case to
// test here, a missing/wrong secret is just "the caller passed the wrong string".
describe('verifyStripeSignature', () => {
  const secret = 'whsec_test_secret';

  it('accepts a correctly signed payload — signed_payload is "{t}.{rawBody}", HMAC-SHA256 hex', () => {
    const t = '1700000000';
    const rawBody = '{"type":"charge.refunded"}';
    const v1 = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');

    expect(verifyStripeSignature({ signatureHeader: `t=${t},v1=${v1}`, rawBody, secret })).toBe(true);
  });

  it('rejects when the raw body was tampered with after signing', () => {
    const t = '1700000000';
    const rawBody = '{"type":"charge.refunded"}';
    const v1 = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');

    expect(verifyStripeSignature({ signatureHeader: `t=${t},v1=${v1}`, rawBody: `${rawBody}tampered`, secret })).toBe(false);
  });

  it('rejects a malformed or missing header', () => {
    expect(verifyStripeSignature({ signatureHeader: 'not-a-valid-header', rawBody: '{}', secret })).toBe(false);
    expect(verifyStripeSignature({ signatureHeader: 't=123', rawBody: '{}', secret })).toBe(false);
  });

  it('rejects a signature produced with a different secret', () => {
    const t = '1700000000';
    const rawBody = '{}';
    const v1 = createHmac('sha256', 'a-different-secret').update(`${t}.${rawBody}`).digest('hex');

    expect(verifyStripeSignature({ signatureHeader: `t=${t},v1=${v1}`, rawBody, secret })).toBe(false);
  });
});
