import prisma from '../src/lib/prisma.js';
import { seedSystemTemplates } from '../src/modules/projects/projectTemplateService.js';

// Projects module (2026-10-04) — loads/refreshes the system templates (src/modules/projects/
// systemTemplates.ts) into whatever DATABASE_URL points at. Idempotent: safe to re-run after
// editing the content; projects already created from a template are never touched.
async function main() {
  const { upserted } = await seedSystemTemplates();
  console.log(`System project templates upserted: ${upserted} (templates x locales).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
