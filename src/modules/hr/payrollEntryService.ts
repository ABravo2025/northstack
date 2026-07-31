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
  if (run.status !== 'draft') {
    return { success: false, error: 'Only entries on a draft run can be added' };
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

// Unidad 13's unified timeline needs these listed on their own — off-cycle
// entries (runId: null) were creatable (Unidad 12) but never listable.
export async function listOffCyclePayments(tenantId: string) {
  return prisma.payrollEntry.findMany({
    where: { tenantId, runId: null },
    include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { paymentDate: 'desc' },
  });
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

export interface OffCyclePaymentInput {
  employeeId: string;
  amountCents: number;
}

export interface CreateOffCyclePaymentsInput {
  tenantId: string;
  type: PayrollEntryType;
  currency: string;
  paymentDate: Date | string;
  payments: OffCyclePaymentInput[];
}

export interface CreateOffCyclePaymentsResult {
  success: boolean;
  entries?: PayrollEntry[];
  error?: string;
}

// Unidad 12 — off-cycle payments, independent of any run (runId: null).
// Amount is per-person (spec flagged this as open — "mismo monto o editable
// por persona" — resolved to editable: a checklist naturally supports
// different amounts per person at no extra cost, and off-cycle bonuses
// realistically do vary person to person). Type/currency/paymentDate are
// shared across the whole submit.
export async function createOffCyclePayments(input: CreateOffCyclePaymentsInput): Promise<CreateOffCyclePaymentsResult> {
  if (!ADJUSTMENT_TYPES.includes(input.type)) {
    return { success: false, error: 'Invalid payment type' };
  }
  if (input.payments.length === 0) {
    return { success: false, error: 'Select at least one person' };
  }
  for (const payment of input.payments) {
    if (!Number.isInteger(payment.amountCents) || payment.amountCents === 0) {
      return { success: false, error: 'Every selected person needs a non-zero amount' };
    }
  }

  const paymentDate = new Date(input.paymentDate);
  if (Number.isNaN(paymentDate.getTime())) {
    return { success: false, error: 'Invalid payment date' };
  }

  const employeeIds = [...new Set(input.payments.map((p) => p.employeeId))];
  const employees = await prisma.employee.findMany({ where: { id: { in: employeeIds }, tenantId: input.tenantId } });
  if (employees.length !== employeeIds.length) {
    return { success: false, error: 'One or more employees were not found' };
  }

  const entries = await prisma.payrollEntry.createMany({
    data: input.payments.map((payment) => ({
      tenantId: input.tenantId,
      employeeId: payment.employeeId,
      runId: null,
      type: input.type,
      amountCents: input.type === 'deduction' ? -Math.abs(payment.amountCents) : Math.abs(payment.amountCents),
      currency: input.currency,
      paymentDate,
    })),
  });
  // createMany doesn't return the created rows — re-fetch by the inputs we
  // just used (employeeId + paymentDate is specific enough for this single
  // batch, there's no id to key off otherwise).
  const created = await prisma.payrollEntry.findMany({
    where: { tenantId: input.tenantId, runId: null, employeeId: { in: employeeIds }, paymentDate },
    orderBy: { createdAt: 'desc' },
    take: entries.count,
  });

  return { success: true, entries: created };
}
