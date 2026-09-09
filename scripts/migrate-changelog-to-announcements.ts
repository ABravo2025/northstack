import prisma from '../src/lib/prisma.js';
import { CHANGELOG_ENTRIES } from '../frontend/src/lib/changelog.js';

// One-time migration: the old hardcoded frontend changelog.ts (never updated for ~7 weeks
// despite everything shipped in that window — see docs/general/Tareas-QA.md QA-83) becomes
// PlatformAnnouncement rows, the source both the bell's "What's new" section and future
// scripts/publish-announcement.ts runs read from. Guarded by a count check (not upsert — no
// natural unique key on the migrated rows) since this only ever needs to run once.
async function main() {
  const alreadyMigrated = await prisma.platformAnnouncement.count({ where: { type: 'feature_update' } });
  if (alreadyMigrated > 0) {
    console.log(`Skipped — ${alreadyMigrated} feature_update announcements already exist.`);
    await prisma.$disconnect();
    return;
  }

  for (const entry of CHANGELOG_ENTRIES) {
    await prisma.platformAnnouncement.create({
      data: {
        type: 'feature_update',
        title: entry.title,
        summary: entry.description,
        body: entry.description,
        publishedAt: new Date(entry.date),
      },
    });
  }

  console.log(`Migrated ${CHANGELOG_ENTRIES.length} changelog entries to PlatformAnnouncement.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
