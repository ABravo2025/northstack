import prisma from '../src/lib/prisma.js';

// Timesheets (spec-shifts.md Unidad 9) — ADMIN_SEED_PERMISSIONS now includes approve_timesheets,
// but that only reaches tenants created from here on. This tops up every existing tenant's Admin
// role, same as backfill-shifts-permissions.ts: purely additive (`skipDuplicates: true`), safe to
// re-run, never removes anything. Member is left alone: everyone fills their own timesheet, and a
// direct manager approves their reports' weeks without the permission.
async function main() {
  const adminRoles = await prisma.role.findMany({ where: { name: 'Admin', isOwner: false } });

  let rowsAdded = 0;
  for (const role of adminRoles) {
    const result = await prisma.roleModulePermission.createMany({
      data: [{ tenantId: role.tenantId, roleId: role.id, permission: 'approve_timesheets' }],
      skipDuplicates: true,
    });
    rowsAdded += result.count;
  }

  console.log(`Added ${rowsAdded} approve_timesheets row(s) across ${adminRoles.length} Admin role(s) (existing rows skipped).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
