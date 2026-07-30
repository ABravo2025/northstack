import prisma from '../src/lib/prisma.js';

// One-time backfill: Note.header/body were renamed to title/description
// (2026-07-30, matching Task's title/description naming). Copies existing
// values over before the old columns get dropped.
async function main() {
  const notes = await prisma.note.findMany({
    where: { header: { not: null } },
    select: { id: true, header: true, body: true },
  });

  for (const note of notes) {
    await prisma.note.update({
      where: { id: note.id },
      data: { title: note.header, description: note.body },
    });
  }

  console.log(`Backfilled ${notes.length} note(s) from header/body to title/description.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
