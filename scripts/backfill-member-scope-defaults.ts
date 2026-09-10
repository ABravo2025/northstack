import prisma from '../src/lib/prisma.js';

// "Protect internal company data" rework (see MEMBER_SEED_PERMISSIONS's comment in
// roleService.ts) — Member's default permission set changed from seeing everything (all CRM, all
// Employees tenant-wide) to seeing only their own info (+ their own reports, if they manage
// anyone). Alejandro confirmed this should be backfilled to every existing production tenant, not
// just newly-created ones — but ONLY for tenants whose Member role is still exactly the pristine
// seed no one has touched. A tenant that already customized Member via Settings -> Roles &
// Permissions gets left alone and reported for manual review instead of being silently overwritten
// — this script removes permissions (view_company/view_contact/the old scope key), unlike
// backfill-fase-b-permissions.ts's purely-additive top-up, so a blind run here could genuinely
// take away access a tenant deliberately configured.
//
// Usage: tsx scripts/backfill-member-scope-defaults.ts [--dry-run]
// Always run with --dry-run first and read the report (especially "diverged" and "no Member
// role") before running for real — those tenants are not touched by this script at all.

// The literal MEMBER_SEED_PERMISSIONS value as it existed immediately before this rework —
// hardcoded rather than imported, because by the time this script runs the live constant in
// roleService.ts already reflects the NEW default, and this script needs the OLD one to detect
// which tenants are still on it untouched.
const OLD_MEMBER_SEED_PERMISSIONS = [
  'view_hr',
  'view_employee',
  'view_company',
  'view_contact',
  'view_employee_custom_fields',
  'view_employee_scope:all',
];

const PERMISSIONS_TO_REMOVE = ['view_company', 'view_contact', 'view_employee_scope:all'];
const PERMISSION_TO_ADD = 'view_employee_scope:reports';

interface DivergedReport {
  tenantId: string;
  roleId: string;
  added: string[];
  missing: string[];
}

function isPristine(currentPermissions: string[]): boolean {
  const current = new Set(currentPermissions);
  return current.size === OLD_MEMBER_SEED_PERMISSIONS.length && OLD_MEMBER_SEED_PERMISSIONS.every((p) => current.has(p));
}

function diffAgainstOldSeed(currentPermissions: string[]): { added: string[]; missing: string[] } {
  const current = new Set(currentPermissions);
  const old = new Set(OLD_MEMBER_SEED_PERMISSIONS);
  return {
    added: currentPermissions.filter((p) => !old.has(p)),
    missing: OLD_MEMBER_SEED_PERMISSIONS.filter((p) => !current.has(p)),
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });

  let migrated = 0;
  const noMemberRole: string[] = [];
  const diverged: DivergedReport[] = [];

  for (const tenant of tenants) {
    const memberRole = await prisma.role.findUnique({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Member' } },
      include: { modulePermissions: true },
    });

    if (!memberRole) {
      // Either renamed away from "Member" (Fase B2 allows renaming) or never seeded — either way,
      // matching by name only, deliberately, rather than guessing by permission-set similarity
      // across all non-owner roles (a much riskier heuristic). Flagged for manual review.
      noMemberRole.push(`${tenant.id} (${tenant.name})`);
      continue;
    }

    const currentPermissions = memberRole.modulePermissions.map((p) => p.permission);
    if (!isPristine(currentPermissions)) {
      const { added, missing } = diffAgainstOldSeed(currentPermissions);
      diverged.push({ tenantId: `${tenant.id} (${tenant.name})`, roleId: memberRole.id, added, missing });
      continue;
    }

    if (!dryRun) {
      await prisma.roleModulePermission.deleteMany({
        where: { roleId: memberRole.id, permission: { in: PERMISSIONS_TO_REMOVE } },
      });
      await prisma.roleModulePermission.createMany({
        data: [{ tenantId: tenant.id, roleId: memberRole.id, permission: PERMISSION_TO_ADD }],
        skipDuplicates: true,
      });
    }
    migrated += 1;
  }

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Checked ${tenants.length} tenant(s).`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  No Member role (renamed/missing — manual review): ${noMemberRole.length}`);
  console.log(`  Diverged from pristine seed (manual review): ${diverged.length}`);

  if (noMemberRole.length > 0) {
    console.log('\n--- No Member role ---');
    for (const line of noMemberRole) console.log(`  ${line}`);
  }

  if (diverged.length > 0) {
    console.log('\n--- Diverged from pristine seed ---');
    for (const d of diverged) {
      console.log(`  ${d.tenantId} (role ${d.roleId})`);
      if (d.added.length > 0) console.log(`    + extra permissions: ${d.added.join(', ')}`);
      if (d.missing.length > 0) console.log(`    - missing from original seed: ${d.missing.join(', ')}`);
    }
  }

  if (dryRun) {
    console.log('\nDry run only — no changes written. Re-run without --dry-run to apply.');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
