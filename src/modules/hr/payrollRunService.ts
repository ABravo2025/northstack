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
  employee: { id: string; firstName: string; lastName: string; statusDefn: { id: string; name: string; color: string | null } };
  compensationType: 'hourly' | 'fixed' | null;
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
