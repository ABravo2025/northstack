import prisma from '../src/lib/prisma.js';

// MCP / AI assistants (spec-mcp-server.md §2b) — `use_ai_assistants` is on by default for every
// role, but roles that existed before the permission did have no row for it. Grants it to every
// non-owner role in every tenant (the owner role bypasses permission rows entirely). Purely
// additive with skipDuplicates, same pattern as backfill-admin-view-dashboards.ts — safe to re-run.
async function main() {
  const roles = await prisma.role.findMany({ where: { isOwner: false }, select: { id: true, tenantId: true } });

  const result = await prisma.roleModulePermission.createMany({
    data: roles.map((role) => ({ tenantId: role.tenantId, roleId: role.id, permission: 'use_ai_assistants' })),
    skipDuplicates: true,
  });

  console.log(`Granted use_ai_assistants to ${result.count} role(s) out of ${roles.length} non-owner roles (the rest already had it).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
