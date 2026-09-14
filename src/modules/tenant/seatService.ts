import prisma from '../../lib/prisma.js';
import { updateSubscriptionSeats } from '../../lib/dodopayments.js';
import { updatePreapproval } from '../../lib/mercadopago.js';

// Seats pricing (2026-09-14, Alejandro's call) — flat per-seat overage on top of the base plan
// price, same number regardless of role (owner/admin/member) or plan tier. A "seat" is simply an
// active User account in the tenant — an Employee that was never invited to log in (no linked
// User row) never counts, matching the business rule "an Employee that only exists so Payroll can
// track them stays free/unlimited."
export const INCLUDED_SEATS: Record<'starter' | 'growth', number> = {
  starter: 5,
  growth: 10,
};

export const EXTRA_SEAT_PRICE_CENTS = 400; // $4/mo

export async function countActiveSeats(tenantId: string): Promise<number> {
  return prisma.user.count({ where: { tenantId, status: 'active' } });
}

export function extraSeatsFor(plan: 'starter' | 'growth', activeSeats: number): number {
  return Math.max(0, activeSeats - INCLUDED_SEATS[plan]);
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

  const market = subscription.provider === 'mercadopago' ? 'ar' : 'international';
  const planPrice = await prisma.planPrice.findFirst({
    where: { plan: tenant.plan, market },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!planPrice || planPrice.launchPriceCents <= 0) return;

  if (subscription.provider === 'dodopayments') {
    if (!planPrice.dodoProductId) return;
    await updateSubscriptionSeats(subscription.externalSubscriptionId, {
      productId: planPrice.dodoProductId,
      extraSeats,
    });
    return;
  }

  // Mercado Pago has no addon/quantity primitive (see mercadopago.ts) — the seat surcharge is
  // just folded into the single recurring transaction_amount. Unlike Dodo's
  // prorated_immediately, this only changes the amount charged on the NEXT recurring payment —
  // Mercado Pago's API has no mechanism to credit/charge for the remainder of the current cycle,
  // so "proportional discount for unused days" genuinely doesn't apply on this provider. Accepted
  // limitation (AR market pricing is still a $0 placeholder anyway, see PlanPrice's ar rows).
  await updatePreapproval(subscription.externalSubscriptionId, {
    transactionAmount: (planPrice.launchPriceCents + extraSeats * EXTRA_SEAT_PRICE_CENTS) / 100,
  });
}
