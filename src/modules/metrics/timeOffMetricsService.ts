import prisma from '../../lib/prisma.js';
import { median, pct } from './mathUtils.js';
import type { DateRange } from './dateRange.js';

async function getApprovalStats(
  tenantId: string,
  range: DateRange,
): Promise<{ approvalRatePct: number | null; medianApprovalHours: number; sampleSize: number }> {
  const decided = await prisma.timeOffRequest.findMany({
    where: { tenantId, status: { in: ['approved', 'rejected'] }, createdAt: { gte: range.since, lte: range.until } },
    select: { status: true, createdAt: true, decidedAt: true },
  });
  const approved = decided.filter((r) => r.status === 'approved');
  const hours = decided.filter((r) => r.decidedAt).map((r) => (r.decidedAt!.getTime() - r.createdAt.getTime()) / 3600000);
  return {
    approvalRatePct: pct(approved.length, decided.length),
    medianApprovalHours: Math.round(median(hours) * 10) / 10,
    sampleSize: decided.length,
  };
}

// Not range-filtered — "how many requests need a decision right now" is
// inherently a current-state question, not a historical one.
async function getPendingCount(tenantId: string): Promise<number> {
  return prisma.timeOffRequest.count({ where: { tenantId, status: 'pending' } });
}

// Not range-filtered — "who has a policy assigned" is current state.
async function getPolicyAdoption(tenantId: string): Promise<{ employeesWithPolicy: number; totalEmployees: number; adoptionPct: number | null }> {
  const [totalEmployees, withPolicy] = await Promise.all([
    prisma.employee.count({ where: { tenantId } }),
    prisma.employeeTimeOffPolicy.findMany({ where: { tenantId }, select: { employeeId: true }, distinct: ['employeeId'] }),
  ]);
  return { employeesWithPolicy: withPolicy.length, totalEmployees, adoptionPct: pct(withPolicy.length, totalEmployees) };
}

async function getDaysTakenInRange(tenantId: string, range: DateRange): Promise<{ totalDays: number; requestCount: number }> {
  const requests = await prisma.timeOffRequest.findMany({
    where: { tenantId, status: 'approved', startDate: { gte: range.since, lte: range.until } },
    select: { daysRequested: true },
  });
  return { totalDays: requests.reduce((sum, r) => sum + r.daysRequested, 0), requestCount: requests.length };
}

interface PolicyBucket {
  policyId: string;
  name: string;
  color: string | null;
  requestCount: number;
  totalDays: number;
}

async function getPolicyDistribution(tenantId: string, range: DateRange): Promise<PolicyBucket[]> {
  const groups = await prisma.timeOffRequest.groupBy({
    by: ['timeOffPolicyId'],
    where: { tenantId, status: 'approved', startDate: { gte: range.since, lte: range.until } },
    _count: true,
    _sum: { daysRequested: true },
  });
  const policies = await prisma.timeOffPolicyDefinition.findMany({
    where: { id: { in: groups.map((g) => g.timeOffPolicyId) } },
    select: { id: true, name: true, color: true },
  });
  const byId = new Map(policies.map((p) => [p.id, p]));
  return groups
    .map((g) => {
      const p = byId.get(g.timeOffPolicyId);
      return {
        policyId: g.timeOffPolicyId,
        name: p?.name ?? 'Unknown',
        color: p?.color ?? null,
        requestCount: g._count,
        totalDays: g._sum.daysRequested ?? 0,
      };
    })
    .sort((a, b) => b.totalDays - a.totalDays);
}

export async function getTimeOffMetrics(tenantId: string, range: DateRange) {
  const [approval, pending, policyAdoption, daysTaken, byPolicy] = await Promise.all([
    getApprovalStats(tenantId, range),
    getPendingCount(tenantId),
    getPolicyAdoption(tenantId),
    getDaysTakenInRange(tenantId, range),
    getPolicyDistribution(tenantId, range),
  ]);
  return { approval, pending, policyAdoption, daysTaken, byPolicy };
}
