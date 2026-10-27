// One-off, STAGING demo tenant only: earlier seed runs approved the same vacation several times.
import prisma from '../src/lib/prisma.js';
if (!(process.env.DATABASE_URL ?? '').includes('ep-damp-union')) throw new Error('not staging');
const tenant = await prisma.tenant.findFirst({ where: { name: 'Acme Latam' } });
const reqs = await prisma.timeOffRequest.findMany({ where: { tenantId: tenant!.id, status: { in: ['approved', 'pending'] } }, orderBy: { createdAt: 'asc' } });
const seen = new Set<string>();
for (const r of reqs) {
  const key = `${r.employeeId}|${r.status}|${r.startDate.toISOString()}|${r.endDate.toISOString()}`;
  if (seen.has(key)) { await prisma.timeOffRequest.update({ where: { id: r.id }, data: { status: 'cancelled' } }); console.log('cancelled dup', r.startDate.toISOString().slice(0, 10)); }
  seen.add(key);
}
await prisma.$disconnect();
