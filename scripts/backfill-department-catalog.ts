import prisma from '../src/lib/prisma.js';

// One-time backfill: Employee.department was free text; departmentId (FK to the
// new FieldCatalogDefinition catalog) replaces it. For each tenant, create one
// catalog entry per distinct non-empty department string already in use, then
// point every matching employee at it. Employees with an empty department
// (possible via a Public Form that didn't include that field) are left with
// departmentId null rather than inventing a placeholder catalog entry.
async function main() {
  const employees = await prisma.employee.findMany({
    select: { id: true, tenantId: true, department: true },
  });

  const byTenant = new Map<string, Set<string>>();
  for (const e of employees) {
    const name = e.department.trim();
    if (!name) continue;
    if (!byTenant.has(e.tenantId)) byTenant.set(e.tenantId, new Set());
    byTenant.get(e.tenantId)!.add(name);
  }

  let catalogEntriesCreated = 0;
  let employeesLinked = 0;

  for (const [tenantId, names] of byTenant) {
    const nameToId = new Map<string, string>();
    let order = 0;
    for (const name of names) {
      const created = await prisma.fieldCatalogDefinition.create({
        data: { tenantId, kind: 'department', name, order: order++ },
      });
      nameToId.set(name, created.id);
      catalogEntriesCreated += 1;
    }

    for (const e of employees) {
      if (e.tenantId !== tenantId) continue;
      const name = e.department.trim();
      if (!name) continue;
      await prisma.employee.update({
        where: { id: e.id },
        data: { departmentId: nameToId.get(name) },
      });
      employeesLinked += 1;
    }
  }

  console.log(`Created ${catalogEntriesCreated} department catalog entries across ${byTenant.size} tenant(s).`);
  console.log(`Linked ${employeesLinked} employee(s) to their departmentId.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
