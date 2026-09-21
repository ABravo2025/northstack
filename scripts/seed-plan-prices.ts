import prisma from '../src/lib/prisma.js';
import { CURRENT_PLAN_PRICES_CENTS } from '../src/modules/tenant/planService.js';
import type { PlanTier } from '@prisma/client';

// Keeps the PlanPrice catalog (Billing Integration, Unidad 5) in step with
// CURRENT_PLAN_PRICES_CENTS — the single place a USD plan price is defined (planService.ts). Run
// it against an environment after editing that constant (or to seed a brand-new environment) and
// it does the right thing without anyone retyping an amount:
//   - A price change is meant to INSERT a new row with a later effectiveFrom rather than edit an
//     existing one (see the model's comment in schema.prisma), so history is kept and
//     checkoutService.ts's "latest effectiveFrom wins" lookup picks the new price up. For the
//     international rows a new row is inserted only when none exists yet or the latest one no
//     longer matches the constant — safe to re-run, no duplicates.
//   - The `ar` rows are placeholder (0 cents) until Alejandro defines real ARS pricing — per the
//     spec, that blocks testing the Mercado Pago checkout end-to-end, not building the rest of
//     it. They're only ever created once and never compared, so a deliberate later ARS price
//     isn't clobbered by a re-run.
//
// A newly inserted international row has no dodoProductId yet, and checkout throws without one —
// run scripts/setup-dodo-products.ts right after (it only fills rows where dodoProductId is null;
// against live credentials that's the step that creates the real Dodo Product at the new price).
// Existing subscribers keep whatever they locked in (Subscription.lockedPriceCents) — this only
// changes what NEW checkouts and plan changes charge.
//
// No separate "regular" price anymore (2026-09-14) — regularPriceCents mirrors the launch price,
// kept only because the column is still in the schema.
const SEED: { plan: PlanTier; market: string; currency: string; launchPriceCents: number; regularPriceCents: number }[] = [
  {
    plan: 'starter',
    market: 'international',
    currency: 'USD',
    launchPriceCents: CURRENT_PLAN_PRICES_CENTS.starter,
    regularPriceCents: CURRENT_PLAN_PRICES_CENTS.starter,
  },
  {
    plan: 'growth',
    market: 'international',
    currency: 'USD',
    launchPriceCents: CURRENT_PLAN_PRICES_CENTS.growth,
    regularPriceCents: CURRENT_PLAN_PRICES_CENTS.growth,
  },
  { plan: 'starter', market: 'ar', currency: 'ARS', launchPriceCents: 0, regularPriceCents: 0 },
  { plan: 'growth', market: 'ar', currency: 'ARS', launchPriceCents: 0, regularPriceCents: 0 },
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const row of SEED) {
    const latest = await prisma.planPrice.findFirst({
      where: { plan: row.plan, market: row.market },
      orderBy: { effectiveFrom: 'desc' },
    });
    const upToDate = latest && (row.market !== 'international' || latest.launchPriceCents === row.launchPriceCents);
    if (upToDate) {
      skipped += 1;
      continue;
    }

    await prisma.planPrice.create({ data: row });
    created += 1;
  }

  console.log(`Created ${created} PlanPrice row(s), skipped ${skipped} already up to date.`);
  if (created > 0) {
    console.log('Next: run scripts/setup-dodo-products.ts so new international rows get a dodoProductId.');
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
