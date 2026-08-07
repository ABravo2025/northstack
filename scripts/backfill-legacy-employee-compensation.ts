import prisma from '../src/lib/prisma.js';

// One-time backfill (Payroll Unidad 4 prep): Employee.hourlyRateCents/
// monthlyRateCents/compensationType (Tier 2, predates Payroll) are being
// retired in favor of the versioned EmployeeCompensation model (Unidad 1).
// For every Employee that has any of the 3 old fields set, create one
// EmployeeCompensation carrying that data forward. Idempotent: skips any
// Employee that already has an EmployeeCompensation row.
//
// Deliberately does NOT null out or drop the old columns — this script only
// copies data forward. The old columns stay in place (unused by the app
// after this unit) until a separate, later, explicitly-approved destructive
// step, per the project's safe-migration pattern (additive -> backfill ->
// verify -> destructive).
//
// blocksParticipation is forced false and confirmedAt is set to "now" for
// every migrated row — unlike a brand new hire's first contract (which
// blocks Payroll participation until they confirm it, Unidad 9), a migrated
// record represents an *existing* compensation arrangement someone already
// had. Treating the migration itself as implicit confirmation avoids
// silently locking already-active people out of Payroll runs.
async function main() {
  const employees = await prisma.employee.findMany({
    where: {
      OR: [{ hourlyRateCents: { not: null } }, { monthlyRateCents: { not: null } }, { compensationType: { not: null } }],
    },
    include: { jobTitleDefn: true },
  });

  let migrated = 0;
  let skipped = 0;

  for (const employee of employees) {
    const alreadyMigrated = await prisma.employeeCompensation.findFirst({ where: { employeeId: employee.id } });
    if (alreadyMigrated) {
      skipped += 1;
      continue;
    }

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: employee.tenantId } });

    // compensationType was nullable even before this migration (a rate could
    // be entered without picking hourly/monthly) — when both rate fields are
    // present and compensationType is null, prefer monthly/fixed as the more
    // "complete" of the two ambiguous states.
    const resolvedType: 'hourly' | 'fixed' =
      employee.compensationType === 'hourly'
        ? 'hourly'
        : employee.compensationType === 'monthly'
          ? 'fixed'
          : employee.monthlyRateCents != null
            ? 'fixed'
            : 'hourly';
    const rateCents = resolvedType === 'fixed' ? employee.monthlyRateCents : employee.hourlyRateCents;
    if (rateCents == null) {
      // Shouldn't happen given the WHERE clause above, but guards against a
      // row with only compensationType set and both rate fields null.
      skipped += 1;
      continue;
    }

    const targetCadence = resolvedType === 'fixed' ? 'monthly' : 'weekly';
    const payFrequency =
      (await prisma.payFrequencyDefinition.findFirst({
        where: { tenantId: employee.tenantId, cadence: targetCadence, isActive: true },
        orderBy: { order: 'asc' },
      })) ?? (await prisma.payFrequencyDefinition.findFirst({ where: { tenantId: employee.tenantId }, orderBy: { order: 'asc' } }));
    if (!payFrequency) {
      console.warn(`Skipping ${employee.id}: tenant ${employee.tenantId} has no PayFrequencyDefinition at all.`);
      skipped += 1;
      continue;
    }

    const owner = await prisma.user.findFirst({ where: { tenantId: employee.tenantId, role: 'owner' } });
    if (!owner) {
      console.warn(`Skipping ${employee.id}: tenant ${employee.tenantId} has no owner user.`);
      skipped += 1;
      continue;
    }

    await prisma.employeeCompensation.create({
      data: {
        tenantId: employee.tenantId,
        employeeId: employee.id,
        compensationType: resolvedType,
        rateCents,
        currency: tenant.currency,
        payFrequencyId: payFrequency.id,
        jobTitle: employee.jobTitleDefn?.name ?? 'Not specified',
        description: 'Migrated automatically from legacy compensation fields (Payroll Unidad 4 prep).',
        effectiveFrom: employee.createdAt,
        effectiveTo: null,
        confirmedAt: new Date(),
        blocksParticipation: false,
        createdByUserId: owner.id,
      },
    });
    migrated += 1;
  }

  console.log(`Migrated ${migrated} Employee(s) to EmployeeCompensation, skipped ${skipped}.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
