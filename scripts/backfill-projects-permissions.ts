import prisma from '../src/lib/prisma.js';

// Projects module (2026-10-04) — ADMIN_SEED_PERMISSIONS now includes view_projects +
// manage_projects, but that only reaches tenants created from here on. This tops up every existing
// tenant's Admin role so Admins see the new module the same day it ships. Purely additive
// (`skipDuplicates: true`), same pattern as backfill-admin-view-dashboards.ts — safe to re-run, and
// safe against Admin roles a tenant already customized since it never removes anything. Member is
// deliberately left alone: members reach their own projects through membership, not a permission.
async function main() {
  const adminRoles = await prisma.role.findMany({ where: { name: 'Admin', isOwner: false } });

  let rowsAdded = 0;
  for (const role of adminRoles) {
    const result = await prisma.roleModulePermission.createMany({
      data: [
        { tenantId: role.tenantId, roleId: role.id, permission: 'view_projects' },
        { tenantId: role.tenantId, roleId: role.id, permission: 'manage_projects' },
      ],
      skipDuplicates: true,
    });
    rowsAdded += result.count;
  }

  console.log(`Added ${rowsAdded} project permission row(s) across ${adminRoles.length} Admin role(s) (existing rows skipped).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
