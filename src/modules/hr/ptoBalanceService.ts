import prisma from '../../lib/prisma.js';
import type { PtoAccrualMethod } from '@prisma/client';

export interface PtoBalance {
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  ptoPolicyId: string;
  policyName: string;
  color: string | null;
  accrualMethod: PtoAccrualMethod;
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
  accrualMethod: PtoAccrualMethod,
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
    ptoPolicyId: string;
    ptoPolicy: { name: string; color: string | null; accrualMethod: PtoAccrualMethod; daysPerYear: number };
    assignedAt: Date;
  }[],
  tenantId: string,
): Promise<PtoBalance[]> {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1);

  const requests = await prisma.ptoRequest.findMany({
    where: {
      tenantId,
      startDate: { gte: yearStart, lt: yearEnd },
      status: { in: ['approved', 'pending'] },
    },
  });

  return assignments.map((assignment) => {
    const allocated = calculateAllocatedDays(
      assignment.ptoPolicy.accrualMethod,
      assignment.ptoPolicy.daysPerYear,
      assignment.assignedAt,
      now,
    );

    const relevantRequests = requests.filter(
      (r) => r.employeeId === assignment.employeeId && r.ptoPolicyId === assignment.ptoPolicyId,
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
      ptoPolicyId: assignment.ptoPolicyId,
      policyName: assignment.ptoPolicy.name,
      color: assignment.ptoPolicy.color,
      accrualMethod: assignment.ptoPolicy.accrualMethod,
      daysPerYear: assignment.ptoPolicy.daysPerYear,
      allocated,
      used,
      pending,
      remaining: Math.round((allocated - used) * 100) / 100,
    };
  });
}

export async function calculateEmployeePtoBalances(tenantId: string, employeeId: string): Promise<PtoBalance[]> {
  const assignments = await prisma.employeePtoPolicy.findMany({
    where: { tenantId, employeeId },
    include: { employee: { select: { firstName: true, lastName: true } }, ptoPolicy: true },
  });
  return buildBalances(assignments, tenantId);
}

export async function calculateAllPtoBalances(tenantId: string): Promise<PtoBalance[]> {
  const assignments = await prisma.employeePtoPolicy.findMany({
    where: { tenantId },
    include: { employee: { select: { firstName: true, lastName: true } }, ptoPolicy: true },
  });
  return buildBalances(assignments, tenantId);
}
