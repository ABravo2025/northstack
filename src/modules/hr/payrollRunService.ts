import prisma from '../../lib/prisma.js';
import type { PayrollEntry, PayrollRun } from '@prisma/client';

export interface CreateRunResult {
  success: boolean;
  run?: PayrollRun;
  error?: string;
}

// Pre-loads a `base` PayrollEntry for every EmployeeCompensation currently
// vigente (effectiveTo: null) under the chosen frequency — regardless of the
// Employee's current status (Unidad 10 flags inactive employees visually on
// the run, it doesn't filter them out of the pre-load; blocking is explicitly
// out of scope for V1). Fixed compensation copies rateCents directly (no
// conversion); hourly starts at amountCents: 0 / hoursQty: null until loaded
// (Unidad 9).
export async function createRun(
  tenantId: string,
  payFrequencyId: string,
  periodLabel: string,
  createdByUserId: string,
): Promise<CreateRunResult> {
  const frequency = await prisma.payFrequencyDefinition.findUnique({ where: { id: payFrequencyId } });
  if (!frequency || frequency.tenantId !== tenantId) {
    return { success: false, error: 'Pay frequency not found' };
  }
  if (!periodLabel.trim()) {
    return { success: false, error: 'Period label is required' };
  }

  const compensations = await prisma.employeeCompensation.findMany({
    where: { tenantId, payFrequencyId, effectiveTo: null },
  });

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.payrollRun.create({
      data: { tenantId, payFrequencyId, periodLabel: periodLabel.trim(), createdByUserId },
    });

    if (compensations.length > 0) {
      const now = new Date();
      await tx.payrollEntry.createMany({
        data: compensations.map((comp) => ({
          tenantId,
          employeeId: comp.employeeId,
          runId: created.id,
          type: 'base' as const,
          amountCents: comp.compensationType === 'fixed' ? comp.rateCents : 0,
          currency: comp.currency,
          hoursQty: null,
          paymentDate: now,
        })),
      });
    }

    return created;
  });

  return { success: true, run };
}

export async function listRuns(tenantId: string) {
  return prisma.payrollRun.findMany({
    where: { tenantId },
    include: { payFrequency: true, createdBy: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function findRunById(id: string): Promise<PayrollRun | null> {
  return prisma.payrollRun.findUnique({ where: { id } });
}

export interface RunEmployeeGroup {
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    statusDefn: { id: string; name: string; color: string | null; isDefault: boolean };
  };
  compensationType: 'hourly' | 'fixed' | null;
  // Only meaningful (non-null) when compensationType is 'hourly' — lets the
  // frontend show a live "hours × rate" preview (Unidad 9) without a second
  // round trip.
  hourlyRateCents: number | null;
  // Unidad 10 — set only when the employee's current status isn't the
  // tenant's default Employee status ("isDefault" is the closest structural
  // proxy for "activo" — status names are tenant-renameable, so matching on
  // the literal string "Active" would break for a tenant that renamed it).
  statusSince: Date | null;
  base: PayrollEntry | null;
  adjustments: PayrollEntry[];
  total: number;
}

// Groups the run's PayrollEntry rows by employee (one base + N adjustments
// each) so the frontend doesn't have to — see Unidad 6 spec note.
// compensationType isn't stored on PayrollEntry itself (that's an
// EmployeeCompensation concept) — resolved here via whichever compensation
// was vigente when the run was created, so the "Hourly"/"Fixed" badge in the
// run detail table doesn't have to guess from amountCents/hoursQty being 0.
export async function getRunDetail(tenantId: string, runId: string) {
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: { payFrequency: true, createdBy: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!run || run.tenantId !== tenantId) {
    return null;
  }

  const entries = await prisma.payrollEntry.findMany({
    where: { tenantId, runId },
    include: { employee: { include: { statusDefn: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const employeeIds = [...new Set(entries.map((e) => e.employeeId))];
  const compensations =
    employeeIds.length > 0
      ? await prisma.employeeCompensation.findMany({
          where: {
            tenantId,
            employeeId: { in: employeeIds },
            effectiveFrom: { lte: run.createdAt },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.createdAt } }],
          },
        })
      : [];
  const compensationTypeByEmployeeId = new Map(compensations.map((c) => [c.employeeId, c.compensationType]));
  const hourlyRateByEmployeeId = new Map(
    compensations.filter((c) => c.compensationType === 'hourly').map((c) => [c.employeeId, c.rateCents]),
  );

  const nonDefaultEmployeeIds = [
    ...new Set(entries.filter((e) => !e.employee.statusDefn.isDefault).map((e) => e.employeeId)),
  ];
  const statusSinceByEmployeeId = new Map<string, Date>();
  if (nonDefaultEmployeeIds.length > 0) {
    await Promise.all(
      nonDefaultEmployeeIds.map(async (employeeId) => {
        const lastChange = await prisma.statusHistoryEntry.findFirst({
          where: { tenantId, entityType: 'employee', entityId: employeeId },
          orderBy: { changedAt: 'desc' },
        });
        if (lastChange) {
          statusSinceByEmployeeId.set(employeeId, lastChange.changedAt);
        }
      }),
    );
  }

  const groupsByEmployeeId = new Map<string, RunEmployeeGroup>();
  for (const entry of entries) {
    if (!groupsByEmployeeId.has(entry.employeeId)) {
      groupsByEmployeeId.set(entry.employeeId, {
        employee: {
          id: entry.employee.id,
          firstName: entry.employee.firstName,
          lastName: entry.employee.lastName,
          statusDefn: entry.employee.statusDefn,
        },
        compensationType: compensationTypeByEmployeeId.get(entry.employeeId) ?? null,
        hourlyRateCents: hourlyRateByEmployeeId.get(entry.employeeId) ?? null,
        statusSince: statusSinceByEmployeeId.get(entry.employeeId) ?? null,
        base: null,
        adjustments: [],
        total: 0,
      });
    }
    const group = groupsByEmployeeId.get(entry.employeeId)!;
    if (entry.type === 'base') {
      group.base = entry;
    } else {
      group.adjustments.push(entry);
    }
    group.total += entry.amountCents;
  }

  return { ...run, employeeGroups: Array.from(groupsByEmployeeId.values()) };
}

export interface ConfirmRunResult {
  success: boolean;
  run?: PayrollRun;
  error?: string;
}

// Blocks confirmation if any hourly base entry still has hoursQty: null
// (fixed base entries never have hours, so this only looks at employees
// whose vigente-at-creation compensation was hourly — see getRunDetail's
// same lookup pattern). Once confirmed, PayrollEntry create/update/delete on
// this run is rejected by Unidad 8/9's own endpoints (they check run.status
// directly), not by anything here.
export async function confirmRun(tenantId: string, runId: string): Promise<ConfirmRunResult> {
  const run = await prisma.payrollRun.findUnique({ where: { id: runId } });
  if (!run || run.tenantId !== tenantId) {
    return { success: false, error: 'Payroll run not found' };
  }
  if (run.status !== 'draft') {
    return { success: false, error: 'This run has already been confirmed' };
  }

  const baseEntries = await prisma.payrollEntry.findMany({ where: { tenantId, runId, type: 'base' } });
  const employeeIds = [...new Set(baseEntries.map((e) => e.employeeId))];
  const hourlyCompensations =
    employeeIds.length > 0
      ? await prisma.employeeCompensation.findMany({
          where: {
            tenantId,
            employeeId: { in: employeeIds },
            compensationType: 'hourly',
            effectiveFrom: { lte: run.createdAt },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.createdAt } }],
          },
        })
      : [];
  const hourlyEmployeeIds = new Set(hourlyCompensations.map((c) => c.employeeId));

  const missingHours = baseEntries.some((e) => hourlyEmployeeIds.has(e.employeeId) && e.hoursQty === null);
  if (missingHours) {
    return { success: false, error: 'Every hourly person needs hours loaded before this run can be confirmed' };
  }

  const confirmed = await prisma.payrollRun.update({
    where: { id: runId },
    data: { status: 'confirmed', confirmedAt: new Date() },
  });
  return { success: true, run: confirmed };
}

export interface AddPersonToRunResult {
  success: boolean;
  entry?: PayrollEntry;
  error?: string;
}

// Unidad 11's manual exception — add someone to a run outside the automatic
// pre-load (e.g. their compensation was set up after the run was created).
// Same base-entry shape as createRun's pre-load.
export async function addPersonToRun(tenantId: string, runId: string, employeeId: string): Promise<AddPersonToRunResult> {
  const run = await prisma.payrollRun.findUnique({ where: { id: runId } });
  if (!run || run.tenantId !== tenantId) {
    return { success: false, error: 'Payroll run not found' };
  }
  if (run.status !== 'draft') {
    return { success: false, error: 'Only a draft run can have people added' };
  }

  const existing = await prisma.payrollEntry.findFirst({ where: { tenantId, runId, employeeId, type: 'base' } });
  if (existing) {
    return { success: false, error: 'This person is already on the run' };
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.tenantId !== tenantId) {
    return { success: false, error: 'Employee not found' };
  }

  const compensation = await prisma.employeeCompensation.findFirst({
    where: { tenantId, employeeId, effectiveTo: null },
  });
  if (!compensation) {
    return { success: false, error: 'This person has no active compensation record' };
  }

  const entry = await prisma.payrollEntry.create({
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
  return { success: true, entry };
}
