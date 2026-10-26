import prisma from '../../lib/prisma.js';
import type { EmployeeCompensation, PayrollCompensationType, PersonType } from '@prisma/client';
import { createInvitation } from '../tenant/invitationService.js';
import { sendContractToSignNotice } from './contractToSignNotice.js';
import { renderContractPdf } from './contractPdfService.js';
import { toTenantBranding } from '../tenant/tenantProfileService.js';
import { recordActivity } from '../activity/activityLogService.js';
import { employeeCompensationActivityFieldConfig } from '../activity/fieldConfigs/employeeCompensationFieldConfig.js';
import { maskTaxId, personTaxIdRequired, type TaxIdKind } from '../../lib/taxId.js';

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
  // Platform role the person gets once they confirm their first contract (the contract-confirmation
  // invitation below carries it, confirmContract copies it onto the new User). Omitted → seed
  // Member, the previous fixed behavior. Validated by the route (payroll.ts) before this runs.
  inviteRoleId?: string;
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
    company: toTenantBranding(tenant),
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

  await recordActivity({
    tenantId: input.tenantId,
    entityType: 'employeeCompensation',
    entityId: compensation.id,
    entityLabel: `${employee.firstName} ${employee.lastName} — compensation`,
    action: 'create',
    changedByUserId: input.createdByUserId,
    after: compensation,
    fieldConfig: employeeCompensationActivityFieldConfig,
  });

  // Unidad 6: only the person's very first-ever contract, while they have no
  // linked User yet, sends the contract-confirmation invitation — a
  // reassignment/raise for someone already active doesn't re-invite them.
  // Someone who already has a login (e.g. a Profile switched to Contractor) can't be invited
  // again — they're told to sign it in the app instead (My contract, 2026-10-26).
  if (isFirstEver && employee.userId) {
    await sendContractToSignNotice(employee, draftPdfBuffer);
  } else if (isFirstEver) {
    await createInvitation({
      tenantId: input.tenantId,
      invitedByUserId: input.createdByUserId,
      email: employee.email,
      role: 'member',
      roleId: input.inviteRoleId,
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
  employeeEmail: string;
  // Payroll v2: file number ("legajo"), assigned automatically when the person is created.
  fileNumber: string | null;
  // Payroll v2: tax ID (CUIL / SSN / other), only ever masked; required in AR/US for employees.
  taxIdMasked: string | null;
  taxIdRequired: boolean;
  // Whether this person signed their first-ever contract — the right signal
  // for a Draft/Confirmed split, since a reassignment (Unidad 10) never
  // re-triggers confirmation: a raise's new EmployeeCompensation row always
  // has confirmedAt: null, even for someone who's been an active, confirmed
  // team member for years. Read from the first contract's own confirmedAt,
  // not "has a linked User" (2026-10-26) — someone with a login can now
  // still have an unsigned first contract (My contract).
  isConfirmed: boolean;
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
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { country: true } });
  const employees = await prisma.employee.findMany({
    where: { tenantId, personType: { in: ['contractor', 'employee'] } },
    include: {
      taxId: { select: { kind: true, last4: true } },
      compensations: {
        where: { effectiveTo: null },
        include: { payFrequency: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { firstName: 'asc' },
  });
  const firstContracts = await prisma.employeeCompensation.findMany({
    where: { tenantId, blocksParticipation: true, employeeId: { in: employees.map((e) => e.id) } },
    select: { employeeId: true, confirmedAt: true },
  });
  const signedFirstContract = new Set(firstContracts.filter((c) => c.confirmedAt).map((c) => c.employeeId));

  return employees.map((employee) => ({
    employeeId: employee.id,
    employeeFirstName: employee.firstName,
    employeeLastName: employee.lastName,
    employeeEmail: employee.email,
    fileNumber: employee.fileNumber,
    taxIdMasked: employee.taxId ? maskTaxId(employee.taxId.kind as TaxIdKind, employee.taxId.last4) : null,
    taxIdRequired: personTaxIdRequired(tenant.country, employee.personType),
    isConfirmed: signedFirstContract.has(employee.id),
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

export interface TerminatedCompensationEntry {
  compensationId: string;
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  employeeEmail: string;
  payFrequencyName: string;
  compensationType: PayrollCompensationType;
  rateCents: number;
  currency: string;
  effectiveFrom: Date;
  effectiveTo: Date;
}

// The "Terminated" bucket of the Assignments tab (2026-08-08 user feedback):
// every compensation row that's been closed (superseded by a reassignment,
// or explicitly ended) — history that getCompensationStatus deliberately
// excludes since it only ever looks at the currently-open row per person.
// A person can appear here more than once if they've had several contracts.
export async function listTerminatedCompensations(tenantId: string): Promise<TerminatedCompensationEntry[]> {
  const rows = await prisma.employeeCompensation.findMany({
    where: {
      tenantId,
      effectiveTo: { not: null },
      employee: { personType: { in: ['contractor', 'employee'] } },
    },
    include: { employee: true, payFrequency: true },
    orderBy: { effectiveTo: 'desc' },
  });

  return rows.map((row) => ({
    compensationId: row.id,
    employeeId: row.employeeId,
    employeeFirstName: row.employee.firstName,
    employeeLastName: row.employee.lastName,
    employeeEmail: row.employee.email,
    payFrequencyName: row.payFrequency.name,
    compensationType: row.compensationType,
    rateCents: row.rateCents,
    currency: row.currency,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo!,
  }));
}
