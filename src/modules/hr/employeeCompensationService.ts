import prisma from '../../lib/prisma.js';
import type { EmployeeCompensation, PayrollCompensationType } from '@prisma/client';
import { createInvitation } from '../tenant/invitationService.js';

export interface CreateCompensationInput {
  tenantId: string;
  employeeId: string;
  compensationType: PayrollCompensationType;
  rateCents: number;
  currency: string;
  payFrequencyId: string;
  jobTitle: string;
  description: string;
  effectiveFrom: string;
  note?: string | null;
  createdByUserId: string;
}

export interface CreateCompensationResult {
  success: boolean;
  compensation?: EmployeeCompensation;
  error?: string;
}

// The one place that creates an EmployeeCompensation row — used directly by
// the People alta form (Unidad 5) and meant to be reused as-is by the bulk
// assign/reassign tool (Unidad 10), so the "close the previous open record,
// compute blocksParticipation, maybe invite" logic never has to be
// duplicated.
export async function createCompensation(input: CreateCompensationInput): Promise<CreateCompensationResult> {
  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee || employee.tenantId !== input.tenantId) {
    return { success: false, error: 'Employee not found' };
  }

  const existingCount = await prisma.employeeCompensation.count({ where: { employeeId: input.employeeId } });
  const isFirstEver = existingCount === 0;

  // Service-level invariant (not enforced at the DB level, same pattern as
  // StatusDefinition.isDefault): an employee can't have two open-ended
  // (effectiveTo: null) compensation rows — closing the previous one the day
  // before the new one starts.
  const currentlyOpen = await prisma.employeeCompensation.findFirst({
    where: { employeeId: input.employeeId, effectiveTo: null },
  });
  const effectiveFromDate = new Date(input.effectiveFrom);
  if (Number.isNaN(effectiveFromDate.getTime())) {
    return { success: false, error: 'Invalid effectiveFrom date' };
  }

  if (currentlyOpen) {
    const closesAt = new Date(effectiveFromDate);
    closesAt.setDate(closesAt.getDate() - 1);
    await prisma.employeeCompensation.update({
      where: { id: currentlyOpen.id },
      data: { effectiveTo: closesAt },
    });
  }

  const compensation = await prisma.employeeCompensation.create({
    data: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      compensationType: input.compensationType,
      rateCents: input.rateCents,
      currency: input.currency,
      payFrequencyId: input.payFrequencyId,
      jobTitle: input.jobTitle,
      description: input.description,
      effectiveFrom: effectiveFromDate,
      note: input.note ?? null,
      blocksParticipation: isFirstEver,
      createdByUserId: input.createdByUserId,
    },
  });

  // Unidad 6: only the person's very first-ever contract, while they have no
  // linked User yet, sends the contract-confirmation invitation — a
  // reassignment/raise for someone already active doesn't re-invite them.
  if (isFirstEver && !employee.userId) {
    await createInvitation({
      tenantId: input.tenantId,
      invitedByUserId: input.createdByUserId,
      email: employee.email,
      role: 'member',
      employeeId: employee.id,
      acceptPath: '/confirm-contract',
    });
  }

  return { success: true, compensation };
}

export async function findCompensationById(id: string): Promise<EmployeeCompensation | null> {
  return prisma.employeeCompensation.findUnique({ where: { id } });
}
