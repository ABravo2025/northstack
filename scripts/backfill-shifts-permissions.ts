import prisma from '../src/lib/prisma.js';

// Shifts module (2026-10-04, spec-shifts.md §2) — ADMIN_SEED_PERMISSIONS now includes view_shifts +
// manage_shifts, but that only reaches tenants created from here on. This tops up every existing
// tenant's Admin role so Admins see the new module the same day it ships. Purely additive
// (`skipDuplicates: true`), same pattern as backfill-projects-permissions.ts — safe to re-run, and
// safe against Admin roles a tenant already customized since it never removes anything. Member is
// deliberately left alone: members see and answer their own shifts without a permission.
async function main() {
  const adminRoles = await prisma.role.findMany({ where: { name: 'Admin', isOwner: false } });

  let rowsAdded = 0;
  for (const role of adminRoles) {
    const result = await prisma.roleModulePermission.createMany({
      data: [
        { tenantId: role.tenantId, roleId: role.id, permission: 'view_shifts' },
        { tenantId: role.tenantId, roleId: role.id, permission: 'manage_shifts' },
      ],
      skipDuplicates: true,
    });
    rowsAdded += result.count;
  }

  console.log(`Added ${rowsAdded} shift permission row(s) across ${adminRoles.length} Admin role(s) (existing rows skipped).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
