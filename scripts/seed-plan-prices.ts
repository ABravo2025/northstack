import prisma from '../src/lib/prisma.js';
import type { PlanTier } from '@prisma/client';

// One-time seed of PlanPrice (Billing Integration, Unidad 5) — spec-billing-integration.md's
// price table. Not an upsert: a price change is meant to insert a new row with a later
// effectiveFrom rather than edit an existing one (see the model's comment in schema.prisma), so
// this only checks "does a row for this plan+market already exist at all" before creating the
// first one — safe to re-run without duplicating the initial rows, but won't overwrite a
// deliberate later price change either.
//
// The `ar` rows are placeholder (0 cents) until Alejandro defines real ARS pricing — per the
// spec, that blocks testing the Mercado Pago checkout end-to-end, not building the rest of it.
const SEED: { plan: PlanTier; market: string; currency: string; launchPriceCents: number; regularPriceCents: number }[] = [
  { plan: 'starter', market: 'international', currency: 'USD', launchPriceCents: 2900, regularPriceCents: 3900 },
  { plan: 'growth', market: 'international', currency: 'USD', launchPriceCents: 7900, regularPriceCents: 9900 },
  { plan: 'starter', market: 'ar', currency: 'ARS', launchPriceCents: 0, regularPriceCents: 0 },
  { plan: 'growth', market: 'ar', currency: 'ARS', launchPriceCents: 0, regularPriceCents: 0 },
];

async function main() {
  let created = 0;
  let skipped = 0;

  for (const row of SEED) {
    const existing = await prisma.planPrice.findFirst({ where: { plan: row.plan, market: row.market } });
    if (existing) {
      skipped += 1;
      continue;
    }

    await prisma.planPrice.create({ data: row });
    created += 1;
  }

  console.log(`Created ${created} PlanPrice row(s), skipped ${skipped} that already existed.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
