import prisma, { type ExtendedPrismaClient } from '../../lib/prisma.js';
import { getDefaultStatusId } from './statusService.js';
import { recordActivity } from '../activity/activityLogService.js';
import { payrollRunActivityFieldConfig } from '../activity/fieldConfigs/payrollRunFieldConfig.js';
import type { PayrollCompensationType, PayrollEntryType, PayrollRun } from '@prisma/client';
import { suggestPayDateForFrequency } from './payDateService.js';

export interface CreateRunInput {
  tenantId: string;
  payFrequencyId: string;
  periodLabel: string;
  createdByUserId: string;
  // Payroll v2: the real pay date (YYYY-MM-DD); suggested from the frequency when left out.
  paymentDate?: string;
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

  const payDay = parsePayDate(input.paymentDate) ?? (await suggestPayDateForFrequency(input.tenantId, input.payFrequencyId)) ?? new Date();
  const run = await prisma.payrollRun.create({
    data: {
      tenantId: input.tenantId,
      payFrequencyId: input.payFrequencyId,
      periodLabel: input.periodLabel,
      status: 'draft',
      createdByUserId: input.createdByUserId,
      paymentDate: payDay,
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
        paymentDate: payDay,
      })),
    });
  }

  await recordActivity({
    tenantId: input.tenantId,
    entityType: 'payrollRun',
    entityId: run.id,
    entityLabel: `Payroll run: ${run.periodLabel}`,
    action: 'create',
    changedByUserId: input.createdByUserId,
    after: run,
    fieldConfig: payrollRunActivityFieldConfig,
  });

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
  // Timesheet → Payroll: the period the hours came from, while they're still the timesheet's.
  hoursFrom: string | null;
  hoursTo: string | null;
  hoursFromTimesheet: boolean;
  overtimeKind: string | null;
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
  jobTitle: string | null;
  entries: RunDetailEntry[];
  baseAmountCents: number;
  adjustmentsTotalCents: number;
  totalCents: number;
}

export interface RunDetail {
  run: PayrollRun & { payFrequency: { id: string; name: string; cadence: string } | null };
  employeeRows: RunDetailEmployeeRow[];
  excludedCount: number;
  hasUnloadedHours: boolean;
  // Payroll v2 (unit 3): totals of the previous confirmed run of the same frequency, per currency,
  // and the weeks of the hours period still waiting for approval (their hours aren't included).
  previousTotals: Record<string, number> | null;
  unapprovedWeeks: { employeeId: string; name: string; weekStart: string; status: string }[];
  payslipsIssued: number;
  // Payroll v2 (2026-10-26): the run this one corrects, and the corrections made to this one.
  correctionOf: { id: string; periodLabel: string; status: string } | null;
  corrections: { id: string; kind: string | null; status: string; createdAt: Date }[];
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
    include: { employee: { include: { statusDefn: true, jobTitleDefn: { select: { name: true } } } } },
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
      jobTitle: employee.jobTitleDefn?.name ?? null,
      isInactive: defaultStatusId != null && employee.statusId !== defaultStatusId,
      entries: employeeEntries.map((e) => ({
        id: e.id,
        type: e.type,
        amountCents: e.amountCents,
        currency: e.currency,
        hoursQty: e.hoursQty,
        label: e.label,
        paymentDate: e.paymentDate.toISOString(),
        hoursFrom: e.hoursFrom ? e.hoursFrom.toISOString().slice(0, 10) : null,
        hoursTo: e.hoursTo ? e.hoursTo.toISOString().slice(0, 10) : null,
        hoursFromTimesheet: e.hoursFromTimesheet,
        overtimeKind: e.overtimeKind,
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

  const previous = await prisma.payrollRun.findFirst({
    where: { tenantId, status: 'confirmed', payFrequencyId: run.payFrequencyId, id: { not: run.id }, OR: [{ correctionKind: null }, { correctionKind: { not: 'supplement' } }], ...(run.confirmedAt ? { confirmedAt: { lt: run.confirmedAt } } : {}) },
    orderBy: { confirmedAt: 'desc' },
    select: { id: true },
  });
  let previousTotals: Record<string, number> | null = null;
  if (previous) {
    const sums = await prisma.payrollEntry.groupBy({ by: ['currency'], where: { tenantId, runId: previous.id }, _sum: { amountCents: true } });
    previousTotals = Object.fromEntries(sums.map((x) => [x.currency, x._sum.amountCents ?? 0]));
  }
  const hoursBase = entries.find((e) => e.type === 'base' && e.hoursFrom && e.hoursTo);
  const hourlyIds = employeeRows.filter((r) => r.compensationType === 'hourly').map((r) => r.employeeId);
  const unapprovedWeeks =
    run.status === 'draft' && hoursBase && hourlyIds.length
      ? (
          await prisma.timesheet.findMany({
            where: { tenantId, employeeId: { in: hourlyIds }, status: { not: 'approved' }, entries: { some: { date: { gte: hoursBase.hoursFrom!, lte: hoursBase.hoursTo! } } } },
            select: { employeeId: true, weekStart: true, status: true, employee: { select: { firstName: true, lastName: true } } },
            orderBy: { weekStart: 'asc' },
          })
        ).map((w) => ({ employeeId: w.employeeId, name: `${w.employee.firstName} ${w.employee.lastName}`.trim(), weekStart: w.weekStart.toISOString().slice(0, 10), status: w.status }))
      : [];
  const payslipsIssued = await prisma.payslip.count({ where: { tenantId, runId: run.id } });
  const [correctionOf, corrections] = await Promise.all([
    run.correctionOfId ? prisma.payrollRun.findFirst({ where: { id: run.correctionOfId, tenantId }, select: { id: true, periodLabel: true, status: true } }) : null,
    prisma.payrollRun.findMany({ where: { tenantId, correctionOfId: run.id }, select: { id: true, correctionKind: true, status: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
  ]);

  return {
    success: true,
    detail: {
      run, employeeRows, excludedCount, hasUnloadedHours, previousTotals, unapprovedWeeks, payslipsIssued,
      correctionOf,
      corrections: corrections.map((c) => ({ id: c.id, kind: c.correctionKind, status: c.status, createdAt: c.createdAt })),
    },
  };
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
      paymentDate: run.paymentDate ?? new Date(),
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
export async function confirmRun(tenantId: string, runId: string, changedByUserId: string): Promise<ConfirmRunResult> {
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

  // Every line is paid on the run's pay date (adjustments and hours added later included).
  if (run.paymentDate) {
    await prisma.payrollEntry.updateMany({ where: { tenantId, runId }, data: { paymentDate: run.paymentDate } });
  }
  const updated = await prisma.payrollRun.update({
    where: { id: runId },
    data: { status: 'confirmed', confirmedAt: new Date() },
  });

  await recordActivity({
    tenantId,
    entityType: 'payrollRun',
    entityId: runId,
    entityLabel: `Payroll run: ${updated.periodLabel}`,
    action: 'update',
    changedByUserId,
    before: run,
    after: updated,
    fieldConfig: payrollRunActivityFieldConfig,
  });

  return { success: true, run: updated };
}

const parsePayDate = (raw: unknown): Date | null => {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Payroll v2: change a draft run's pay date (YYYY-MM-DD).
export async function setRunPaymentDate(tenantId: string, runId: string, raw: unknown, changedByUserId: string): Promise<{ success: boolean; error?: string; run?: PayrollRun }> {
  const date = parsePayDate(raw);
  if (!date) return { success: false, error: 'Invalid pay date' };
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, tenantId } });
  if (!run) return { success: false, error: 'Run not found' };
  if (run.status !== 'draft') return { success: false, error: 'Only a draft run can change its pay date' };
  const updated = await prisma.payrollRun.update({ where: { id: runId }, data: { paymentDate: date } });
  await prisma.payrollEntry.updateMany({ where: { tenantId, runId }, data: { paymentDate: date } });
  await recordActivity({ tenantId, entityType: 'payrollRun', entityId: runId, entityLabel: `Payroll run: ${run.periodLabel}`, action: 'update', changedByUserId, before: run, after: updated, fieldConfig: payrollRunActivityFieldConfig });
  return { success: true, run: updated };
}

export async function findRunById(id: string): Promise<PayrollRun | null> {
  return prisma.payrollRun.findUnique({ where: { id } });
}

export async function listRuns(tenantId: string, client: ExtendedPrismaClient = prisma): Promise<PayrollRun[]> {
  return client.payrollRun.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
}
