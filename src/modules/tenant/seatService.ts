import prisma from '../../lib/prisma.js';
import { updateSubscriptionSeats } from '../../lib/dodopayments.js';
import { updatePreapproval } from '../../lib/mercadopago.js';
import { PRICING } from '../../config/pricing.js';
import { lockedPlanPrice, marketForProvider, mercadoPagoAmount } from './planPriceService.js';

// Seats pricing (2026-09-14, Alejandro's call) — flat per-seat overage on top of the base plan
// price, same number regardless of role (owner/admin/member) or plan tier. A "seat" is simply an
// active User account in the tenant — an Employee that was never invited to log in (no linked
// User row) never counts, matching the business rule "an Employee that only exists so Payroll can
// track them stays free/unlimited." Numbers live in src/config/pricing.ts; the per-seat PRICE is
// read from the subscription's PlanPrice row (planPriceService.ts), never from a constant here.
export const INCLUDED_SEATS = PRICING.includedSeats;

export async function countActiveSeats(tenantId: string): Promise<number> {
  return prisma.user.count({ where: { tenantId, status: 'active' } });
}

export function extraSeatsFor(plan: 'starter' | 'growth', activeSeats: number): number {
  return Math.max(0, activeSeats - INCLUDED_SEATS[plan]);
}

// A tenant that hasn't picked a plan yet (Tenant.plan === null, still on the unpaid Free Trial —
// see planService.ts/subscriptionService.ts's syncSubscriptionAndTenant for how `plan` only gets
// set for real once a checkout is confirmed) has no provider/card on file and so no way to be
// billed for extra seats — real-time overage billing (syncSeatBilling above) only applies once a
// plan is actually chosen. This is the only lever available before that: a hard cap, checked
// wherever a user could become the tenant's (FREE_TRIAL_SEAT_CAP + 1)th active seat. Returns an
// error message (never throws) to match this module family's `{ success, error }` convention.
export const FREE_TRIAL_SEAT_CAP = PRICING.freeTrialSeatCap;

export async function seatCapError(tenant: { id: string; plan: string | null }): Promise<string | null> {
  if (tenant.plan !== null) return null;
  const activeSeats = await countActiveSeats(tenant.id);
  if (activeSeats < FREE_TRIAL_SEAT_CAP) return null;
  return `Free Trial is limited to ${FREE_TRIAL_SEAT_CAP} users — choose a plan to add more.`;
}

// Called whenever the tenant's active-seat count could have changed (invite accepted, a user's
// status flips active/suspended) — real-time, not a periodic recount (Alejandro's call:
// prorated_immediately on Dodo bills/credits for the exact remaining days of the current cycle,
// so there's no reason to batch this into a cron). No-ops for a tenant that hasn't got a real
// paid subscription yet (still trialing with no provider attached) — startCheckout computes the
// starting seat count itself once a card is actually added, see its own comment.
//
// Also no-ops while `status === 'trialing'`, even once a card IS attached (2026-09-14, Alejandro's
// call): a card gets attached — and provider/externalSubscriptionId get set — at trial start via
// the $0 mandate-authorization payment, well before the base plan's own first real charge. Billing
// seat overage immediately at that point would charge a "still on the free trial" tenant real
// money, contradicting the Terms of Service/Refund Policy's "not charged until the trial ends."
// The overage isn't lost — it's just not billed yet: the webhook's real first-charge handler
// (routes/webhooks.ts, payment.succeeded's non-trial branch) calls this same function right after
// flipping status to 'active', which true-ups the addon quantity to whatever the tenant's actual
// seat count is by then, for the very first time it's actually allowed to bill anything.
export async function syncSeatBilling(tenantId: string): Promise<void> {
  const [tenant, subscription] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } }),
    prisma.subscription.findUnique({ where: { tenantId } }),
  ]);

  if (!tenant || (tenant.plan !== 'starter' && tenant.plan !== 'growth')) return;
  if (!subscription?.provider || !subscription.externalSubscriptionId) return;
  if (subscription.status === 'trialing') return;

  const activeSeats = await countActiveSeats(tenantId);
  const extraSeats = extraSeatsFor(tenant.plan, activeSeats);

  // The subscription's own locked row, not the latest price — seat changes must never reprice an
  // existing subscriber (until 2026-09-26 Mercado Pago recomputed from the latest row here).
  const market = marketForProvider(subscription.provider, null);
  const planPrice = await lockedPlanPrice({ ...subscription, plan: tenant.plan }, market);
  if (!planPrice) return;

  if (subscription.provider === 'dodopayments') {
    if (!planPrice.dodoProductId) return;
    await updateSubscriptionSeats(subscription.externalSubscriptionId, {
      productId: planPrice.dodoProductId,
      extraSeats,
      extraSeatAddonId: planPrice.dodoExtraSeatAddonId,
    });
    return;
  }

  // Mercado Pago has no addon/quantity primitive (see mercadopago.ts) — the seat surcharge is
  // just folded into the single recurring transaction_amount. Unlike Dodo's
  // prorated_immediately, this only changes the amount charged on the NEXT recurring payment —
  // Mercado Pago's API has no mechanism to credit/charge for the remainder of the current cycle,
  // so "proportional discount for unused days" genuinely doesn't apply on this provider. Accepted
  // limitation.
  await updatePreapproval(subscription.externalSubscriptionId, {
    transactionAmount: mercadoPagoAmount(planPrice, extraSeats),
  });
}
