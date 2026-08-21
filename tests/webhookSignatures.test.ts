import { createHmac } from 'crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyPaddleSignature } from '../src/lib/paddle.js';
import { verifyMercadoPagoSignature } from '../src/lib/mercadopago.js';

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
