import prisma from '../src/lib/prisma.js';
import { ADMIN_SEED_PERMISSIONS, MEMBER_SEED_PERMISSIONS } from '../src/modules/auth/roleService.js';

// One-time top-up for the 184 tenants (and any created between Fase A and Fase B) whose Admin/
// Member roles were seeded by Fase A's seedDefaultRolesForTenant BEFORE the entity-split
// permissions (view_employee/manage_employee/view_company/...) and the 3 new named permissions
// (manage_tenant_settings/manage_shared_views/decide_time_off) existed. Grants whatever's in
// ADMIN_SEED_PERMISSIONS/MEMBER_SEED_PERMISSIONS that a role doesn't already have —
// `skipDuplicates` makes this safe to re-run, and safe to run even for roles a tenant has already
// started customizing (it only ever ADDS permissions matching today's real behavior, never
// removes a role's existing grants).
async function main() {
  const adminRoles = await prisma.role.findMany({ where: { name: 'Admin', isOwner: false } });
  const memberRoles = await prisma.role.findMany({ where: { name: 'Member', isOwner: false } });

  let adminRowsAdded = 0;
  for (const role of adminRoles) {
    const result = await prisma.roleModulePermission.createMany({
      data: ADMIN_SEED_PERMISSIONS.map((permission) => ({ tenantId: role.tenantId, roleId: role.id, permission })),
      skipDuplicates: true,
    });
    adminRowsAdded += result.count;
  }

  let memberRowsAdded = 0;
  for (const role of memberRoles) {
    const result = await prisma.roleModulePermission.createMany({
      data: MEMBER_SEED_PERMISSIONS.map((permission) => ({ tenantId: role.tenantId, roleId: role.id, permission })),
      skipDuplicates: true,
    });
    memberRowsAdded += result.count;
  }

  console.log(
    `Topped up ${adminRoles.length} Admin role(s) (+${adminRowsAdded} permission rows) and ${memberRoles.length} Member role(s) (+${memberRowsAdded} permission rows).`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
