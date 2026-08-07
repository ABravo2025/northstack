import prisma from '../../lib/prisma.js';
import { getDefaultStatusId } from './statusService.js';
import type { PayrollCompensationType, PayrollEntryType, PayrollRun } from '@prisma/client';

export interface CreateRunInput {
  tenantId: string;
  payFrequencyId: string;
  periodLabel: string;
  createdByUserId: string;
}

export interface CreateRunResult {
  success: boolean;
  run?: PayrollRun;
  error?: string;
}

// Preloads only Contractor/Employee with a currently-active compensation on
// this exact frequency, excluding anyone whose first-ever contract still
// blocks participation (Unidad 9 — unconfirmed). Never converts/divides a
// fixed rate; hourly entries land at 0/null until hours are loaded by hand
// (Unidad 15). No real calendar-date job exists yet (Unidad 1's deliberate
// scope gap), so paymentDate defaults to "today" — purely a placeholder
// until that job exists.
export async function createRun(input: CreateRunInput): Promise<CreateRunResult> {
  const payFrequency = await prisma.payFrequencyDefinition.findUnique({ where: { id: input.payFrequencyId } });
  if (!payFrequency || payFrequency.tenantId !== input.tenantId) {
    return { success: false, error: 'Pay frequency not found' };
  }

  const eligibleCompensations = await prisma.employeeCompensation.findMany({
    where: {
      tenantId: input.tenantId,
      payFrequencyId: input.payFrequencyId,
      effectiveTo: null,
      employee: { personType: { in: ['contractor', 'employee'] } },
      NOT: { blocksParticipation: true, confirmedAt: null },
    },
  });

  const run = await prisma.payrollRun.create({
    data: {
      tenantId: input.tenantId,
      payFrequencyId: input.payFrequencyId,
      periodLabel: input.periodLabel,
      status: 'draft',
      createdByUserId: input.createdByUserId,
    },
  });

  if (eligibleCompensations.length > 0) {
    await prisma.payrollEntry.createMany({
      data: eligibleCompensations.map((comp) => ({
        tenantId: input.tenantId,
        employeeId: comp.employeeId,
        runId: run.id,
        type: 'base' as PayrollEntryType,
        amountCents: comp.compensationType === 'fixed' ? comp.rateCents : 0,
        currency: comp.currency,
        hoursQty: null,
        paymentDate: new Date(),
      })),
    });
  }

  return { success: true, run };
}

export interface RunDetailEntry {
  id: string;
  type: PayrollEntryType;
  amountCents: number;
  currency: string;
  hoursQty: number | null;
  label: string | null;
  paymentDate: string;
}

export interface RunDetailEmployeeRow {
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  compensationType: PayrollCompensationType;
  rateCents: number;
  currency: string;
  statusName: string;
  isInactive: boolean;
  entries: RunDetailEntry[];
  baseAmountCents: number;
  adjustmentsTotalCents: number;
  totalCents: number;
}

export interface RunDetail {
  run: PayrollRun & { payFrequency: { id: string; name: string } | null };
  employeeRows: RunDetailEmployeeRow[];
  excludedCount: number;
  hasUnloadedHours: boolean;
}

export interface GetRunDetailResult {
  success: boolean;
  detail?: RunDetail;
  error?: string;
}

export async function getRunDetail(tenantId: string, runId: string): Promise<GetRunDetailResult> {
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { payFrequency: true } });
  if (!run || run.tenantId !== tenantId) {
    return { success: false, error: 'Run not found' };
  }

  const entries = await prisma.payrollEntry.findMany({
    where: { tenantId, runId },
    include: { employee: { include: { statusDefn: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const employeeIds = [...new Set(entries.map((e) => e.employeeId))];
  const compensations = await prisma.employeeCompensation.findMany({
    where: { tenantId, employeeId: { in: employeeIds }, effectiveTo: null },
  });
  const compByEmployee = new Map(compensations.map((c) => [c.employeeId, c]));
  const defaultStatusId = employeeIds.length > 0 ? await getDefaultStatusId(tenantId, 'employee') : null;

  const employeeRows: RunDetailEmployeeRow[] = employeeIds.map((employeeId) => {
    const employeeEntries = entries.filter((e) => e.employeeId === employeeId);
    const employee = employeeEntries[0].employee;
    const comp = compByEmployee.get(employeeId);
    const baseEntry = employeeEntries.find((e) => e.type === 'base');
    const adjustments = employeeEntries.filter((e) => e.type !== 'base');
    const baseAmountCents = baseEntry?.amountCents ?? 0;
    const adjustmentsTotalCents = adjustments.reduce((sum, e) => sum + e.amountCents, 0);

    return {
      employeeId,
      employeeFirstName: employee.firstName,
      employeeLastName: employee.lastName,
      compensationType: comp?.compensationType ?? 'fixed',
      rateCents: comp?.rateCents ?? 0,
      currency: comp?.currency ?? baseEntry?.currency ?? 'USD',
      statusName: employee.statusDefn.name,
      isInactive: defaultStatusId != null && employee.statusId !== defaultStatusId,
      entries: employeeEntries.map((e) => ({
        id: e.id,
        type: e.type,
        amountCents: e.amountCents,
        currency: e.currency,
        hoursQty: e.hoursQty,
        label: e.label,
        paymentDate: e.paymentDate.toISOString(),
      })),
      baseAmountCents,
      adjustmentsTotalCents,
      totalCents: baseAmountCents + adjustmentsTotalCents,
    };
  });

  const excludedCount = run.payFrequencyId
    ? await prisma.employeeCompensation.count({
        where: {
          tenantId,
          payFrequencyId: run.payFrequencyId,
          effectiveTo: null,
          blocksParticipation: true,
          confirmedAt: null,
          employee: { personType: { in: ['contractor', 'employee'] } },
        },
      })
    : 0;

  const hasUnloadedHours = employeeRows.some(
    (row) => row.compensationType === 'hourly' && row.entries.some((e) => e.type === 'base' && e.hoursQty == null),
  );

  return { success: true, detail: { run, employeeRows, excludedCount, hasUnloadedHours } };
}

export interface AddEmployeeToRunResult {
  success: boolean;
  error?: string;
}

// The "+ Add person to this run" manual exception (Unidad 13) — only while
// the run is still draft, only for someone with an active compensation who
// isn't already in it (regardless of whether their frequency matches the
// run's, since this is explicitly an exception path).
export async function addEmployeeToRun(
  tenantId: string,
  runId: string,
  employeeId: string,
): Promise<AddEmployeeToRunResult> {
  const run = await prisma.payrollRun.findUnique({ where: { id: runId } });
  if (!run || run.tenantId !== tenantId) {
    return { success: false, error: 'Run not found' };
  }
  if (run.status !== 'draft') {
    return { success: false, error: 'This run is already confirmed' };
  }

  const compensation = await prisma.employeeCompensation.findFirst({
    where: { tenantId, employeeId, effectiveTo: null },
  });
  if (!compensation) {
    return { success: false, error: 'This person has no active compensation' };
  }

  const existing = await prisma.payrollEntry.findFirst({ where: { tenantId, runId, employeeId, type: 'base' } });
  if (existing) {
    return { success: false, error: 'This person is already in this run' };
  }

  await prisma.payrollEntry.create({
    data: {
      tenantId,
      employeeId,
      runId,
      type: 'base',
      amountCents: compensation.compensationType === 'fixed' ? compensation.rateCents : 0,
      currency: compensation.currency,
      hoursQty: null,
      paymentDate: new Date(),
    },
  });

  return { success: true };
}

export interface ConfirmRunResult {
  success: boolean;
  run?: PayrollRun;
  error?: string;
}

// Unidad 17 — draft -> confirmed. Blocks on any hourly base entry still
// missing hours (Unidad 15), checked via the linked EmployeeCompensation
// since PayrollEntry itself doesn't carry compensationType.
export async function confirmRun(tenantId: string, runId: string): Promise<ConfirmRunResult> {
  const run = await prisma.payrollRun.findUnique({ where: { id: runId } });
  if (!run || run.tenantId !== tenantId) {
    return { success: false, error: 'Run not found' };
  }
  if (run.status === 'confirmed') {
    return { success: false, error: 'This run is already confirmed' };
  }

  const baseEntries = await prisma.payrollEntry.findMany({ where: { tenantId, runId, type: 'base' } });
  const employeeIds = baseEntries.map((e) => e.employeeId);
  const compensations = await prisma.employeeCompensation.findMany({
    where: { tenantId, employeeId: { in: employeeIds }, effectiveTo: null },
  });
  const compByEmployee = new Map(compensations.map((c) => [c.employeeId, c]));

  const hasUnloadedHours = baseEntries.some((entry) => {
    const comp = compByEmployee.get(entry.employeeId);
    return comp?.compensationType === 'hourly' && entry.hoursQty == null;
  });
  if (hasUnloadedHours) {
    return { success: false, error: 'Some hourly entries still need hours loaded before confirming.' };
  }

  const updated = await prisma.payrollRun.update({
    where: { id: runId },
    data: { status: 'confirmed', confirmedAt: new Date() },
  });
  return { success: true, run: updated };
}

export async function findRunById(id: string): Promise<PayrollRun | null> {
  return prisma.payrollRun.findUnique({ where: { id } });
}

export async function listRuns(tenantId: string): Promise<PayrollRun[]> {
  return prisma.payrollRun.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
}
