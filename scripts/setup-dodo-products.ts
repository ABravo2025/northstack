import prisma from '../src/lib/prisma.js';
import { createRecurringProduct } from '../src/lib/dodopayments.js';

// One-time provisioning (Billing Integration — Paddle→Dodo Payments migration, 2026-09-13): Dodo
// requires a pre-created catalog Product for any recurring subscription, unlike Paddle's inline
// non-catalog price. Every "international" PlanPrice row (Mercado Pago/"ar" rows never touch
// Dodo) that doesn't have a dodoProductId yet gets one created against its launchPriceCents —
// the only price actually charged today (regularPriceCents has no code path yet). Idempotent —
// skips any row that already has a dodoProductId, safe to re-run after a partial failure, and
// meant to be re-run whenever seed-plan-prices.ts (or a manual price change) inserts a new row.
async function main() {
  const rows = await prisma.planPrice.findMany({
    where: { market: 'international', dodoProductId: null },
  });

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.launchPriceCents <= 0) {
      skipped += 1;
      continue;
    }

    const productId = await createRecurringProduct({
      name: `Northstack — ${row.plan}`,
      priceCents: row.launchPriceCents,
    });

    await prisma.planPrice.update({ where: { id: row.id }, data: { dodoProductId: productId } });
    created += 1;
  }

  console.log(`Created ${created} Dodo product(s), skipped ${skipped} row(s) with no real price yet.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
