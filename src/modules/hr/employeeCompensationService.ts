import prisma from '../../lib/prisma.js';
import type { EmployeeCompensation, Prisma, PayrollCompensationType } from '@prisma/client';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const compensationInclude = {
  payFrequency: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

type CompensationWithRelations = Prisma.EmployeeCompensationGetPayload<{ include: typeof compensationInclude }>;

export interface CreateCompensationInput {
  tenantId: string;
  employeeId: string;
  compensationType: PayrollCompensationType;
  rateCents: number;
  currency: string;
  payFrequencyId: string;
  effectiveFrom: Date | string;
  note?: string | null;
  createdByUserId: string;
}

export interface CreateCompensationResult {
  success: boolean;
  compensation?: CompensationWithRelations;
  error?: string;
}

export async function createCompensation(input: CreateCompensationInput): Promise<CreateCompensationResult> {
  const effectiveFrom = new Date(input.effectiveFrom);
  if (Number.isNaN(effectiveFrom.getTime())) {
    return { success: false, error: 'Invalid effective date' };
  }
  if (!Number.isInteger(input.rateCents) || input.rateCents <= 0) {
    return { success: false, error: 'Rate must be a positive number of cents' };
  }

  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee || employee.tenantId !== input.tenantId) {
    return { success: false, error: 'Employee not found' };
  }

  const payFrequency = await prisma.payFrequencyDefinition.findUnique({ where: { id: input.payFrequencyId } });
  if (!payFrequency || payFrequency.tenantId !== input.tenantId) {
    return { success: false, error: 'Pay frequency not found' };
  }

  const compensation = await prisma.$transaction(async (tx) => {
    // Only one row per employeeId may have effectiveTo: null at a time — close
    // the currently-vigente row (if any) the day before this one starts.
    const current = await tx.employeeCompensation.findFirst({
      where: { tenantId: input.tenantId, employeeId: input.employeeId, effectiveTo: null },
    });
    if (current) {
      await tx.employeeCompensation.update({
        where: { id: current.id },
        data: { effectiveTo: new Date(effectiveFrom.getTime() - MS_PER_DAY) },
      });
    }

    // Unidad 5.3 — blocksParticipation is true only for this employee's
    // first-ever contract (no prior row with confirmedAt set). A later
    // reassignment while unconfirmed stays non-blocking so an already-active
    // person doesn't drop out of a run over not reviewing a mail in time.
    const everConfirmed = await tx.employeeCompensation.findFirst({
      where: { tenantId: input.tenantId, employeeId: input.employeeId, confirmedAt: { not: null } },
    });

    return tx.employeeCompensation.create({
      data: {
        tenantId: input.tenantId,
        employeeId: input.employeeId,
        compensationType: input.compensationType,
        rateCents: input.rateCents,
        currency: input.currency,
        payFrequencyId: input.payFrequencyId,
        effectiveFrom,
        note: input.note ?? null,
        createdByUserId: input.createdByUserId,
        blocksParticipation: !everConfirmed,
      },
      include: compensationInclude,
    });
  });

  return { success: true, compensation };
}

export interface ConfirmCompensationResult {
  success: boolean;
  compensation?: CompensationWithRelations;
  error?: string;
}

// Unidad 5.3 — the employee themselves confirms their own contract (never
// owner/admin on their behalf, that would defeat the point of confirming).
export async function confirmCompensation(
  tenantId: string,
  employeeId: string,
  compensationId: string,
): Promise<ConfirmCompensationResult> {
  const compensation = await prisma.employeeCompensation.findUnique({
    where: { id: compensationId },
    include: compensationInclude,
  });
  if (!compensation || compensation.tenantId !== tenantId || compensation.employeeId !== employeeId) {
    return { success: false, error: 'Compensation record not found' };
  }
  if (compensation.confirmedAt) {
    return { success: true, compensation };
  }

  const updated = await prisma.employeeCompensation.update({
    where: { id: compensationId },
    data: { confirmedAt: new Date() },
    include: compensationInclude,
  });
  return { success: true, compensation: updated };
}

// The employee's own unconfirmed, participation-blocking contract (if any) —
// drives the Overview banner, and is reused as the exclusion check by both
// Payroll run pre-load (Unidad 6) and Time Off request creation (Unidad 5.3's
// cross-module note) so the two don't drift out of sync with each other.
export async function findBlockingUnconfirmedCompensation(
  tenantId: string,
  employeeId: string,
): Promise<CompensationWithRelations | null> {
  return prisma.employeeCompensation.findFirst({
    where: { tenantId, employeeId, blocksParticipation: true, confirmedAt: null },
    include: compensationInclude,
    orderBy: { createdAt: 'desc' },
  });
}

export async function listCompensationHistory(tenantId: string, employeeId: string) {
  return prisma.employeeCompensation.findMany({
    where: { tenantId, employeeId },
    include: compensationInclude,
    orderBy: { effectiveFrom: 'desc' },
  });
}

// Used by Payroll Run pre-load (Unidad 6) to find what a given employee was
// earning on a specific date, not just "right now".
export async function getActiveCompensation(
  tenantId: string,
  employeeId: string,
  atDate: Date = new Date(),
): Promise<EmployeeCompensation | null> {
  return prisma.employeeCompensation.findFirst({
    where: {
      tenantId,
      employeeId,
      effectiveFrom: { lte: atDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: atDate } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });
}
