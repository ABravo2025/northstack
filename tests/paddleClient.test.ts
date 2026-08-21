import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNonCatalogTransaction } from '../src/lib/paddle.js';

// Regression coverage for a real bug found 2026-08-19 against a live Paddle sandbox: every
// Paddle API response wraps the actual entity in a `{ data, meta }` envelope — without unwrapping
// it, `transaction.id` silently came back `undefined` instead of throwing, since the real `id`
// only exists at `response.data.id`.
describe('createNonCatalogTransaction — Paddle response envelope', () => {
  beforeEach(() => {
    process.env.PADDLE_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.PADDLE_API_KEY;
    vi.unstubAllGlobals();
  });

  it('unwraps the {data, meta} envelope instead of returning it as-is', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: { id: 'txn_123', status: 'draft' },
        meta: { request_id: 'abc' },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const transaction = await createNonCatalogTransaction({
      subscriptionId: 'sub_1',
      description: 'Northstack — starter',
      amountCents: 2900,
      currencyCode: 'USD',
    });

    expect(transaction.id).toBe('txn_123');
    expect(transaction.status).toBe('draft');
  });

  it('throws with the response body on a non-ok status, without trying to unwrap anything', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => '{"error":{"code":"bad_request"}}',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createNonCatalogTransaction({ subscriptionId: 'sub_1', description: 'x', amountCents: 100, currencyCode: 'USD' }),
    ).rejects.toThrow('Paddle API error (400)');
  });
});
