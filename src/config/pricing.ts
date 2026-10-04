// THE single place every Northstack price and seat number is defined (Alejandro, 2026-09-26: "todos
// los precios tienen que ser una variable ... nada de hardcode"). Everything else reads from here:
//   - checkout / change-plan / seat billing, through planPriceService.ts, which turns a change in
//     this file into a new PlanPrice row (and, for `international`, the matching Dodo Product and
//     extra-seat Addon) the first time a price is needed after deploy — no script to run by hand;
//   - the app UI (PlansModal, BillingPage, /guide, /help) and the landing, through the public
//     GET /api/plans/prices.
//
// To change a price: edit the number here, push (staging first, then main). New checkouts and plan
// changes pick it up; tenants already subscribed keep the price they signed up at (their
// Subscription stays on the PlanPrice row it was confirmed with — Alejandro's call, 2026-09-26).
//
// PER-USER PRICING (2026-10-02, Alejandro): one price per active user per month, minimum
// MIN_USERS per team. Launch prices apply to teams that subscribe up to LAUNCH_ENDS_AT (inclusive,
// end of that day UTC) and stay locked for them; after that date new teams get the regular price —
// automatically, the sync below starts producing regular-priced PlanPrice rows.
//
// Billing still speaks "base + included seats + extra seat" (what Dodo and Mercado Pago are wired
// for), so per-user is expressed as: base = perUser × MIN_USERS covering MIN_USERS included seats,
// and every user beyond that at perUser. Identical totals, no change to how charges are built.
//
// Amounts are in minor units (cents / centavos) of the market's own currency. A price of 0 means
// "not sold in this market yet" — checkout refuses it rather than charging nothing.

export const MIN_USERS = 3;
export const LAUNCH_ENDS_AT = '2026-12-31';

// Per user per month. ARS at the same ratio as the previous ARS prices (US$1 ≈ ARS 1.500).
export const PER_USER = {
  international: { currency: 'USD', launch: { starter: 400, growth: 600 }, regular: { starter: 600, growth: 1000 } },
  ar: { currency: 'ARS', launch: { starter: 600_000, growth: 900_000 }, regular: { starter: 900_000, growth: 1_500_000 } },
} as const;

// Modules sold on top of a plan (2026-10-02: structure ready, nothing sold yet). Each entry:
//   { perUser: boolean (true → × active users, false → flat per company),
//     prices: { international: cents, ar: centavos }, includedIn: PricedPlan[] }
export const ADDONS: Record<string, { perUser: boolean; prices: Record<'international' | 'ar', number>; includedIn: readonly ('starter' | 'growth')[] }> = {};

// Referral program (2026-10-04, Alejandro). A member earns commissionPercent of each of the
// referred company's first commissionPayments payments; each one becomes payable holdDays after
// the payment, and staff transfer once a member's payable total in one currency reaches
// minPayoutCents (no conversion between currencies). The referred company's trial is trialDays.
// termsVersion is what members accept — bump it when the program terms change.
export const REFERRAL = {
  commissionPercent: 10,
  commissionPayments: 3,
  holdDays: 30,
  minPayoutCents: { USD: 5_000, ARS: 5_000_000 } as Record<string, number>,
  trialDays: 30,
  termsVersion: '1.0',
} as const;

export type Market = keyof typeof PER_USER;
export type PricedPlan = 'starter' | 'growth';

export function isLaunchPeriod(now: Date = new Date()): boolean {
  return now.getTime() <= Date.parse(`${LAUNCH_ENDS_AT}T23:59:59.999Z`);
}

// Per-user price a NEW subscription gets right now.
export function perUserPrice(market: Market, plan: PricedPlan, now: Date = new Date()): number {
  const m = PER_USER[market];
  return isLaunchPeriod(now) ? m.launch[plan] : m.regular[plan];
}

// The billing view of the current prices (what planPriceService syncs into PlanPrice rows).
export function billingMarkets(now: Date = new Date()) {
  const build = (market: Market) => ({
    currency: PER_USER[market].currency,
    plans: { starter: perUserPrice(market, 'starter', now) * MIN_USERS, growth: perUserPrice(market, 'growth', now) * MIN_USERS },
    extraSeat: { starter: perUserPrice(market, 'starter', now), growth: perUserPrice(market, 'growth', now) },
  });
  return { international: build('international'), ar: build('ar') };
}

export const PRICING = {
  // Snapshot at load — display/compat only. Billing always calls billingMarkets() so the switch to
  // regular prices after LAUNCH_ENDS_AT doesn't wait for a cold start.
  get markets() {
    return billingMarkets();
  },
  // Active users covered by the base price (= the minimum team size) in each plan.
  includedSeats: { starter: MIN_USERS, growth: MIN_USERS } as Record<PricedPlan, number>,
  // Hard cap while a tenant is on the Free Trial with no plan chosen yet (nothing to bill extra
  // seats against).
  freeTrialSeatCap: 3, // = MIN_USERS (Alejandro, 2026-10-03)
};
