import prisma from '../src/lib/prisma.js';
import { getEmailDomain } from '../src/lib/email.js';

// One-time backfill for User.emailDomain (added to speed up
// checkEmailDomainNotAlreadyRegistered's duplicate-domain check, tenantService.ts — an
// indexed equality lookup instead of a full-table `endsWith` scan). Every User created going
// forward already sets this at create time (registerTenantWithOwner, registerUser,
// contractConfirmationService); this only covers rows that predate the column.
// Idempotent: only touches rows where emailDomain is still null.
async function main() {
  const users = await prisma.user.findMany({
    where: { emailDomain: null },
    select: { id: true, email: true },
  });

  let updated = 0;
  for (const user of users) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailDomain: getEmailDomain(user.email) },
    });
    updated += 1;
  }

  console.log(`Backfilled emailDomain for ${updated} User row(s).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
