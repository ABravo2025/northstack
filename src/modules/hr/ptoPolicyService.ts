import prisma from '../../lib/prisma.js';
import type { PtoAccrualMethod, PtoPolicyDefinition } from '@prisma/client';

export interface CreatePtoPolicyInput {
  tenantId: string;
  name: string;
  color?: string | null;
  accrualMethod?: PtoAccrualMethod;
  daysPerYear: number;
  isPaid?: boolean;
  requiresApproval?: boolean;
}

export async function createPtoPolicy(input: CreatePtoPolicyInput): Promise<PtoPolicyDefinition> {
  return prisma.ptoPolicyDefinition.create({
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

export async function listPtoPolicies(tenantId: string): Promise<PtoPolicyDefinition[]> {
  return prisma.ptoPolicyDefinition.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function findPtoPolicyById(id: string): Promise<PtoPolicyDefinition | null> {
  return prisma.ptoPolicyDefinition.findUnique({ where: { id } });
}

export interface UpdatePtoPolicyInput {
  name?: string;
  color?: string | null;
  accrualMethod?: PtoAccrualMethod;
  daysPerYear?: number;
  isPaid?: boolean;
  requiresApproval?: boolean;
  isActive?: boolean;
}

export interface PtoPolicyUpdateResult {
  success: boolean;
  policy?: PtoPolicyDefinition;
  error?: string;
}

export async function updatePtoPolicy(
  id: string,
  tenantId: string,
  input: UpdatePtoPolicyInput,
): Promise<PtoPolicyUpdateResult> {
  const existing = await prisma.ptoPolicyDefinition.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'PTO policy not found' };
  }

  const updated = await prisma.ptoPolicyDefinition.update({ where: { id }, data: input });
  return { success: true, policy: updated };
}
