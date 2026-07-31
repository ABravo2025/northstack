import prisma from '../../lib/prisma.js';
import type { PayrollEntry, PayrollEntryType } from '@prisma/client';

const ADJUSTMENT_TYPES: PayrollEntryType[] = ['bonus', 'commission', 'reimbursement', 'deduction'];

export interface CreateAdjustmentInput {
  tenantId: string;
  runId: string;
  employeeId: string;
  type: PayrollEntryType;
  amountCents: number;
  currency: string;
  label?: string | null;
}

export interface AdjustmentResult {
  success: boolean;
  entry?: PayrollEntry;
  error?: string;
}

// Deductions are always stored negative regardless of the sign the caller
// sent — the frontend form only ever asks for a magnitude, so a person
// entering "50" for a deduction shouldn't have to remember to type "-50".
export async function createAdjustment(input: CreateAdjustmentInput): Promise<AdjustmentResult> {
  if (!ADJUSTMENT_TYPES.includes(input.type)) {
    return { success: false, error: 'Invalid adjustment type' };
  }
  if (!Number.isInteger(input.amountCents) || input.amountCents === 0) {
    return { success: false, error: 'Amount must be a non-zero number of cents' };
  }

  const run = await prisma.payrollRun.findUnique({ where: { id: input.runId } });
  if (!run || run.tenantId !== input.tenantId) {
    return { success: false, error: 'Payroll run not found' };
  }

  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee || employee.tenantId !== input.tenantId) {
    return { success: false, error: 'Employee not found' };
  }

  const magnitude = Math.abs(input.amountCents);
  const entry = await prisma.payrollEntry.create({
    data: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      runId: input.runId,
      type: input.type,
      amountCents: input.type === 'deduction' ? -magnitude : magnitude,
      currency: input.currency,
      label: input.label ?? null,
      paymentDate: new Date(),
    },
  });

  return { success: true, entry };
}

export async function findEntryById(id: string): Promise<PayrollEntry | null> {
  return prisma.payrollEntry.findUnique({ where: { id } });
}

export interface DeleteAdjustmentResult {
  success: boolean;
  error?: string;
}

// Base entries (type: 'base') aren't deletable through this path — they're
// tied 1:1 to the run's pre-load, not a standalone adjustment.
export async function deleteAdjustment(id: string, tenantId: string): Promise<DeleteAdjustmentResult> {
  const entry = await prisma.payrollEntry.findUnique({ where: { id }, include: { run: true } });
  if (!entry || entry.tenantId !== tenantId) {
    return { success: false, error: 'Payroll entry not found' };
  }
  if (entry.type === 'base') {
    return { success: false, error: 'The base entry cannot be deleted on its own' };
  }
  if (entry.run && entry.run.status !== 'draft') {
    return { success: false, error: 'Only entries on a draft run can be deleted' };
  }

  await prisma.payrollEntry.delete({ where: { id } });
  return { success: true };
}

// Not explicitly named as its own endpoint in the spec, but required for
// Unidad 9's "input de horas editable" to actually persist anything — the
// spec's own backend bullet for Unidad 9 only describes Unidad 11's confirm
// guard, so this fills the gap. Recomputes amountCents from the employee's
// hourly rate (vigente when the run was created, same lookup as
// getRunDetail) rather than trusting a client-sent amount.
export async function updateHourlyBaseEntryHours(
  id: string,
  tenantId: string,
  hoursQty: number,
): Promise<AdjustmentResult> {
  if (!Number.isFinite(hoursQty) || hoursQty < 0) {
    return { success: false, error: 'Hours must be a non-negative number' };
  }

  const entry = await prisma.payrollEntry.findUnique({ where: { id }, include: { run: true } });
  if (!entry || entry.tenantId !== tenantId) {
    return { success: false, error: 'Payroll entry not found' };
  }
  if (entry.type !== 'base') {
    return { success: false, error: 'Only the base entry accepts hours' };
  }
  if (!entry.run || entry.run.status !== 'draft') {
    return { success: false, error: 'Only entries on a draft run can be edited' };
  }

  const compensation = await prisma.employeeCompensation.findFirst({
    where: {
      tenantId,
      employeeId: entry.employeeId,
      effectiveFrom: { lte: entry.run.createdAt },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: entry.run.createdAt } }],
    },
  });
  if (!compensation || compensation.compensationType !== 'hourly') {
    return { success: false, error: 'This entry is not tied to an hourly compensation record' };
  }

  const updated = await prisma.payrollEntry.update({
    where: { id },
    data: { hoursQty, amountCents: Math.round(hoursQty * compensation.rateCents) },
  });

  return { success: true, entry: updated };
}
