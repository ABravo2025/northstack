import prisma from '../../lib/prisma.js';
import type { EmployeePtoPolicy } from '@prisma/client';

export async function listEmployeePtoPolicies(tenantId: string, employeeId: string) {
  return prisma.employeePtoPolicy.findMany({
    where: { tenantId, employeeId },
    include: { ptoPolicy: true },
    orderBy: { assignedAt: 'asc' },
  });
}

export interface AssignPtoPolicyResult {
  success: boolean;
  assignment?: EmployeePtoPolicy;
  error?: string;
}

export async function assignPtoPolicyToEmployee(
  tenantId: string,
  employeeId: string,
  ptoPolicyId: string,
): Promise<AssignPtoPolicyResult> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.tenantId !== tenantId) {
    return { success: false, error: 'Employee not found' };
  }

  const policy = await prisma.ptoPolicyDefinition.findUnique({ where: { id: ptoPolicyId } });
  if (!policy || policy.tenantId !== tenantId) {
    return { success: false, error: 'PTO policy not found' };
  }

  const existing = await prisma.employeePtoPolicy.findUnique({
    where: { employeeId_ptoPolicyId: { employeeId, ptoPolicyId } },
  });
  if (existing) {
    return { success: false, error: 'This policy is already assigned to this employee' };
  }

  const assignment = await prisma.employeePtoPolicy.create({
    data: { tenantId, employeeId, ptoPolicyId },
  });
  return { success: true, assignment };
}

export interface UnassignPtoPolicyResult {
  success: boolean;
  error?: string;
}

export async function unassignPtoPolicyFromEmployee(
  tenantId: string,
  employeeId: string,
  ptoPolicyId: string,
): Promise<UnassignPtoPolicyResult> {
  const existing = await prisma.employeePtoPolicy.findUnique({
    where: { employeeId_ptoPolicyId: { employeeId, ptoPolicyId } },
  });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'Assignment not found' };
  }

  await prisma.employeePtoPolicy.delete({ where: { id: existing.id } });
  return { success: true };
}
