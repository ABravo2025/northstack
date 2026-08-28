import prisma from '../../lib/prisma.js';
import type { PayrollEntryType } from '@prisma/client';

export interface OffPaymentEntryInput {
  employeeId: string;
  amountCents: number;
  currency: string;
  label?: string | null;
}

export interface CreateOffPaymentsInput {
  tenantId: string;
  type: PayrollEntryType;
  paymentDate: string;
  entries: OffPaymentEntryInput[];
}

export interface OffPaymentEntryResult {
  employeeId: string;
  entryId: string;
}

// Unidad 19 — the loose (runId: null) entries side of the unified timeline.
export async function listOffPayments(tenantId: string) {
  const entries = await prisma.payrollEntry.findMany({
    where: { tenantId, runId: null },
    include: { employee: { select: { firstName: true, lastName: true } } },
    orderBy: { paymentDate: 'desc' },
  });
  // Flatten to employeeFirstName/employeeLastName, matching every other per-employee list
  // function in this module (payrollRunService, employeeCompensationService, etc.) — the frontend's
  // OffCyclePayrollEntry type expects flat fields, not the raw Prisma `employee` include.
  return entries.map(({ employee, ...entry }) => ({
    ...entry,
    employeeFirstName: employee.firstName,
    employeeLastName: employee.lastName,
  }));
}

// Unidad 18 — one-off/off-cycle payments, entirely outside any PayrollRun:
// each selected person gets their own independent PayrollEntry (runId:
// null), never grouped into a container entity.
export async function createOffPayments(input: CreateOffPaymentsInput): Promise<OffPaymentEntryResult[]> {
  const results: OffPaymentEntryResult[] = [];
  for (const entry of input.entries) {
    const created = await prisma.payrollEntry.create({
      data: {
        tenantId: input.tenantId,
        employeeId: entry.employeeId,
        runId: null,
        type: input.type,
        amountCents: entry.amountCents,
        currency: entry.currency,
        label: entry.label ?? null,
        paymentDate: new Date(input.paymentDate),
      },
    });
    results.push({ employeeId: entry.employeeId, entryId: created.id });
  }
  return results;
}
