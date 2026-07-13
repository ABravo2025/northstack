import prisma from '../src/lib/prisma.js';

const EMPLOYEE_STATUSES = [
  { name: 'Active', order: 0, isDefault: true },
  { name: 'Inactive', order: 1, isDefault: false },
  { name: 'Pending', order: 2, isDefault: false },
];

const CLIENT_STATUSES = [
  { name: 'Prospect', order: 0, isDefault: true },
  { name: 'Active', order: 1, isDefault: false },
  { name: 'Inactive', order: 2, isDefault: false },
  { name: 'Archived', order: 3, isDefault: false },
];

const EMPLOYEE_ENUM_TO_NAME: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  pending: 'Pending',
};

const CLIENT_ENUM_TO_NAME: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  prospect: 'Prospect',
  inactive_archived: 'Archived',
};

async function main() {
  const tenants = await prisma.tenant.findMany();
  console.log(`Migrating statuses for ${tenants.length} tenant(s)...`);

  for (const tenant of tenants) {
    const existing = await prisma.statusDefinition.findFirst({ where: { tenantId: tenant.id } });
    if (existing) {
      console.log(`Tenant ${tenant.name}: already has status definitions, skipping seed.`);
      continue;
    }

    const employeeStatusMap = new Map<string, string>();
    for (const def of EMPLOYEE_STATUSES) {
      const created = await prisma.statusDefinition.create({
        data: { tenantId: tenant.id, entityType: 'employee', name: def.name, order: def.order, isDefault: def.isDefault },
      });
      employeeStatusMap.set(def.name, created.id);
    }

    const clientStatusMap = new Map<string, string>();
    for (const def of CLIENT_STATUSES) {
      const created = await prisma.statusDefinition.create({
        data: { tenantId: tenant.id, entityType: 'client', name: def.name, order: def.order, isDefault: def.isDefault },
      });
      clientStatusMap.set(def.name, created.id);
    }

    const employees = await prisma.employee.findMany({ where: { tenantId: tenant.id } });
    for (const emp of employees) {
      const name = EMPLOYEE_ENUM_TO_NAME[emp.status];
      const statusId = name ? employeeStatusMap.get(name) : undefined;
      if (statusId) {
        await prisma.employee.update({ where: { id: emp.id }, data: { statusId } });
      }
    }

    const clients = await prisma.client.findMany({ where: { tenantId: tenant.id } });
    for (const client of clients) {
      const name = CLIENT_ENUM_TO_NAME[client.status];
      const statusId = name ? clientStatusMap.get(name) : undefined;
      if (statusId) {
        await prisma.client.update({ where: { id: client.id }, data: { statusId } });
      }
    }

    console.log(
      `Tenant ${tenant.name}: seeded statuses, migrated ${employees.length} employee(s), ${clients.length} client(s)`,
    );
  }

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
