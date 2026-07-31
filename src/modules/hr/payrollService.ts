import prisma from '../../lib/prisma.js';
import type { PayrollEntry, Prisma } from '@prisma/client';

export interface CreatePayrollEntryInput {
  tenantId: string;
  employeeId: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  amountCents: number;
  paymentDate: Date | string;
}

export interface UpdatePayrollEntryInput {
  employeeId?: string;
  periodStart?: Date | string;
  periodEnd?: Date | string;
  amountCents?: number;
  paymentDate?: Date | string;
}

export interface PayrollEntryResult {
  success: boolean;
  entry?: PayrollEntry;
  error?: string;
}

const payrollEntryInclude = {
  employee: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.PayrollEntryInclude;

function isValidAmount(amountCents: unknown): amountCents is number {
  return typeof amountCents === 'number' && Number.isInteger(amountCents) && amountCents > 0;
}

export async function createPayrollEntry(input: CreatePayrollEntryInput): Promise<PayrollEntryResult> {
  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);
  const paymentDate = new Date(input.paymentDate);

  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || Number.isNaN(paymentDate.getTime())) {
    return { success: false, error: 'Invalid period or payment date' };
  }
  if (periodEnd < periodStart) {
    return { success: false, error: 'Period end must be on or after the period start' };
  }
  if (!isValidAmount(input.amountCents)) {
    return { success: false, error: 'Amount must be a positive number of cents' };
  }

  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee || employee.tenantId !== input.tenantId) {
    return { success: false, error: 'Employee not found' };
  }

  const entry = await prisma.payrollEntry.create({
    data: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      periodStart,
      periodEnd,
      amountCents: input.amountCents,
      paymentDate,
    },
    include: payrollEntryInclude,
  });

  return { success: true, entry };
}

export async function findPayrollEntryById(id: string) {
  return prisma.payrollEntry.findUnique({ where: { id }, include: payrollEntryInclude });
}

export async function listPayrollEntries(tenantId: string) {
  return prisma.payrollEntry.findMany({
    where: { tenantId },
    include: payrollEntryInclude,
    orderBy: { paymentDate: 'desc' },
  });
}

export async function updatePayrollEntry(
  id: string,
  tenantId: string,
  input: UpdatePayrollEntryInput,
): Promise<PayrollEntryResult> {
  const existing = await prisma.payrollEntry.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== tenantId) {
    return { success: false, error: 'Payroll entry not found' };
  }

  if (input.employeeId !== undefined) {
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
    if (!employee || employee.tenantId !== tenantId) {
      return { success: false, error: 'Employee not found' };
    }
  }

  const periodStart = input.periodStart !== undefined ? new Date(input.periodStart) : existing.periodStart;
  const periodEnd = input.periodEnd !== undefined ? new Date(input.periodEnd) : existing.periodEnd;
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    return { success: false, error: 'Invalid period date' };
  }
  if (periodEnd < periodStart) {
    return { success: false, error: 'Period end must be on or after the period start' };
  }

  if (input.amountCents !== undefined && !isValidAmount(input.amountCents)) {
    return { success: false, error: 'Amount must be a positive number of cents' };
  }

  let paymentDate = existing.paymentDate;
  if (input.paymentDate !== undefined) {
    paymentDate = new Date(input.paymentDate);
    if (Number.isNaN(paymentDate.getTime())) {
      return { success: false, error: 'Invalid payment date' };
    }
  }

  // Whitelist explicitly — never spread req.body straight through (same rule
  // as every other update service in the app).
  const data: Prisma.PayrollEntryUncheckedUpdateInput = {};
  if (input.employeeId !== undefined) data.employeeId = input.employeeId;
  if (input.periodStart !== undefined) data.periodStart = periodStart;
  if (input.periodEnd !== undefined) data.periodEnd = periodEnd;
  if (input.amountCents !== undefined) data.amountCents = input.amountCents;
  if (input.paymentDate !== undefined) data.paymentDate = paymentDate;

  const entry = await prisma.payrollEntry.update({ where: { id }, data, include: payrollEntryInclude });
  return { success: true, entry };
}

export async function deletePayrollEntry(id: string): Promise<void> {
  await prisma.payrollEntry.delete({ where: { id } });
}
