import prisma from '../../lib/prisma.js';
import type { EmployeeCompensation, PayrollCompensationType, PersonType } from '@prisma/client';
import { createInvitation } from '../tenant/invitationService.js';
import { renderContractPdf } from './contractPdfService.js';

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

  const [tenant, payFrequency] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: input.tenantId } }),
    prisma.payFrequencyDefinition.findUniqueOrThrow({ where: { id: input.payFrequencyId } }),
  ]);
  const draftPdfBytes = await renderContractPdf({
    tenantName: tenant.name,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    nationality: employee.nationality,
    jobTitle: input.jobTitle,
    description: input.description,
    compensationType: input.compensationType,
    rateCents: input.rateCents,
    currency: input.currency,
    payFrequencyName: payFrequency.name,
    effectiveFrom: effectiveFromDate,
    signed: false,
  });
  const draftPdfBuffer = Buffer.from(draftPdfBytes);

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
      contractPdf: draftPdfBuffer,
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
      attachments: [{ filename: 'contract-draft.pdf', content: draftPdfBuffer }],
    });
  }

  return { success: true, compensation };
}

export async function findCompensationById(id: string): Promise<EmployeeCompensation | null> {
  return prisma.employeeCompensation.findUnique({ where: { id } });
}

// Unidad 10 — bulk assign/reassign, an exception tool (retrofitting old
// people with no compensation, or migrating a group to a new pay
// frequency). Never computes an amount from the previous one — each amount
// arrives explicit in the payload. One createCompensation call per entry,
// so the "close the previous open record, compute blocksParticipation,
// maybe invite" logic never gets duplicated.
export interface BulkCompensationEntryInput {
  employeeId: string;
  compensationType: PayrollCompensationType;
  rateCents: number;
  currency: string;
  jobTitle: string;
  description: string;
}

export interface BulkCompensationInput {
  tenantId: string;
  payFrequencyId: string;
  effectiveFrom: string;
  createdByUserId: string;
  entries: BulkCompensationEntryInput[];
}

export interface BulkCompensationEntryResult {
  employeeId: string;
  success: boolean;
  compensationId?: string;
  error?: string;
}

export async function createCompensationBulk(input: BulkCompensationInput): Promise<BulkCompensationEntryResult[]> {
  const results: BulkCompensationEntryResult[] = [];
  for (const entry of input.entries) {
    const result = await createCompensation({
      tenantId: input.tenantId,
      employeeId: entry.employeeId,
      compensationType: entry.compensationType,
      rateCents: entry.rateCents,
      currency: entry.currency,
      payFrequencyId: input.payFrequencyId,
      jobTitle: entry.jobTitle,
      description: entry.description,
      effectiveFrom: input.effectiveFrom,
      createdByUserId: input.createdByUserId,
    });
    results.push({
      employeeId: entry.employeeId,
      success: result.success,
      compensationId: result.compensation?.id,
      error: result.error,
    });
  }
  return results;
}

export interface CompensationStatusEntry {
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  personType: PersonType | null;
  currentCompensation: {
    payFrequencyName: string;
    compensationType: PayrollCompensationType;
    rateCents: number;
    currency: string;
  } | null;
}

// Powers the Assignments tab (Unidad 10) — every Contractor/Employee with
// their current (effectiveTo: null) compensation, or null if they've never
// had one (the retrofit case this tool exists for).
export async function getCompensationStatus(tenantId: string): Promise<CompensationStatusEntry[]> {
  const employees = await prisma.employee.findMany({
    where: { tenantId, personType: { in: ['contractor', 'employee'] } },
    include: {
      compensations: {
        where: { effectiveTo: null },
        include: { payFrequency: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { firstName: 'asc' },
  });

  return employees.map((employee) => ({
    employeeId: employee.id,
    employeeFirstName: employee.firstName,
    employeeLastName: employee.lastName,
    personType: employee.personType,
    currentCompensation: employee.compensations[0]
      ? {
          payFrequencyName: employee.compensations[0].payFrequency.name,
          compensationType: employee.compensations[0].compensationType,
          rateCents: employee.compensations[0].rateCents,
          currency: employee.compensations[0].currency,
        }
      : null,
  }));
}
