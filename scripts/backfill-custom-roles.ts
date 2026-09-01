import prisma from '../src/lib/prisma.js';
import { seedDefaultRolesForTenant } from '../src/modules/auth/roleService.js';
import type { Role, UserRole } from '@prisma/client';

// One-time backfill for the Custom Roles system (docs/tareas/backlog.md "Sistema de roles
// custom") — Fase A. Every tenant created going forward already gets its 3 seed roles at
// creation time (registerTenantWithOwner -> seedDefaultRolesForTenant); this only covers tenants/
// Users/Invitations that predate this feature. Idempotent: seedDefaultRolesForTenant no-ops for a
// tenant that already has roles, and the User/Invitation update loops below only touch rows where
// roleId is still null — safe to re-run.
function seedRoleForUserRole(seed: { owner: Role; admin: Role; member: Role }, userRole: UserRole): Role {
  return userRole === 'owner' ? seed.owner : userRole === 'admin' ? seed.admin : seed.member;
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  let tenantsSeeded = 0;
  let usersUpdated = 0;
  let invitationsUpdated = 0;

  for (const tenant of tenants) {
    const seed = await prisma.$transaction((tx) => seedDefaultRolesForTenant(tx, tenant.id));
    tenantsSeeded += 1;

    const users = await prisma.user.findMany({
      where: { tenantId: tenant.id, roleId: null },
      select: { id: true, role: true },
    });
    for (const user of users) {
      await prisma.user.update({
        where: { id: user.id },
        data: { roleId: seedRoleForUserRole(seed, user.role).id },
      });
      usersUpdated += 1;
    }

    const invitations = await prisma.invitation.findMany({
      where: { tenantId: tenant.id, roleId: null },
      select: { id: true, role: true },
    });
    for (const invitation of invitations) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { roleId: seedRoleForUserRole(seed, invitation.role).id },
      });
      invitationsUpdated += 1;
    }
  }

  console.log(
    `Seeded/confirmed roles for ${tenantsSeeded} tenant(s); backfilled roleId on ${usersUpdated} User row(s) and ${invitationsUpdated} Invitation row(s).`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
