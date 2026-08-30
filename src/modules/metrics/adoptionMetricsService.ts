import prisma from '../../lib/prisma.js';
import { avg, median, pct } from './mathUtils.js';
import type { DateRange } from './dateRange.js';

async function getSeatUtilization(tenantId: string): Promise<{ accepted: number; nonRevokedTotal: number; ratePct: number | null }> {
  const invitations = await prisma.invitation.findMany({ where: { tenantId }, select: { status: true } });
  const nonRevoked = invitations.filter((i) => i.status !== 'revoked');
  const accepted = nonRevoked.filter((i) => i.status === 'accepted').length;
  return { accepted, nonRevokedTotal: nonRevoked.length, ratePct: pct(accepted, nonRevoked.length) };
}

interface ModuleUsage {
  module: string;
  used: boolean;
  detail: string;
}

// HR uses the same ">1 Employee" gotcha as scripts/metrics-report.ts — every
// tenant auto-creates one Employee for the owner at signup, so ">=1" would
// always read "used" and tell the owner nothing. The other modules have no
// such auto-seed, so ">=1" is the real threshold there.
async function getModuleUsage(tenantId: string): Promise<ModuleUsage[]> {
  const [employeeCount, companyCount, opportunityCount, timeOffPolicyCount, compensationCount] = await Promise.all([
    prisma.employee.count({ where: { tenantId } }),
    prisma.company.count({ where: { tenantId } }),
    prisma.opportunity.count({ where: { tenantId, isActive: true } }),
    prisma.timeOffPolicyDefinition.count({ where: { tenantId, isActive: true } }),
    prisma.employeeCompensation.count({ where: { tenantId } }),
  ]);
  return [
    { module: 'hr', used: employeeCount > 1, detail: `${employeeCount} employees` },
    { module: 'sales', used: companyCount >= 1 || opportunityCount >= 1, detail: `${companyCount} companies, ${opportunityCount} open opportunities` },
    { module: 'time_off', used: timeOffPolicyCount >= 1, detail: `${timeOffPolicyCount} active policies` },
    { module: 'payroll', used: compensationCount >= 1, detail: `${compensationCount} compensation records` },
  ];
}

// Same weak-proxy caveat as basic-metrics-spec.md §2.3: Session.createdAt only
// marks the moment of login, not ongoing activity, and sessions slide for 30
// days before writing again — so this undercounts anyone who logs in once and
// stays "logged in". Real DAU/WAU/MAU needs Session.lastSeenAt, not built yet.
async function getLoginFrequency(
  tenantId: string,
  range: DateRange,
): Promise<{ usersWithSession: number; medianDistinctLoginDays: number | null; avgDistinctLoginDays: number | null }> {
  const sessions = await prisma.session.findMany({
    where: { user: { tenantId }, createdAt: { gte: range.since, lte: range.until } },
    select: { userId: true, createdAt: true },
  });
  const daysByUser = new Map<string, Set<string>>();
  for (const s of sessions) {
    const day = s.createdAt.toISOString().slice(0, 10);
    if (!daysByUser.has(s.userId)) daysByUser.set(s.userId, new Set());
    daysByUser.get(s.userId)!.add(day);
  }
  const dayCounts = [...daysByUser.values()].map((set) => set.size);
  const avgValue = avg(dayCounts);
  return {
    usersWithSession: daysByUser.size,
    medianDistinctLoginDays: median(dayCounts),
    avgDistinctLoginDays: avgValue === null ? null : Math.round(avgValue * 10) / 10,
  };
}

export async function getAdoptionMetrics(tenantId: string, range: DateRange) {
  const [seatUtilization, moduleUsage, loginFrequency] = await Promise.all([
    getSeatUtilization(tenantId),
    getModuleUsage(tenantId),
    getLoginFrequency(tenantId, range),
  ]);
  return { seatUtilization, moduleUsage, loginFrequency };
}
