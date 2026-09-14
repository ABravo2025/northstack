import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks the `dodopayments` SDK itself (vi.hoisted since vi.mock is hoisted above these const
// declarations) rather than global fetch — unlike paddle.ts's now-deleted hand-rolled fetch
// wrapper, dodopayments.ts delegates the actual HTTP/response-shape handling to the official SDK,
// so what's worth regression-testing here is that OUR wrapper calls it with the right arguments
// and handles its response/errors correctly, not the SDK's own internals.
const { mockCheckoutCreate, mockUnwrap } = vi.hoisted(() => ({
  mockCheckoutCreate: vi.fn(),
  mockUnwrap: vi.fn(),
}));

vi.mock('dodopayments', () => ({
  default: class {
    checkoutSessions = { create: mockCheckoutCreate };
    webhooks = { unwrap: mockUnwrap };
  },
}));

const { createCheckoutSession, unwrapDodoWebhookEvent } = await import('../src/lib/dodopayments.js');

describe('createCheckoutSession', () => {
  beforeEach(() => {
    process.env.DODO_PAYMENTS_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.DODO_PAYMENTS_API_KEY;
    mockCheckoutCreate.mockReset();
  });

  it('builds a single-quantity product_cart with metadata.subscriptionId as the join key, and omits subscription_data when no trial is granted', async () => {
    mockCheckoutCreate.mockResolvedValue({ session_id: 'cks_1', checkout_url: 'https://checkout.dodopayments.com/cks_1' });

    const result = await createCheckoutSession({
      subscriptionId: 'sub_row_1',
      email: 'owner@example.com',
      productId: 'pdt_starter',
      returnUrl: 'https://app.joinnorthstack.com/billing/callback',
    });

    expect(result.checkoutUrl).toBe('https://checkout.dodopayments.com/cks_1');
    expect(mockCheckoutCreate).toHaveBeenCalledWith({
      product_cart: [{ product_id: 'pdt_starter', quantity: 1 }],
      customer: { email: 'owner@example.com' },
      return_url: 'https://app.joinnorthstack.com/billing/callback',
      metadata: { subscriptionId: 'sub_row_1' },
    });
  });

  it('includes subscription_data.trial_period_days only when trialDays is passed', async () => {
    mockCheckoutCreate.mockResolvedValue({ session_id: 'cks_2', checkout_url: 'https://checkout.dodopayments.com/cks_2' });

    await createCheckoutSession({
      subscriptionId: 'sub_row_2',
      email: 'owner@example.com',
      productId: 'pdt_starter',
      returnUrl: 'https://app.joinnorthstack.com/billing/callback',
      trialDays: 15,
    });

    expect(mockCheckoutCreate).toHaveBeenCalledWith(expect.objectContaining({ subscription_data: { trial_period_days: 15 } }));
  });

  it('throws when the SDK returns no checkout_url', async () => {
    mockCheckoutCreate.mockResolvedValue({ session_id: 'cks_3', checkout_url: null });

    await expect(
      createCheckoutSession({ subscriptionId: 'sub_row_3', email: 'a@b.com', productId: 'pdt_starter', returnUrl: 'https://x' }),
    ).rejects.toThrow('checkout_url');
  });
});

describe('unwrapDodoWebhookEvent', () => {
  beforeEach(() => {
    process.env.DODO_PAYMENTS_API_KEY = 'test-key';
    process.env.DODO_WEBHOOK_KEY = 'whsec_test';
  });

  afterEach(() => {
    delete process.env.DODO_PAYMENTS_API_KEY;
    delete process.env.DODO_WEBHOOK_KEY;
    mockUnwrap.mockReset();
  });

  it('fails closed when DODO_WEBHOOK_KEY is not configured', () => {
    delete process.env.DODO_WEBHOOK_KEY;
    expect(() => unwrapDodoWebhookEvent('{}', { 'webhook-id': 'msg_1' })).toThrow('DODO_WEBHOOK_KEY');
    expect(mockUnwrap).not.toHaveBeenCalled();
  });

  it('normalizes a duplicated header (string[]) to its first value and passes the configured key', () => {
    mockUnwrap.mockReturnValue({ type: 'payment.succeeded', data: {} });

    unwrapDodoWebhookEvent('{"type":"payment.succeeded"}', { 'webhook-id': ['msg_1', 'msg_1_dup'], 'webhook-signature': 'v1,abc' });

    expect(mockUnwrap).toHaveBeenCalledWith('{"type":"payment.succeeded"}', {
      headers: { 'webhook-id': 'msg_1', 'webhook-signature': 'v1,abc' },
      key: 'whsec_test',
    });
  });
});
