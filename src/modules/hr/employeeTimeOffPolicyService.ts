import prisma from '../../lib/prisma.js';
import type { EmployeeTimeOffPolicy } from '@prisma/client';

export async function listEmployeeTimeOffPolicies(tenantId: string, employeeId: string) {
  return prisma.employeeTimeOffPolicy.findMany({
    where: { tenantId, employeeId },
    include: { timeOffPolicy: true },
    orderBy: { assignedAt: 'asc' },
  });
}

export interface AssignTimeOffPolicyResult {
  success: boolean;
  assignment?: EmployeeTimeOffPolicy;
  error?: string;
}

export async function assignTimeOffPolicyToEmployee(
  tenantId: string,
  employeeId: string,
  timeOffPolicyId: string,
): Promise<AssignTimeOffPolicyResult> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.tenantId !== tenantId) {
    return { success: false, error: 'Employee not found' };
  }

  const policy = await prisma.timeOffPolicyDefinition.findUnique({ where: { id: timeOffPolicyId } });
  if (!policy || policy.tenantId !== tenantId) {
    return { success: false, error: 'Time off policy not found' };
  }

  const existing = await prisma.employeeTimeOffPolicy.findUnique({
    where: { employeeId_timeOffPolicyId: { employeeId, timeOffPolicyId } },
  });
  if (existing) {
    return { success: false, error: 'This policy is already assigned to this employee' };
  }

  const assignment = await prisma.employeeTimeOffPolicy.create({
    data: { tenantId, employeeId, timeOffPolicyId },
  });
  return { success: true, assignment };
}

export interface UnassignTimeOffPolicyResult {
  success: boolean;
  error?: string;
}

export async function unassignTimeOffPolicyFromEmployee(
  tenantId: string,
  employeeId: string,
  timeOffPolicyId: string,
): Promise<UnassignTimeOffPolicyResult> {
  const existing = await prisma.employeeTimeOffPolicy.findUnique({
    where: { employeeId_timeOffPolicyId: { employeeId, timeOffPolicyId } },
  });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'Assignment not found' };
  }

  await prisma.employeeTimeOffPolicy.delete({ where: { id: existing.id } });
  return { success: true };
}
