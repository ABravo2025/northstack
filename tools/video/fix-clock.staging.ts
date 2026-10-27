// One-off, STAGING demo tenant only: punches loaded after their shift ended became overtime shifts;
// link them to the person's real shift of the day and drop the overtime shifts.
import prisma from '../src/lib/prisma.js';
if (!(process.env.DATABASE_URL ?? '').includes('ep-damp-union')) throw new Error('not staging');
const tenant = await prisma.tenant.findFirst({ where: { name: 'Acme Latam' } });
if (!tenant) throw new Error('no tenant');
const day = new Date(process.env.TODAY + 'T00:00:00Z');
const entries = await prisma.clockEntry.findMany({ where: { tenantId: tenant.id, clockInAt: { gte: new Date(day.getTime() - 864e5) } } });
for (const e of entries) {
  const cur = e.shiftAssignmentId ? await prisma.shiftAssignment.findUnique({ where: { id: e.shiftAssignmentId }, include: { shift: true } }) : null;
  if (cur && !cur.shift.isOvertime) continue;
  const real = await prisma.shiftAssignment.findFirst({ where: { employeeId: e.employeeId, shift: { date: day, locationId: e.locationId, isOvertime: false } } });
  if (!real) { console.log('no real shift for', e.employeeId); continue; }
  await prisma.clockEntry.update({ where: { id: e.id }, data: { shiftAssignmentId: real.id, needsReview: false } });
  if (cur) await prisma.shift.delete({ where: { id: cur.shiftId } });
  console.log('linked', e.id, cur ? '(overtime shift removed)' : '');
}
// any other overtime shift created today for the demo (e.g. an open one) goes too
const extra = await prisma.shift.findMany({ where: { tenantId: tenant.id, isOvertime: true, date: day } });
for (const s of extra) {
  const used = await prisma.clockEntry.count({ where: { shiftAssignmentId: { in: (await prisma.shiftAssignment.findMany({ where: { shiftId: s.id } })).map((a) => a.id) } } });
  if (!used) { await prisma.shift.delete({ where: { id: s.id } }); console.log('removed empty overtime shift'); }
}
await prisma.$disconnect();
