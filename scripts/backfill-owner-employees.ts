import prisma from '../src/lib/prisma.js';

async function main() {
  const owners = await prisma.user.findMany({ where: { role: 'owner' } });
  console.log(`Checking ${owners.length} owner(s)...`);

  let created = 0;
  let linked = 0;
  let skipped = 0;

  for (const owner of owners) {
    if (!owner.tenantId) {
      console.log(`Owner ${owner.email}: no tenant, skipping.`);
      continue;
    }

    const existingByUserId = await prisma.employee.findUnique({ where: { userId: owner.id } });
    if (existingByUserId) {
      skipped++;
      continue;
    }

    const defaultStatus = await prisma.statusDefinition.findFirst({
      where: { tenantId: owner.tenantId, entityType: 'employee', isDefault: true },
    });
    if (!defaultStatus) {
      console.log(`Owner ${owner.email}: tenant has no default employee status, skipping.`);
      continue;
    }

    const existingByEmail = await prisma.employee.findFirst({
      where: { tenantId: owner.tenantId, email: owner.email.toLowerCase() },
    });

    if (existingByEmail) {
      await prisma.employee.update({ where: { id: existingByEmail.id }, data: { userId: owner.id } });
      linked++;
      console.log(`Owner ${owner.email}: linked existing Employee record.`);
      continue;
    }

    await prisma.employee.create({
      data: {
        firstName: owner.firstName,
        lastName: owner.lastName,
        email: owner.email.toLowerCase(),
        department: 'Leadership',
        statusId: defaultStatus.id,
        tenantId: owner.tenantId,
        userId: owner.id,
      },
    });
    created++;
    console.log(`Owner ${owner.email}: created Employee record.`);
  }

  console.log(`Done. Created: ${created}, linked: ${linked}, already had one: ${skipped}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
