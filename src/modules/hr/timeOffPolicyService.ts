import prisma from '../../lib/prisma.js';
import type { TimeOffAccrualMethod, TimeOffPolicyDefinition } from '@prisma/client';

export interface CreateTimeOffPolicyInput {
  tenantId: string;
  name: string;
  color?: string | null;
  accrualMethod?: TimeOffAccrualMethod;
  daysPerYear: number;
  isPaid?: boolean;
  requiresApproval?: boolean;
}

export async function createTimeOffPolicy(input: CreateTimeOffPolicyInput): Promise<TimeOffPolicyDefinition> {
  return prisma.timeOffPolicyDefinition.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      color: input.color,
      accrualMethod: input.accrualMethod ?? 'fixed_annual',
      daysPerYear: input.daysPerYear,
      isPaid: input.isPaid ?? true,
      requiresApproval: input.requiresApproval ?? true,
    },
  });
}

export async function listTimeOffPolicies(tenantId: string): Promise<TimeOffPolicyDefinition[]> {
  return prisma.timeOffPolicyDefinition.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function findTimeOffPolicyById(id: string): Promise<TimeOffPolicyDefinition | null> {
  return prisma.timeOffPolicyDefinition.findUnique({ where: { id } });
}

export interface UpdateTimeOffPolicyInput {
  name?: string;
  color?: string | null;
  accrualMethod?: TimeOffAccrualMethod;
  daysPerYear?: number;
  isPaid?: boolean;
  requiresApproval?: boolean;
  isActive?: boolean;
}

export interface TimeOffPolicyUpdateResult {
  success: boolean;
  policy?: TimeOffPolicyDefinition;
  error?: string;
}

export async function updateTimeOffPolicy(
  id: string,
  tenantId: string,
  input: UpdateTimeOffPolicyInput,
): Promise<TimeOffPolicyUpdateResult> {
  const existing = await prisma.timeOffPolicyDefinition.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'Time off policy not found' };
  }

  const updated = await prisma.timeOffPolicyDefinition.update({ where: { id }, data: input });
  return { success: true, policy: updated };
}
