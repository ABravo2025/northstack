import prisma from '../../lib/prisma.js';
import type { TimeOffAccrualMethod } from '@prisma/client';

export interface TimeOffBalance {
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  timeOffPolicyId: string;
  policyName: string;
  color: string | null;
  accrualMethod: TimeOffAccrualMethod;
  daysPerYear: number;
  allocated: number;
  used: number;
  pending: number;
  remaining: number;
}

// Whole calendar months completed since `start`, as of `now` — e.g. assigned
// Jan 15, now Feb 10 → 0 months; now Feb 20 → 1 month. Monthly accrual grants
// a month's worth of days as soon as that month begins (not retroactively at
// month's end), so the caller adds 1 to this before multiplying.
function monthsElapsed(start: Date, now: Date): number {
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) {
    months -= 1;
  }
  return Math.max(0, months);
}

function calculateAllocatedDays(
  accrualMethod: TimeOffAccrualMethod,
  daysPerYear: number,
  assignedAt: Date,
  now: Date,
): number {
  if (accrualMethod === 'fixed_annual') {
    return daysPerYear;
  }

  const yearStart = new Date(now.getFullYear(), 0, 1);
  const accrualStart = assignedAt > yearStart ? assignedAt : yearStart;
  if (accrualStart > now) {
    return 0;
  }

  const monthsAccrued = Math.min(12, monthsElapsed(accrualStart, now) + 1);
  const monthlyRate = daysPerYear / 12;
  return Math.round(monthlyRate * monthsAccrued * 100) / 100;
}

async function buildBalances(
  assignments: {
    employeeId: string;
    employee: { firstName: string; lastName: string };
    timeOffPolicyId: string;
    timeOffPolicy: { name: string; color: string | null; accrualMethod: TimeOffAccrualMethod; daysPerYear: number };
    assignedAt: Date;
  }[],
  tenantId: string,
): Promise<TimeOffBalance[]> {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1);

  const requests = await prisma.timeOffRequest.findMany({
    where: {
      tenantId,
      startDate: { gte: yearStart, lt: yearEnd },
      status: { in: ['approved', 'pending'] },
    },
  });

  return assignments.map((assignment) => {
    const allocated = calculateAllocatedDays(
      assignment.timeOffPolicy.accrualMethod,
      assignment.timeOffPolicy.daysPerYear,
      assignment.assignedAt,
      now,
    );

    const relevantRequests = requests.filter(
      (r) => r.employeeId === assignment.employeeId && r.timeOffPolicyId === assignment.timeOffPolicyId,
    );
    const used = relevantRequests
      .filter((r) => r.status === 'approved')
      .reduce((sum, r) => sum + r.daysRequested, 0);
    const pending = relevantRequests
      .filter((r) => r.status === 'pending')
      .reduce((sum, r) => sum + r.daysRequested, 0);

    return {
      employeeId: assignment.employeeId,
      employeeFirstName: assignment.employee.firstName,
      employeeLastName: assignment.employee.lastName,
      timeOffPolicyId: assignment.timeOffPolicyId,
      policyName: assignment.timeOffPolicy.name,
      color: assignment.timeOffPolicy.color,
      accrualMethod: assignment.timeOffPolicy.accrualMethod,
      daysPerYear: assignment.timeOffPolicy.daysPerYear,
      allocated,
      used,
      pending,
      remaining: Math.round((allocated - used) * 100) / 100,
    };
  });
}

export async function calculateEmployeeTimeOffBalances(tenantId: string, employeeId: string): Promise<TimeOffBalance[]> {
  const assignments = await prisma.employeeTimeOffPolicy.findMany({
    where: { tenantId, employeeId },
    include: { employee: { select: { firstName: true, lastName: true } }, timeOffPolicy: true },
  });
  return buildBalances(assignments, tenantId);
}

export async function calculateAllTimeOffBalances(tenantId: string): Promise<TimeOffBalance[]> {
  const assignments = await prisma.employeeTimeOffPolicy.findMany({
    where: { tenantId },
    include: { employee: { select: { firstName: true, lastName: true } }, timeOffPolicy: true },
  });
  return buildBalances(assignments, tenantId);
}
