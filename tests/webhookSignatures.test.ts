import { createHmac } from 'crypto';
import { describe, expect, it, afterEach, beforeEach } from 'vitest';
import { verifyMercadoPagoSignature } from '../src/lib/mercadopago.js';

// No verifyDodoSignature here (unlike Paddle's/Mercado Pago's hand-rolled HMAC below) — Dodo
// Payments' webhook signature verification is delegated to the official SDK's
// client.webhooks.unwrap() (dodopayments.ts's unwrapDodoWebhookEvent), covered in
// tests/dodoPaymentsClient.test.ts instead of reimplementing the Standard Webhooks HMAC math here.

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
