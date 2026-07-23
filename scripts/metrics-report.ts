import prisma from '../src/lib/prisma.js';

// Section 1 of docs/metrics/basic-metrics-spec.md — platform-wide growth/usage
// metrics, calculable today with zero schema changes. This is a CLI report,
// not an in-app feature: these numbers are cross-tenant (Northstack's own
// business metrics about its tenants), and viewing them safely requires the
// cross-tenant admin panel that's explicitly scoped as a later, separate
// Tier 4 item ("Admin panel de plataforma"). Building that auth surface just
// to show this report would be scope creep — run this locally instead:
//   npx tsx scripts/metrics-report.ts

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function pct(part: number, whole: number): string {
  if (whole === 0) return 'n/a';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, status: true, createdAt: true } });
  const activeTenants = tenants.filter((t) => t.status === 'active');
  const activeTenantIds = new Set(activeTenants.map((t) => t.id));

  console.log('=== Northstack — Basic Growth Metrics (spec section 1) ===');
  console.log(`Generated: ${new Date().toISOString()}\n`);

  // -- Tenants --
  console.log('-- Tenants --');
  console.log(`Total tenants: ${tenants.length}`);
  console.log(`Active tenants: ${activeTenants.length}`);

  const now = new Date();
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    months.push(monthKey(d));
  }
  const newByMonth = new Map<string, number>(months.map((m) => [m, 0]));
  for (const t of tenants) {
    const key = monthKey(t.createdAt);
    if (newByMonth.has(key)) newByMonth.set(key, (newByMonth.get(key) ?? 0) + 1);
  }
  console.log('New tenants by month (last 6):');
  for (const m of months) {
    console.log(`  ${m}: ${newByMonth.get(m)}`);
  }
  const lastMonth = newByMonth.get(months[months.length - 1]) ?? 0;
  const prevMonth = newByMonth.get(months[months.length - 2]) ?? 0;
  const momGrowth = prevMonth === 0 ? 'n/a (no signups in prior month)' : `${(((lastMonth - prevMonth) / prevMonth) * 100).toFixed(1)}%`;
  console.log(`MoM growth (latest vs. prior month): ${momGrowth}\n`);

  // -- Team size --
  console.log('-- Team size per tenant (active tenants only) --');
  console.log('(Employee counts include the auto-created owner record — every tenant has >=1.)');
  const userCounts = await Promise.all(activeTenants.map((t) => prisma.user.count({ where: { tenantId: t.id } })));
  const employeeCounts = await Promise.all(activeTenants.map((t) => prisma.employee.count({ where: { tenantId: t.id } })));
  const clientCounts = await Promise.all(activeTenants.map((t) => prisma.client.count({ where: { tenantId: t.id } })));
  console.log(`Users per tenant: avg ${avg(userCounts).toFixed(1)}, median ${median(userCounts)}, max ${Math.max(0, ...userCounts)}`);
  console.log(`Employees per tenant: avg ${avg(employeeCounts).toFixed(1)}, median ${median(employeeCounts)}, max ${Math.max(0, ...employeeCounts)}`);
  console.log(`Clients per tenant: avg ${avg(clientCounts).toFixed(1)}, median ${median(clientCounts)}, max ${Math.max(0, ...clientCounts)}\n`);

  // -- Invitations --
  console.log('-- Invitations --');
  const invitations = await prisma.invitation.findMany({ select: { status: true } });
  const byStatus = { pending: 0, accepted: 0, expired: 0, revoked: 0 };
  for (const inv of invitations) byStatus[inv.status] += 1;
  console.log(`Total invitations: ${invitations.length}`);
  console.log(`  accepted: ${byStatus.accepted}, pending: ${byStatus.pending}, expired: ${byStatus.expired}, revoked: ${byStatus.revoked}`);
  console.log(`Acceptance rate (accepted / total): ${pct(byStatus.accepted, invitations.length)}\n`);

  // -- Module adoption --
  // Every tenant gets one auto-created Employee record for the owner at
  // signup (see tenantService.ts) — "adopted HR" has to mean a *real* second
  // employee was added, or this would always read 100%.
  console.log('-- Module adoption (active tenants) --');
  const employeesByTenant = employeeCounts;
  const tenantsWithRealEmployees = employeesByTenant.filter((c) => c > 1).length;
  const tenantsWithClients = new Set(
    (await prisma.client.findMany({ where: { tenantId: { in: [...activeTenantIds] } }, select: { tenantId: true }, distinct: ['tenantId'] })).map(
      (c) => c.tenantId,
    ),
  );
  console.log(`HR module (>1 employee, i.e. beyond the auto-created owner record): ${pct(tenantsWithRealEmployees, activeTenants.length)} (${tenantsWithRealEmployees} / ${activeTenants.length})`);
  console.log(`Clients module (>=1 client): ${pct(tenantsWithClients.size, activeTenants.length)} (${tenantsWithClients.size} / ${activeTenants.length})\n`);

  // -- Custom fields --
  console.log('-- Custom fields --');
  const customFieldDefs = await prisma.customFieldDefinition.findMany({
    where: { isActive: true, tenantId: { in: [...activeTenantIds] } },
    select: { tenantId: true },
  });
  const tenantsUsingCustomFields = new Set(customFieldDefs.map((c) => c.tenantId));
  console.log(`Total active custom field definitions: ${customFieldDefs.length}`);
  console.log(`Tenants using at least 1 custom field: ${pct(tenantsUsingCustomFields.size, activeTenants.length)} (${tenantsUsingCustomFields.size} / ${activeTenants.length})`);
  if (tenantsUsingCustomFields.size > 0) {
    console.log(`Avg custom fields per tenant (of those using them): ${(customFieldDefs.length / tenantsUsingCustomFields.size).toFixed(1)}`);
  }
  console.log();

  // -- Login frequency (proxy) --
  console.log('-- Login frequency (proxy — distinct login days per user) --');
  const sessions = await prisma.session.findMany({ select: { userId: true, createdAt: true } });
  const daysByUser = new Map<string, Set<string>>();
  for (const s of sessions) {
    const day = s.createdAt.toISOString().slice(0, 10);
    if (!daysByUser.has(s.userId)) daysByUser.set(s.userId, new Set());
    daysByUser.get(s.userId)!.add(day);
  }
  const dayCounts = [...daysByUser.values()].map((set) => set.size);
  console.log(`Users with >=1 session: ${daysByUser.size}`);
  console.log(`Avg distinct login days per user: ${avg(dayCounts).toFixed(1)}`);
  console.log(`Median distinct login days per user: ${median(dayCounts)}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
