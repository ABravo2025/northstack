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
// Amounts are in minor units (cents / centavos) of the market's own currency. A plan price of 0
// means "not sold in this market yet" — checkout refuses it rather than charging nothing.
export const PRICING = {
  markets: {
    // Dodo Payments — every tenant outside Argentina.
    international: {
      currency: 'USD',
      plans: { starter: 1900, growth: 3900 },
      extraSeat: 400,
    },
    // Mercado Pago — tenants whose country is Argentina. Pending real ARS pricing.
    ar: {
      currency: 'ARS',
      plans: { starter: 0, growth: 0 },
      extraSeat: 0,
    },
  },
  // Active users included in each plan before the extra-seat price applies (same in every market).
  includedSeats: { starter: 5, growth: 10 },
  // Hard cap while a tenant is on the Free Trial with no plan chosen yet (nothing to bill extra
  // seats against).
  freeTrialSeatCap: 5,
} as const;

export type Market = keyof typeof PRICING.markets;
export type PricedPlan = keyof typeof PRICING.includedSeats;
