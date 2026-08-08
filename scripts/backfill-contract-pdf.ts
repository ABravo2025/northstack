import prisma from '../src/lib/prisma.js';
import { renderContractPdf } from '../src/modules/hr/contractPdfService.js';

// One-time backfill: EmployeeCompensation.contractPdf only started being
// populated once contractPdfService.ts shipped (2026-08-08) — every row
// created before that (or during the dev-server EADDRINUSE hiccup that
// briefly served stale code that same day) has contractPdf: null. Generates
// the draft or signed PDF for each, exactly like createCompensation/
// confirmContract would have at the time — idempotent, skips any row that
// already has one.
async function main() {
  const rows = await prisma.employeeCompensation.findMany({
    where: { contractPdf: null },
    include: { employee: true, payFrequency: true, tenant: true },
  });

  let filled = 0;
  for (const row of rows) {
    const pdfBytes = await renderContractPdf({
      tenantName: row.tenant.name,
      employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
      nationality: row.employee.nationality,
      jobTitle: row.jobTitle,
      description: row.description,
      compensationType: row.compensationType,
      rateCents: row.rateCents,
      currency: row.currency,
      payFrequencyName: row.payFrequency.name,
      effectiveFrom: row.effectiveFrom,
      signed: Boolean(row.confirmedAt),
      confirmedAt: row.confirmedAt,
      confirmedIp: row.confirmedIp,
    });

    await prisma.employeeCompensation.update({
      where: { id: row.id },
      data: { contractPdf: Buffer.from(pdfBytes) },
    });
    filled += 1;
  }

  console.log(`Backfilled contractPdf for ${filled} EmployeeCompensation row(s).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
