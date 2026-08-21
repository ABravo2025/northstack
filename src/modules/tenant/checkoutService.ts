import prisma from '../../lib/prisma.js';
import { resolveProvider } from './subscriptionService.js';
import { SIGNUP_TRIAL_DAYS } from './tenantService.js';
import { createPreapproval, updatePreapproval } from '../../lib/mercadopago.js';
import { createNonCatalogTransaction, getUpdatePaymentMethodTransaction } from '../../lib/paddle.js';

export interface StartCheckoutResult {
  success: boolean;
  error?: string;
  provider?: 'paddle' | 'mercadopago';
  initPoint?: string; // Mercado Pago — redirect the browser here
  paddleTransactionId?: string; // Paddle — Checkout.open({ transactionId })
}

const BILLING_CALLBACK_URL = 'https://app.joinnorthstack.com/billing/callback';

// POST /api/subscriptions/me/checkout (task-breakdown units 7 + 12, extended 2026-08-19 per
// Alejandro's correction: this single endpoint now covers two distinct intents depending on
// subscription state — subscribing for the first time (no provider yet) vs. updating the
// payment method on an already-active subscription. The two must never be conflated: calling
// the "subscribe" path again for an already-active tenant would create a SECOND, competing
// subscription on the provider's side (double billing), not update the existing one's card.
//
// Deliberately does NOT write anything to Subscription on the "subscribe" path: per the model's
// comment, `provider` stays null until a payment is actually confirmed, so this only creates the
// provider-side checkout artifact and hands back what the frontend needs to complete it.
// syncSubscriptionAndTenant (called from the webhook once payment confirms) is the only place
// that sets provider/externalSubscriptionId/currency for real.
export async function startCheckout(
  tenant: { id: string; country: string | null },
  user: { email: string },
): Promise<StartCheckoutResult> {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
  if (!subscription) {
    return { success: false, error: 'No subscription found for this tenant' };
  }

  const isUpdatingPaymentMethod = subscription.provider !== null;

  if (isUpdatingPaymentMethod) {
    if (!subscription.externalSubscriptionId) {
      return { success: false, error: 'No active subscription to update the payment method for.' };
    }

    if (subscription.provider === 'paddle') {
      // Dedicated Paddle mechanism — updates the card on the SAME subscription, never creates a
      // new one. See getUpdatePaymentMethodTransaction's comment in paddle.ts.
      const transaction = await getUpdatePaymentMethodTransaction(subscription.externalSubscriptionId);
      return { success: true, provider: 'paddle', paddleTransactionId: transaction.id };
    }

    // Mercado Pago has no equivalent "just swap the card" mechanism reachable via the same
    // hosted-redirect flow we already built (it would need its own card-tokenization form via
    // MP.js Secure Fields — real added scope, deferred). Pragmatic substitute that still lands
    // on "one active card, overwritten": cancel the old preapproval, then fall through to create
    // a fresh one below — same redirect flow as subscribing for the first time. The webhook's
    // existing `externalSubscriptionId: preapproval.id` write naturally replaces the old id.
    await updatePreapproval(subscription.externalSubscriptionId, { status: 'cancelled' });
  }

  const provider = subscription.provider ?? resolveProvider(tenant);
  const market = provider === 'mercadopago' ? 'ar' : 'international';
  const planPrice = await prisma.planPrice.findFirst({
    where: { plan: subscription.plan, market },
    orderBy: { effectiveFrom: 'desc' },
  });

  // Covers both "no row at all" and the AR placeholder rows (0 cents) — spec: real ARS pricing
  // "no bloquea construir la estructura, sí bloquea probar el flujo completo en Argentina".
  if (!planPrice || planPrice.launchPriceCents <= 0) {
    return { success: false, error: 'Pricing for your market is not available yet. Please contact support.' };
  }

  // Genuinely free for SIGNUP_TRIAL_DAYS (Alejandro's 2026-08-20 correction) — but only for an
  // actual fresh subscription, never the Mercado Pago "update payment method" fallback above
  // (isUpdatingPaymentMethod true, cancelled the old preapproval, fell through to here): that
  // subscriber already had — or used up — their trial, granting another one would be a real bug.
  //
  // Outside real production billing (staging, local dev — anywhere PADDLE_API_BASE already
  // resolves to the sandbox host per paddle.ts), skip the trial and charge immediately instead:
  // Alejandro's 2026-08-20 request so the whole card→webhook→active-subscription flow can be
  // confirmed end-to-end against sandbox without waiting 15 real days. Reuses PADDLE_ENV rather
  // than adding a second env var, since both providers' sandbox/live credentials are always
  // flipped together in practice — there's no scenario with one in sandbox and the other live.
  const isRealProductionBilling = process.env.PADDLE_ENV === 'production';
  const trialDays = isUpdatingPaymentMethod || !isRealProductionBilling ? undefined : SIGNUP_TRIAL_DAYS;

  if (provider === 'mercadopago') {
    const preapproval = await createPreapproval({
      subscriptionId: subscription.id,
      reason: `Northstack — ${subscription.plan} (AR)`,
      payerEmail: user.email,
      transactionAmount: planPrice.launchPriceCents / 100,
      backUrl: BILLING_CALLBACK_URL,
      trialDays,
    });

    return { success: true, provider: 'mercadopago', initPoint: preapproval.init_point };
  }

  const transaction = await createNonCatalogTransaction({
    subscriptionId: subscription.id,
    description: `Northstack — ${subscription.plan}`,
    amountCents: planPrice.launchPriceCents,
    currencyCode: 'USD',
    trialDays,
  });

  return { success: true, provider: 'paddle', paddleTransactionId: transaction.id };
}
