import prisma from '../src/lib/prisma.js';

// One-time rename: the 5 default PayFrequencyDefinition rows seeded by
// seedDefaultPayFrequencies (src/modules/hr/payFrequencyService.ts) were
// originally Spanish; the platform's UI language is English, so this backfill
// renames only rows whose name exactly matches one of the old Spanish
// defaults, across every tenant. A tenant that already renamed/customized a
// row (Unidad 3's UI lets you edit the name) won't match any of these and is
// left untouched — this is a pure text rename, no ids/relations change.
const RENAMES: Record<string, string> = {
  Semanal: 'Weekly',
  'Semi-mensual · 1 y 15': 'Semi-monthly · 1st and 15th',
  'Semi-mensual · 15 y último día': 'Semi-monthly · 15th and last day',
  'Mensual · primer día hábil': 'Monthly · first business day',
  'Mensual · último día hábil': 'Monthly · last business day',
};

async function main() {
  let totalRenamed = 0;

  for (const [oldName, newName] of Object.entries(RENAMES)) {
    const result = await prisma.payFrequencyDefinition.updateMany({
      where: { name: oldName },
      data: { name: newName },
    });
    console.log(`"${oldName}" -> "${newName}": ${result.count} row(s)`);
    totalRenamed += result.count;
  }

  console.log(`Renamed ${totalRenamed} PayFrequencyDefinition row(s) total.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
