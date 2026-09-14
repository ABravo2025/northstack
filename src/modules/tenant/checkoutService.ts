import prisma from '../../lib/prisma.js';
import { resolveProvider, recordSubscriptionActionAttempt } from './subscriptionService.js';
import { SIGNUP_TRIAL_DAYS } from './tenantService.js';
import { createPreapproval, updatePreapproval } from '../../lib/mercadopago.js';
import { createCheckoutSession, getCustomerPortalUrl } from '../../lib/dodopayments.js';

export interface StartCheckoutResult {
  success: boolean;
  error?: string;
  provider?: 'dodopayments' | 'mercadopago';
  initPoint?: string; // hosted redirect URL — Mercado Pago's init_point, or Dodo's checkout_url/Customer Portal link
}

const BILLING_CALLBACK_URL = 'https://app.joinnorthstack.com/billing/callback';

// POST /api/subscriptions/me/checkout (task-breakdown units 7 + 12, extended 2026-08-19 per
// Alejandro's correction: this single endpoint now covers two distinct intents depending on
// subscription state — subscribing for the first time (no provider yet) vs. updating the
// payment method on an already-active subscription. The two must never be conflated: calling
// the "subscribe" path again for an already-active tenant would create a SECOND, competing
// subscription on the provider's side (double billing), not update the existing one's card.
//
// Deliberately does NOT write any billing state to Subscription on the "subscribe" path: per
// the model's comment, `provider` stays null until a payment is actually confirmed, so this
// only creates the provider-side checkout artifact and hands back what the frontend needs to
// complete it. syncSubscriptionAndTenant (called from the webhook once payment confirms) is the
// only place that sets provider/externalSubscriptionId/currency for real. The one deliberate
// exception is recordSubscriptionActionAttempt below — it writes actor-attribution metadata
// only (who clicked this, when), not billing state, so the later webhook confirmation can
// attribute the resulting Activity Log entry to this user (see subscriptionService.ts).
export async function startCheckout(
  tenant: { id: string; country: string | null; trialEndsAt: Date | null },
  user: { id: string; email: string },
): Promise<StartCheckoutResult> {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
  if (!subscription) {
    return { success: false, error: 'No subscription found for this tenant' };
  }

  await recordSubscriptionActionAttempt(tenant.id, user.id);

  const isUpdatingPaymentMethod = subscription.provider !== null;

  if (isUpdatingPaymentMethod) {
    if (!subscription.externalSubscriptionId) {
      return { success: false, error: 'No active subscription to update the payment method for.' };
    }

    if (subscription.provider === 'dodopayments') {
      // Dedicated Dodo mechanism — updates the card on the SAME subscription, never creates a
      // new one. See getCustomerPortalUrl's comment in dodopayments.ts.
      const portalUrl = await getCustomerPortalUrl(subscription.externalSubscriptionId, BILLING_CALLBACK_URL);
      return { success: true, provider: 'dodopayments', initPoint: portalUrl };
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
  // Outside real production billing (staging, local dev), skip the trial and charge immediately
  // instead: Alejandro's 2026-08-20 request so the whole card→webhook→active-subscription flow can
  // be confirmed end-to-end against sandbox without waiting 15 real days. BILLING_ENV is shared
  // across both providers rather than a separate env var per provider, since both providers'
  // sandbox/live credentials are always flipped together in practice — there's no scenario with
  // one in sandbox and the other live.
  const isRealProductionBilling = process.env.BILLING_ENV === 'production';

  // Capped at whatever's actually left of the tenant's ORIGINAL trial window (set once at
  // signup, tenantService.ts), never a fresh SIGNUP_TRIAL_DAYS every time checkout runs —
  // Alejandro's 2026-08-21 catch: since nothing here writes Subscription.provider until a
  // webhook confirms payment, a tenant could otherwise start-but-abandon checkout indefinitely
  // and, whenever they finally did complete one, always land a brand new 15-day runway from that
  // moment — repeatedly pushing out the real first charge forever, exactly the "interminable"
  // trial he flagged. If the original window already lapsed (daysRemaining <= 0 — e.g. already
  // past_due), checkout charges immediately instead of granting more free time.
  const daysRemaining = tenant.trialEndsAt
    ? Math.ceil((tenant.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : 0;
  const trialDays =
    isUpdatingPaymentMethod || !isRealProductionBilling || daysRemaining <= 0
      ? undefined
      : Math.min(SIGNUP_TRIAL_DAYS, daysRemaining);

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

  // dodoProductId is provisioned by scripts/setup-dodo-products.ts, not created here — Dodo
  // requires a pre-created catalog Product for any recurring subscription (unlike Paddle's inline
  // non-catalog price), so a missing id here means the provisioning script hasn't run yet for this
  // PlanPrice row rather than something a customer-facing error should soften.
  if (!planPrice.dodoProductId) {
    throw new Error(`PlanPrice ${planPrice.id} (${planPrice.plan}/${planPrice.market}) has no dodoProductId — run scripts/setup-dodo-products.ts`);
  }

  const session = await createCheckoutSession({
    subscriptionId: subscription.id,
    email: user.email,
    productId: planPrice.dodoProductId,
    returnUrl: BILLING_CALLBACK_URL,
    trialDays,
  });

  return { success: true, provider: 'dodopayments', initPoint: session.checkoutUrl };
}
