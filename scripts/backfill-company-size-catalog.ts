import prisma from '../src/lib/prisma.js';

// One-time backfill: Company.size was free text; sizeId (FK to the shared
// FieldCatalogDefinition catalog, kind 'companySize') replaces it. Same
// pattern as scripts/backfill-department-catalog.ts — one catalog entry per
// distinct non-empty size string already in use per tenant, then link every
// matching company to it. Companies with no size are left with sizeId null
// rather than inventing a placeholder catalog entry.
async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, tenantId: true, size: true },
  });

  const byTenant = new Map<string, Set<string>>();
  for (const c of companies) {
    const name = (c.size ?? '').trim();
    if (!name) continue;
    if (!byTenant.has(c.tenantId)) byTenant.set(c.tenantId, new Set());
    byTenant.get(c.tenantId)!.add(name);
  }

  let catalogEntriesCreated = 0;
  let companiesLinked = 0;

  for (const [tenantId, names] of byTenant) {
    const nameToId = new Map<string, string>();
    let order = 0;
    for (const name of names) {
      const created = await prisma.fieldCatalogDefinition.create({
        data: { tenantId, kind: 'companySize', name, order: order++ },
      });
      nameToId.set(name, created.id);
      catalogEntriesCreated += 1;
    }

    for (const c of companies) {
      if (c.tenantId !== tenantId) continue;
      const name = (c.size ?? '').trim();
      if (!name) continue;
      await prisma.company.update({
        where: { id: c.id },
        data: { sizeId: nameToId.get(name) },
      });
      companiesLinked += 1;
    }
  }

  console.log(`Created ${catalogEntriesCreated} companySize catalog entries across ${byTenant.size} tenant(s).`);
  console.log(`Linked ${companiesLinked} company(ies) to their sizeId.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
