import prisma from '../src/lib/prisma.js';

// Pipeline.type was added with @default(lead), so every pre-existing row
// (across all tenants, both seeded "Clientes" pipelines and any tenant-created
// custom ones) landed on 'lead' regardless of its real intent. This fixes the
// one case we can infer with confidence: pipelines named exactly "Clientes"
// were seeded as the account-type pipeline (seedDefaultPipelines) — those
// flip to 'account'. Anything else (custom tenant-created pipelines) is left
// as 'lead', the safer default, rather than guessing at intent from a name.
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const candidates = await prisma.pipeline.findMany({
    where: { name: 'Clientes', type: 'lead' },
  });

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Found ${candidates.length} "Clientes" pipeline(s) still marked 'lead'.`);

  if (!DRY_RUN && candidates.length > 0) {
    await prisma.pipeline.updateMany({
      where: { id: { in: candidates.map((p) => p.id) } },
      data: { type: 'account' },
    });
  }

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Done.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
