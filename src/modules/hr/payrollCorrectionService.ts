import prisma from '../../lib/prisma.js';
import { recordActivity } from '../activity/activityLogService.js';
import { payrollRunActivityFieldConfig } from '../activity/fieldConfigs/payrollRunFieldConfig.js';
import type { PayrollEntryType, PayrollRun } from '@prisma/client';

// Payroll v2 (Alejandro, 2026-10-26): fixing a confirmed run, two ways — whoever runs payroll
// picks the one that fits.
// - Void and reissue: the run is marked voided (reason required), its payslips stay with their
//   numbers marked void, and a new draft run with the same lines is created to fix and confirm
//   again (new numbers; a number is never reused).
// - Supplement: a new small draft run linked to the original, with only the missing or extra
//   adjustments; the original run and its payslips stay as they are.

export type CorrectionResult = { success: true; run: PayrollRun; voidedPayslipIds?: string[] } | { success: false; error: string };

const MAX_REASON = 500;
const SUPPLEMENT_TYPES: PayrollEntryType[] = ['bonus', 'commission', 'reimbursement', 'deduction'];

async function confirmedRun(tenantId: string, runId: string) {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, tenantId } });
  if (!run) return { error: 'Run not found' as const };
  if (run.status !== 'confirmed') return { error: 'Only a confirmed run can be corrected' as const };
  return { run };
}

export async function voidAndReissueRun(tenantId: string, runId: string, rawReason: unknown, changedByUserId: string): Promise<CorrectionResult> {
  const reason = typeof rawReason === 'string' ? rawReason.trim().slice(0, MAX_REASON) : '';
  if (reason.length < 3) return { success: false, error: 'A reason is required to void a pay run' };
  const found = await confirmedRun(tenantId, runId);
  if ('error' in found) return { success: false, error: found.error! };
  const original = found.run;
  const now = new Date();

  const { voided, reissue, payslipIds } = await prisma.$transaction(async (tx) => {
    const voided = await tx.payrollRun.update({ where: { id: runId }, data: { status: 'voided', voidedAt: now, voidedByUserId: changedByUserId, voidReason: reason } });
    const payslips = await tx.payslip.findMany({ where: { tenantId, runId, voidedAt: null }, select: { id: true } });
    await tx.payslip.updateMany({ where: { tenantId, runId, voidedAt: null }, data: { voidedAt: now, voidReason: reason } });
    const reissue = await tx.payrollRun.create({
      data: {
        tenantId,
        payFrequencyId: original.payFrequencyId,
        periodLabel: original.periodLabel,
        status: 'draft',
        createdByUserId: changedByUserId,
        paymentDate: original.paymentDate,
        correctionOfId: original.id,
        correctionKind: 'reissue',
      },
    });
    const entries = await tx.payrollEntry.findMany({ where: { tenantId, runId } });
    if (entries.length) {
      await tx.payrollEntry.createMany({
        data: entries.map((e) => ({
          tenantId,
          employeeId: e.employeeId,
          runId: reissue.id,
          type: e.type,
          amountCents: e.amountCents,
          currency: e.currency,
          hoursQty: e.hoursQty,
          label: e.label,
          paymentDate: e.paymentDate,
          hoursFrom: e.hoursFrom,
          hoursTo: e.hoursTo,
          hoursFromTimesheet: e.hoursFromTimesheet,
          overtimeKind: e.overtimeKind,
        })),
      });
    }
    return { voided, reissue, payslipIds: payslips.map((p) => p.id) };
  });

  await recordActivity({ tenantId, entityType: 'payrollRun', entityId: runId, entityLabel: `Payroll run: ${original.periodLabel}`, action: 'update', changedByUserId, before: original, after: voided, fieldConfig: payrollRunActivityFieldConfig });
  await recordActivity({ tenantId, entityType: 'payrollRun', entityId: reissue.id, entityLabel: `Payroll run: ${reissue.periodLabel}`, action: 'create', changedByUserId, after: reissue, fieldConfig: payrollRunActivityFieldConfig });
  return { success: true, run: reissue, voidedPayslipIds: payslipIds };
}

export interface SupplementLine {
  employeeId: string;
  type: PayrollEntryType;
  amountCents: number;
  label?: string;
}

export async function createSupplementRun(tenantId: string, runId: string, rawLines: unknown, changedByUserId: string): Promise<CorrectionResult> {
  const found = await confirmedRun(tenantId, runId);
  if ('error' in found) return { success: false, error: found.error! };
  const original = found.run;
  if (!Array.isArray(rawLines) || rawLines.length === 0 || rawLines.length > 200) return { success: false, error: 'Add at least one adjustment' };

  // Only people who were in the original run; each line in that person's currency there.
  const originalEntries = await prisma.payrollEntry.findMany({ where: { tenantId, runId }, select: { employeeId: true, currency: true } });
  const currencyOf = new Map(originalEntries.map((e) => [e.employeeId, e.currency]));
  const lines: SupplementLine[] = [];
  for (const raw of rawLines as Record<string, unknown>[]) {
    const employeeId = String(raw?.employeeId ?? '');
    const type = raw?.type as PayrollEntryType;
    const amount = Number(raw?.amountCents);
    if (!currencyOf.has(employeeId)) return { success: false, error: 'Every adjustment must be for someone in the original run' };
    if (!SUPPLEMENT_TYPES.includes(type)) return { success: false, error: 'Invalid adjustment type' };
    if (!Number.isInteger(amount) || amount === 0) return { success: false, error: 'Each adjustment needs an amount' };
    const label = typeof raw?.label === 'string' ? raw.label.trim().slice(0, 120) : '';
    // Deductions are always negative, everything else positive, whatever sign was typed.
    lines.push({ employeeId, type, amountCents: type === 'deduction' ? -Math.abs(amount) : Math.abs(amount), label: label || undefined });
  }

  const supplement = await prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.create({
      data: {
        tenantId,
        payFrequencyId: original.payFrequencyId,
        periodLabel: original.periodLabel,
        status: 'draft',
        createdByUserId: changedByUserId,
        paymentDate: original.paymentDate,
        correctionOfId: original.id,
        correctionKind: 'supplement',
      },
    });
    await tx.payrollEntry.createMany({
      data: lines.map((l) => ({
        tenantId,
        employeeId: l.employeeId,
        runId: run.id,
        type: l.type,
        amountCents: l.amountCents,
        currency: currencyOf.get(l.employeeId)!,
        label: l.label ?? null,
        paymentDate: original.paymentDate ?? new Date(),
      })),
    });
    return run;
  });

  await recordActivity({ tenantId, entityType: 'payrollRun', entityId: supplement.id, entityLabel: `Payroll run: ${supplement.periodLabel}`, action: 'create', changedByUserId, after: supplement, fieldConfig: payrollRunActivityFieldConfig });
  return { success: true, run: supplement };
}
