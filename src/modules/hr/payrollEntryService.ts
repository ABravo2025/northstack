import prisma from '../../lib/prisma.js';
import type { PayrollEntry, PayrollEntryType } from '@prisma/client';

export interface CreateAdjustmentInput {
  tenantId: string;
  runId: string;
  employeeId: string;
  type: PayrollEntryType;
  amountCents: number;
  currency: string;
  label?: string | null;
  paymentDate: string;
}

export interface CreateAdjustmentResult {
  success: boolean;
  entry?: PayrollEntry;
  error?: string;
}

const ADJUSTMENT_TYPES: PayrollEntryType[] = ['bonus', 'commission', 'reimbursement', 'deduction'];

// Unidad 14 — bonus/commission/reimbursement/deduction, always tied to a
// run + person. 'base' entries are never created through this path (only
// payrollRunService's preload/add-person does that).
export async function createAdjustment(input: CreateAdjustmentInput): Promise<CreateAdjustmentResult> {
  if (!ADJUSTMENT_TYPES.includes(input.type)) {
    return { success: false, error: 'Invalid adjustment type' };
  }

  const run = await prisma.payrollRun.findUnique({ where: { id: input.runId } });
  if (!run || run.tenantId !== input.tenantId) {
    return { success: false, error: 'Run not found' };
  }
  if (run.status !== 'draft') {
    return { success: false, error: 'This run is already confirmed' };
  }

  const entry = await prisma.payrollEntry.create({
    data: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      runId: input.runId,
      type: input.type,
      amountCents: input.amountCents,
      currency: input.currency,
      label: input.label ?? null,
      paymentDate: new Date(input.paymentDate),
    },
  });

  return { success: true, entry };
}

export interface DeleteEntryResult {
  success: boolean;
  error?: string;
}

export async function deleteEntry(tenantId: string, entryId: string): Promise<DeleteEntryResult> {
  const entry = await prisma.payrollEntry.findUnique({ where: { id: entryId }, include: { run: true } });
  if (!entry || entry.tenantId !== tenantId) {
    return { success: false, error: 'Entry not found' };
  }
  if (!entry.runId || !entry.run) {
    return { success: false, error: 'This entry is not part of a run' };
  }
  if (entry.run.status !== 'draft') {
    return { success: false, error: 'This run is already confirmed' };
  }

  await prisma.payrollEntry.delete({ where: { id: entryId } });
  return { success: true };
}

export interface EmployeePaymentHistoryEntry {
  id: string;
  type: PayrollEntryType;
  amountCents: number;
  currency: string;
  label: string | null;
  paymentDate: string;
  source: 'run' | 'off-cycle';
  periodLabel: string | null;
}

// Employee profile's Payment History tab — every entry actually paid to this person, run-based or
// off-cycle. Draft run entries are excluded (nothing has actually been paid yet); off-cycle entries
// have no draft state (createOffPayments writes them as final), so all of those count.
export async function listPaymentHistoryForEmployee(
  tenantId: string,
  employeeId: string,
): Promise<EmployeePaymentHistoryEntry[]> {
  const entries = await prisma.payrollEntry.findMany({
    where: {
      tenantId,
      employeeId,
      OR: [{ runId: null }, { run: { status: 'confirmed' } }],
    },
    include: { run: { select: { periodLabel: true } } },
    orderBy: { paymentDate: 'desc' },
  });

  return entries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    amountCents: entry.amountCents,
    currency: entry.currency,
    label: entry.label,
    paymentDate: entry.paymentDate.toISOString(),
    source: entry.runId ? 'run' : 'off-cycle',
    periodLabel: entry.run?.periodLabel ?? null,
  }));
}

export interface UpdateHoursResult {
  success: boolean;
  entry?: PayrollEntry;
  error?: string;
}

// Unidad 15 — editing hours on an hourly base entry recalculates
// amountCents = hoursQty x the person's current hourly rate (never stored
// redundantly on the entry itself).
export async function updateEntryHours(tenantId: string, entryId: string, hoursQty: number): Promise<UpdateHoursResult> {
  if (!Number.isFinite(hoursQty) || hoursQty < 0) {
    return { success: false, error: 'hoursQty must be a non-negative number' };
  }

  const entry = await prisma.payrollEntry.findUnique({ where: { id: entryId }, include: { run: true } });
  if (!entry || entry.tenantId !== tenantId) {
    return { success: false, error: 'Entry not found' };
  }
  if (entry.type !== 'base') {
    return { success: false, error: 'Only base entries track hours' };
  }
  if (entry.run && entry.run.status !== 'draft') {
    return { success: false, error: 'This run is already confirmed' };
  }

  const compensation = await prisma.employeeCompensation.findFirst({
    where: { tenantId, employeeId: entry.employeeId, effectiveTo: null },
  });
  if (!compensation || compensation.compensationType !== 'hourly') {
    return { success: false, error: 'This person has no active hourly compensation' };
  }

  const amountCents = Math.round(hoursQty * compensation.rateCents);
  const updated = await prisma.payrollEntry.update({
    where: { id: entryId },
    data: { hoursQty, amountCents },
  });

  return { success: true, entry: updated };
}
