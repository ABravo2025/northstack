import prisma from '../src/lib/prisma.js';

// Módulo de Tasks, item 6 (docs/tareas-desarrollo.md): every Opportunity with a
// nextStepDate/nextStepNote gets a matching Task, so "next step" data lives in
// the new generic mechanism going forward. The old columns are NOT dropped
// here — same "nullable first, backfill, verify, only then drop" pattern as
// every other real-data migration in this project (see Skills-Development.md).
//
// Idempotency: there's no migration-marker column on Task (adding one just for
// this script would be schema surface with no other use), so a rerun instead
// checks for an existing Task on the same Opportunity with the same title and
// dueDate and skips it — same "check before create" dedup already used by
// backfill-clients-to-companies-contacts.ts.
const DRY_RUN = process.argv.includes('--dry-run');

function expectedTitle(nextStepNote: string | null): string {
  return nextStepNote && nextStepNote.trim() !== '' ? nextStepNote.trim() : 'Próximo paso';
}

async function main() {
  const opportunities = await prisma.opportunity.findMany({
    where: {
      OR: [{ nextStepDate: { not: null } }, { nextStepNote: { not: null } }],
    },
    select: { id: true, tenantId: true, ownerId: true, nextStepDate: true, nextStepNote: true },
  });

  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}Found ${opportunities.length} Opportunity row(s) with a next step to migrate.`,
  );

  let created = 0;
  let skipped = 0;

  for (const opportunity of opportunities) {
    const title = expectedTitle(opportunity.nextStepNote);

    const existing = await prisma.task.findFirst({
      where: {
        tenantId: opportunity.tenantId,
        entityType: 'opportunity',
        entityId: opportunity.id,
        title,
      },
    });

    if (existing && existing.dueDate?.getTime() === (opportunity.nextStepDate?.getTime() ?? undefined)) {
      skipped++;
      continue;
    }

    if (!DRY_RUN) {
      await prisma.task.create({
        data: {
          tenantId: opportunity.tenantId,
          entityType: 'opportunity',
          entityId: opportunity.id,
          title,
          assigneeId: opportunity.ownerId,
          createdById: opportunity.ownerId,
          dueDate: opportunity.nextStepDate,
        },
      });
    }
    created++;
  }

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Done. ${created} Task(s) created, ${skipped} already migrated (skipped).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
