import prisma from '../src/lib/prisma.js';

// "Protect internal company data" rework (see MEMBER_SEED_PERMISSIONS's comment in
// roleService.ts) — Admin now needs `view_dashboards` to keep seeing the company-wide
// `/dashboards/*` KPI pages it already had unrestricted access to before this permission existed.
// Purely additive: grants `view_dashboards` to every tenant's Admin role, `skipDuplicates: true`,
// same pattern as backfill-fase-b-permissions.ts. Safe to run unconditionally, even against
// tenants that already customized their Admin role's permissions — it never removes anything, so
// there's no "pristine vs. diverged" distinction to make here (contrast with the Member scope
// backfill, which does remove permissions and needs that check).
async function main() {
  const adminRoles = await prisma.role.findMany({ where: { name: 'Admin', isOwner: false } });

  let rowsAdded = 0;
  for (const role of adminRoles) {
    const result = await prisma.roleModulePermission.createMany({
      data: [{ tenantId: role.tenantId, roleId: role.id, permission: 'view_dashboards' }],
      skipDuplicates: true,
    });
    rowsAdded += result.count;
  }

  console.log(`Granted view_dashboards to ${rowsAdded} Admin role(s) out of ${adminRoles.length} checked (skipped ones already had it).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
