import prisma from '../src/lib/prisma.js';

// One-off (2026-09-14): the current "international" PlanPrice rows (1900/3900, inserted by
// update-plan-prices-2026-09.ts) already carry a SANDBOX dodoProductId — setup-dodo-products.ts
// only fills dodoProductId for rows where it's still null, so re-running it against live
// credentials would silently skip them. Insert a fresh row (same amounts, new effectiveFrom,
// dodoProductId left null) purely so the live provisioning run has a row to attach a real live
// Dodo Product to — checkoutService.ts already always takes the latest effectiveFrom row, so this
// becomes authoritative the moment it's provisioned, without touching the sandbox rows' history.
const ROWS: { plan: 'starter' | 'growth'; market: string; currency: string; launchPriceCents: number; regularPriceCents: number }[] = [
  { plan: 'starter', market: 'international', currency: 'USD', launchPriceCents: 1900, regularPriceCents: 1900 },
  { plan: 'growth', market: 'international', currency: 'USD', launchPriceCents: 3900, regularPriceCents: 3900 },
];

async function main() {
  for (const row of ROWS) {
    const created = await prisma.planPrice.create({ data: { ...row, effectiveFrom: new Date() } });
    console.log(`Inserted PlanPrice ${created.id}: ${created.plan}/${created.market} -> ${created.launchPriceCents} cents (dodoProductId still null)`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
