import prisma from '../src/lib/prisma.js';

// One-time backfill: existing Session rows predate the expiresAt column.
// Seeds them with a future value (30 days from now, same duration new
// sessions get) instead of leaving them null, so tightening the column to
// NOT NULL doesn't fail and nobody gets logged out by this migration itself.
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

async function main() {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const result = await prisma.session.updateMany({
    where: { expiresAt: null },
    data: { expiresAt },
  });
  console.log(`Backfilled expiresAt for ${result.count} session(s).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
