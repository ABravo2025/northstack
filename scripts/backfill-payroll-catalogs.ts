import prisma from '../src/lib/prisma.js';
import { seedDefaultPayFrequencies } from '../src/modules/hr/payFrequencyService.js';
import { seedDefaultPaymentMethods } from '../src/modules/hr/paymentMethodService.js';

// One-time backfill: seedDefaultPayFrequencies/seedDefaultPaymentMethods
// (Payroll Unidad 2) only run at tenant-creation time. Every tenant that
// existed before this shipped has neither PayFrequencyDefinition nor
// PaymentMethodDefinition rows — idempotent per tenant (skips any tenant that
// already has at least one row of either), same pattern as
// backfill-department-catalog.ts.
async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  let seeded = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    const [existingFrequencies, existingMethods] = await Promise.all([
      prisma.payFrequencyDefinition.count({ where: { tenantId: tenant.id } }),
      prisma.paymentMethodDefinition.count({ where: { tenantId: tenant.id } }),
    ]);

    if (existingFrequencies > 0 || existingMethods > 0) {
      skipped += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await seedDefaultPayFrequencies(tx, tenant.id);
      await seedDefaultPaymentMethods(tx, tenant.id);
    });
    seeded += 1;
  }

  console.log(`Seeded Payroll catalogs for ${seeded} tenant(s), skipped ${skipped} that already had them.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
