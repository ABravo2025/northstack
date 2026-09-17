import prisma from '../../lib/prisma.js';

// EmailVerification rows are deleted the moment a signup actually completes (see
// tenantService.ts's registerTenantWithOwner) -- so every row still here is, by construction, an
// abandoned signup: either the email was never verified (verifiedAt: null), or it was verified but
// the person never finished the registration form. There is no separate "in progress" state to
// filter out; the whole table already is that list.
export interface IncompleteSignup {
  id: string;
  email: string;
  createdAt: Date;
  verifiedAt: Date | null;
  expiresAt: Date;
}

export async function listIncompleteSignups(): Promise<IncompleteSignup[]> {
  return prisma.emailVerification.findMany({
    select: { id: true, email: true, createdAt: true, verifiedAt: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
  });
}
