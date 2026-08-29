import prisma from '../../lib/prisma.js';
import { median, monthsAgoUtc, pct } from './mathUtils.js';

async function getApprovalStats(tenantId: string): Promise<{ approvalRatePct: number | null; medianApprovalHours: number; sampleSize: number }> {
  const decided = await prisma.timeOffRequest.findMany({
    where: { tenantId, status: { in: ['approved', 'rejected'] } },
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

async function getPendingCount(tenantId: string): Promise<number> {
  return prisma.timeOffRequest.count({ where: { tenantId, status: 'pending' } });
}

async function getPolicyAdoption(tenantId: string): Promise<{ employeesWithPolicy: number; totalEmployees: number; adoptionPct: number | null }> {
  const [totalEmployees, withPolicy] = await Promise.all([
    prisma.employee.count({ where: { tenantId } }),
    prisma.employeeTimeOffPolicy.findMany({ where: { tenantId }, select: { employeeId: true }, distinct: ['employeeId'] }),
  ]);
  return { employeesWithPolicy: withPolicy.length, totalEmployees, adoptionPct: pct(withPolicy.length, totalEmployees) };
}

async function getDaysTakenThisPeriod(tenantId: string, monthsBack: number): Promise<{ totalDays: number; requestCount: number }> {
  const since = monthsAgoUtc(monthsBack - 1);
  const requests = await prisma.timeOffRequest.findMany({
    where: { tenantId, status: 'approved', startDate: { gte: since } },
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

async function getPolicyDistribution(tenantId: string): Promise<PolicyBucket[]> {
  const groups = await prisma.timeOffRequest.groupBy({
    by: ['timeOffPolicyId'],
    where: { tenantId, status: 'approved' },
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

export async function getTimeOffMetrics(tenantId: string, monthsBack = 6) {
  const [approval, pending, policyAdoption, daysTaken, byPolicy] = await Promise.all([
    getApprovalStats(tenantId),
    getPendingCount(tenantId),
    getPolicyAdoption(tenantId),
    getDaysTakenThisPeriod(tenantId, monthsBack),
    getPolicyDistribution(tenantId),
  ]);
  return { approval, pending, policyAdoption, daysTaken, byPolicy };
}
