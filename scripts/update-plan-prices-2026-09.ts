import prisma from '../src/lib/prisma.js';
import type { PlanTier } from '@prisma/client';

// One-off price change (2026-09-14, business decision) — not an upsert on purpose: PlanPrice
// rows are a history, a price change means inserting a new row with a later effectiveFrom rather
// than editing the existing one in place (see the model's comment in schema.prisma and
// seed-plan-prices.ts's own header). checkoutService.ts/subscriptionSelfServeService.ts already
// pick the row with the latest effectiveFrom via findFirst+orderBy, so inserting is enough to
// make it the active price — nothing else needs to change to pick it up.
//
// regularPriceCents == launchPriceCents here (no more "regular vs. launch" distinction in the
// new pricing — PlansModal.tsx dropped the strikethrough). `ar` (Mercado Pago/Argentina) rows are
// untouched — real ARS pricing still isn't defined (unchanged from seed-plan-prices.ts's own
// placeholder note).
const NEW_PRICES: { plan: PlanTier; market: string; currency: string; launchPriceCents: number; regularPriceCents: number }[] = [
  { plan: 'starter', market: 'international', currency: 'USD', launchPriceCents: 1900, regularPriceCents: 1900 },
  { plan: 'growth', market: 'international', currency: 'USD', launchPriceCents: 3900, regularPriceCents: 3900 },
];

async function main() {
  for (const row of NEW_PRICES) {
    const created = await prisma.planPrice.create({ data: { ...row, effectiveFrom: new Date() } });
    console.log(`Inserted PlanPrice ${created.id}: ${created.plan}/${created.market} -> ${created.launchPriceCents} cents`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
