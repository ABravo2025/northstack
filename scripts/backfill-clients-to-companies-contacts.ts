import prisma from '../src/lib/prisma.js';

const DRY_RUN = process.argv.includes('--dry-run');

// Client.status values (see statusService.ts's Client DEFAULT_STATUSES) map onto
// Company's Prospect/Customer/Churned lifecycle. Active clients were presumably
// paying/engaged -> Customer. Inactive and Archived both read as "no longer
// engaged" -> Churned. Confirmed with the user, not inferred.
const STATUS_MAP: Record<string, 'Prospect' | 'Customer' | 'Churned'> = {
  Prospect: 'Prospect',
  Active: 'Customer',
  Inactive: 'Churned',
  Archived: 'Churned',
};

// When several Client rows share the same company name, the resulting Company
// gets whichever mapped status is "most advanced."
const STATUS_PRECEDENCE: Record<'Prospect' | 'Customer' | 'Churned', number> = {
  Customer: 2,
  Prospect: 1,
  Churned: 0,
};

function normalizeCompanyName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

// `seedDefaultStatusDefinitions` (statusService.ts) only runs at tenant creation
// time. Every tenant that existed before the Company/Contact/Opportunity schema
// shipped has no entityType:'company' StatusDefinition rows at all, which blocks
// Company creation entirely (not just this backfill) -- fix that first, for every
// tenant, independent of whether they have legacy Client rows to migrate.
const DEFAULT_COMPANY_STATUSES = [
  { name: 'Prospect', order: 0, isDefault: true },
  { name: 'Customer', order: 1, isDefault: false },
  { name: 'Churned', order: 2, isDefault: false },
];

async function ensureCompanyStatusDefinitions(tenantId: string, tenantName: string): Promise<Map<string, string>> {
  const existing = await prisma.statusDefinition.findMany({
    where: { tenantId, entityType: 'company' },
  });
  if (existing.length > 0) {
    return new Map(existing.map((s) => [s.name, s.id]));
  }

  console.log(`  Tenant ${tenantName}: no 'company' StatusDefinition rows yet, seeding Prospect/Customer/Churned`);
  if (DRY_RUN) {
    return new Map(DEFAULT_COMPANY_STATUSES.map((s) => [s.name, `(dry-run-placeholder:${s.name})`]));
  }
  const created = await Promise.all(
    DEFAULT_COMPANY_STATUSES.map((def) =>
      prisma.statusDefinition.create({
        data: { tenantId, entityType: 'company', name: def.name, order: def.order, isDefault: def.isDefault },
      }),
    ),
  );
  return new Map(created.map((s) => [s.name, s.id]));
}

async function main() {
  const tenants = await prisma.tenant.findMany();
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Backfilling Client -> Company/Contact for ${tenants.length} tenant(s)...`);

  let totalCompaniesCreated = 0;
  let totalCompaniesReused = 0;
  let totalContactsCreated = 0;
  let totalContactsSkipped = 0;

  for (const tenant of tenants) {
    const companyStatusIdByName = await ensureCompanyStatusDefinitions(tenant.id, tenant.name);

    const clients = await prisma.client.findMany({
      where: { tenantId: tenant.id },
      include: { statusDefn: true },
    });
    if (clients.length === 0) continue;

    // Group clients by normalized company name, tracking the "most advanced"
    // mapped status per group and the first-seen original casing for the name.
    const groups = new Map<
      string,
      { originalName: string; clients: typeof clients; status: 'Prospect' | 'Customer' | 'Churned' }
    >();
    for (const client of clients) {
      const key = normalizeCompanyName(client.company);
      const mappedStatus = STATUS_MAP[client.statusDefn.name] ?? 'Prospect';
      const group = groups.get(key);
      if (!group) {
        groups.set(key, { originalName: client.company.trim(), clients: [client], status: mappedStatus });
      } else {
        group.clients.push(client);
        if (STATUS_PRECEDENCE[mappedStatus] > STATUS_PRECEDENCE[group.status]) {
          group.status = mappedStatus;
        }
      }
    }

    let tenantCompaniesCreated = 0;
    let tenantCompaniesReused = 0;
    let tenantContactsCreated = 0;
    let tenantContactsSkipped = 0;

    for (const group of groups.values()) {
      let companyId: string;
      const existingCompany = await prisma.company.findFirst({
        where: { tenantId: tenant.id, name: { equals: group.originalName, mode: 'insensitive' } },
      });

      if (existingCompany) {
        companyId = existingCompany.id;
        tenantCompaniesReused++;
      } else {
        const statusId = companyStatusIdByName.get(group.status);
        if (!statusId) {
          console.warn(
            `  Tenant ${tenant.name}: no "${group.status}" StatusDefinition for entityType 'company' — skipping company "${group.originalName}" (${group.clients.length} client(s))`,
          );
          continue;
        }
        if (DRY_RUN) {
          companyId = '(dry-run-placeholder)';
        } else {
          const created = await prisma.company.create({
            data: { tenantId: tenant.id, name: group.originalName, statusId },
          });
          companyId = created.id;
        }
        tenantCompaniesCreated++;
      }

      for (const client of group.clients) {
        const existingContact = await prisma.contact.findUnique({
          where: { tenantId_email: { tenantId: tenant.id, email: client.email } },
        });
        if (existingContact) {
          tenantContactsSkipped++;
          continue;
        }

        if (!DRY_RUN) {
          await prisma.contact.create({
            data: {
              tenantId: tenant.id,
              firstName: client.firstName,
              lastName: client.lastName,
              email: client.email,
              companyId: companyId === '(dry-run-placeholder)' ? null : companyId,
              isPrimary: false,
              createdAt: client.createdAt,
            },
          });
        }
        tenantContactsCreated++;
      }
    }

    console.log(
      `  Tenant ${tenant.name}: ${clients.length} client(s) -> ${tenantCompaniesCreated} compan${tenantCompaniesCreated === 1 ? 'y' : 'ies'} created, ${tenantCompaniesReused} reused; ${tenantContactsCreated} contact(s) created, ${tenantContactsSkipped} skipped (already migrated)`,
    );

    totalCompaniesCreated += tenantCompaniesCreated;
    totalCompaniesReused += tenantCompaniesReused;
    totalContactsCreated += tenantContactsCreated;
    totalContactsSkipped += tenantContactsSkipped;
  }

  console.log(
    `${DRY_RUN ? '[DRY RUN] ' : ''}Done. Companies: ${totalCompaniesCreated} created, ${totalCompaniesReused} reused. Contacts: ${totalContactsCreated} created, ${totalContactsSkipped} skipped.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
