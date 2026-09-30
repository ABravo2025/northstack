import prisma from '../../lib/prisma.js';
import { currentPlanPrice, marketForProvider, mercadoPagoAmount } from './planPriceService.js';
import type { PlanTier } from '@prisma/client';
import { resolveProvider, recordSubscriptionActionAttempt } from './subscriptionService.js';
import { SIGNUP_TRIAL_DAYS } from './tenantService.js';
import { buildExternalReference, createPreapproval } from '../../lib/mercadopago.js';
import { createCheckoutSession, getCustomerPortalUrl } from '../../lib/dodopayments.js';
import { countActiveSeats, extraSeatsFor } from './seatService.js';

export interface StartCheckoutResult {
  success: boolean;
  error?: string;
  provider?: 'dodopayments' | 'mercadopago';
  initPoint?: string; // hosted redirect URL — Mercado Pago's init_point, or Dodo's checkout_url/Customer Portal link
}

// Where both providers' hosted checkouts send the payer back. Was a hardcoded
// 'https://app.joinnorthstack.com/billing/callback' until 2026-09-26 — a route the frontend never
// had (Billing lives at /settings/billing), and always production, even from staging.
// Mercado Pago's own help page for changing a subscription's payment method — the payer does it
// from their MP account (MP publishes no per-subscription deep link for the payer).
export const MERCADO_PAGO_MANAGE_SUBSCRIPTION_URL = 'https://www.mercadopago.com.ar/ayuda/18157';

function billingReturnUrl(): string {
  return `${process.env.APP_BASE_URL ?? 'http://localhost:5173'}/settings/billing`;
}

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
//
// `requestedPlan` (2026-09-15, QA-88 — "Starter" was showing as the tenant's plan before they'd
// ever confirmed a payment, because the OLD flow called updateTenantPlan — writing Tenant.plan
// for real — before checkout even started) extends that same "nothing real until confirmed"
// philosophy to `plan` itself for the first-subscribe path: Tenant.plan/Subscription.plan now
// stay null/the signup placeholder respectively until the webhook confirms, and this function
// uses `requestedPlan` for all pricing/product lookups instead of trusting whatever's already on
// the (still-placeholder) Subscription row. It's threaded into Dodo's checkout metadata so the
// webhook can read it back (routes/webhooks.ts). Mercado Pago carries it in the preapproval's
// external_reference instead (buildExternalReference, 2026-09-26 — until then that branch wrote
// Tenant.plan immediately, before any confirmation).
export async function startCheckout(
  tenant: { id: string; country: string | null; trialEndsAt: Date | null },
  user: { id: string; email: string },
  requestedPlan?: PlanTier,
): Promise<StartCheckoutResult> {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
  if (!subscription) {
    return { success: false, error: 'No subscription found for this tenant' };
  }

  await recordSubscriptionActionAttempt(tenant.id, user.id);

  const isUpdatingPaymentMethod = subscription.provider !== null;

  if (!isUpdatingPaymentMethod && requestedPlan !== 'starter' && requestedPlan !== 'growth') {
    return { success: false, error: 'Choose a plan before starting checkout.' };
  }
  // Safe to assert non-null/narrow from here down in the !isUpdatingPaymentMethod branch —
  // validated just above. The isUpdatingPaymentMethod branch never reads this at all (existing
  // subscriber, not choosing a new plan here).
  const plan = requestedPlan as 'starter' | 'growth';

  if (isUpdatingPaymentMethod) {
    if (!subscription.externalSubscriptionId) {
      return { success: false, error: 'No active subscription to update the payment method for.' };
    }

    if (subscription.provider === 'dodopayments') {
      // Dedicated Dodo mechanism — updates the card on the SAME subscription, never creates a
      // new one. See getCustomerPortalUrl's comment in dodopayments.ts.
      const portalUrl = await getCustomerPortalUrl(subscription.externalSubscriptionId, billingReturnUrl());
      return { success: true, provider: 'dodopayments', initPoint: portalUrl };
    }

    // Mercado Pago (2026-09-30, Alejandro's call): the payer changes the card on the SAME
    // preapproval from their own Mercado Pago account — MP's own flow, no new authorization, no
    // second subscription, no double-charge window. We just send them there. Until now this
    // created a replacement preapproval and cancelled the old one once the new one was authorized
    // (mercadoPagoWebhookService.ts still handles a superseded one safely, for any created before).
    return { success: true, provider: 'mercadopago', initPoint: MERCADO_PAGO_MANAGE_SUBSCRIPTION_URL };
  }

  // From here on it's always a first-time subscribe (both update paths returned above): the plan
  // just chosen, validated above — never the signup placeholder still sitting on `subscription.plan`.
  const effectivePlan = plan;

  const provider = subscription.provider ?? resolveProvider(tenant);
  const market = marketForProvider(provider, tenant.country);
  // Priced from the current config (src/config/pricing.ts).
  const planPrice = await currentPlanPrice(effectivePlan, market);

  // Null = no price for this plan in this market (0 in the config) — spec: real ARS pricing "no
  // bloquea construir la estructura, sí bloquea probar el flujo completo en Argentina".
  if (!planPrice) {
    return { success: false, error: 'Pricing for your market is not available yet. Please contact support.' };
  }

  // Starting extra-seat count (seatService.ts) — a tenant already over its included seats by the
  // time it actually adds a card is billed correctly from the first invoice. Scale has no
  // self-serve checkout (see this function's own comment set elsewhere), and the planPrice lookup
  // above already scoped to Starter/Growth.
  const activeSeats = await countActiveSeats(tenant.id);
  const extraSeats = extraSeatsFor(effectivePlan, activeSeats);

  // Genuinely free for SIGNUP_TRIAL_DAYS (Alejandro's 2026-08-20 correction), for a fresh
  // subscription.
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
    !isRealProductionBilling || daysRemaining <= 0
      ? undefined
      : Math.min(SIGNUP_TRIAL_DAYS, daysRemaining);

  if (provider === 'mercadopago') {
    const preapproval = await createPreapproval({
      externalReference: buildExternalReference(subscription.id, planPrice.id),
      reason: `Northstack — ${effectivePlan} (AR)`,
      payerEmail: user.email,
      transactionAmount: mercadoPagoAmount(planPrice, extraSeats),
      backUrl: billingReturnUrl(),
      trialDays,
    });

    return { success: true, provider: 'mercadopago', initPoint: preapproval.init_point };
  }

  // currentPlanPrice provisions the Dodo Product for an international row; still missing here means
  // that provisioning failed — a server problem, not something to soften into a customer error.
  if (!planPrice.dodoProductId) {
    throw new Error(`PlanPrice ${planPrice.id} (${planPrice.plan}/${planPrice.market}) has no dodoProductId`);
  }

  const session = await createCheckoutSession({
    subscriptionId: subscription.id,
    email: user.email,
    productId: planPrice.dodoProductId,
    returnUrl: billingReturnUrl(),
    trialDays,
    extraSeats,
    extraSeatAddonId: planPrice.dodoExtraSeatAddonId,
    planPriceId: planPrice.id,
    // Read back in routes/webhooks.ts's payment.succeeded handler to set Tenant.plan for real
    // only once this checkout's payment is actually confirmed — see this function's top comment.
    // Always the first-subscribe case here: Dodo's "update payment method" branch above
    // (isUpdatingPaymentMethod) returns via the Customer Portal well before this point.
    plan: effectivePlan,
  });

  return { success: true, provider: 'dodopayments', initPoint: session.checkoutUrl };
}
