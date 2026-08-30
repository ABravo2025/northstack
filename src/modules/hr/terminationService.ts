import prisma from '../../lib/prisma.js';
import { createOffPayments } from './payrollOffPaymentService.js';
import { syncTimeOffCalendarEvent } from '../integrations/googleCalendarSyncService.js';
import { findEmployeeById, wouldCreateManagerCycle } from './employeeService.js';
import type { EmployeeTermination, PayrollEntryType } from '@prisma/client';

// Termination is a status change with several coordinated side effects, not a delete — matches
// the "hide, don't destroy" pattern already used for Contact/Opportunity (isActive). Every
// termination is recorded here (never overwritten/deleted) so there's an audit trail of who was
// let go, when, and by whom — same instinct as StatusHistoryEntry, just for this one business
// event instead of generic status changes.

// Not part of statusService.ts's DEFAULT_STATUSES (seeded at tenant creation) — created on demand,
// the first time any employee in a tenant is actually terminated, so existing tenants never need a
// backfill migration. Never set as isDefault.
async function getOrCreateTerminatedStatusId(tenantId: string): Promise<string> {
  const existing = await prisma.statusDefinition.findFirst({
    where: { tenantId, entityType: 'employee', name: 'Terminated' },
  });
  if (existing) return existing.id;

  const maxOrder = await prisma.statusDefinition.aggregate({
    where: { tenantId, entityType: 'employee' },
    _max: { order: true },
  });
  const created = await prisma.statusDefinition.create({
    data: {
      tenantId,
      entityType: 'employee',
      name: 'Terminated',
      order: (maxOrder._max.order ?? 0) + 1,
      isDefault: false,
    },
  });
  return created.id;
}

export interface DirectReportSummary {
  id: string;
  firstName: string;
  lastName: string;
}

export async function listDirectReports(employeeId: string): Promise<DirectReportSummary[]> {
  return prisma.employee.findMany({
    where: { managerId: employeeId },
    select: { id: true, firstName: true, lastName: true },
  });
}

// The most recent not-yet-cancelled termination for this employee — executed (past) or still
// scheduled. Used both to block creating a duplicate and to show "Scheduled termination: ..." on
// the profile instead of the "Terminate" button.
export async function getLatestTermination(employeeId: string): Promise<EmployeeTermination | null> {
  return prisma.employeeTermination.findFirst({
    where: { employeeId, cancelledAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

// Bonus/commission/reimbursement/deduction — the same adjustment types a normal payroll run
// offers (payrollEntryService.createAdjustment), minus 'base' which isn't user-selectable there
// either (it's the implicit primary line, same role the amount/currency/date fields play below).
export interface FinalPaymentLineInput {
  type: Exclude<PayrollEntryType, 'base'>;
  amountCents: number;
  label?: string | null;
}

export interface FinalPaymentInput {
  amountCents: number;
  currency: string;
  paymentDate: string;
  label?: string | null;
  additionalLines?: FinalPaymentLineInput[];
}

export interface CreateTerminationInput {
  tenantId: string;
  employeeId: string;
  terminationDate: string; // ISO date, can be past/today/future
  revokeAccess: boolean;
  createdByUserId: string;
  reassignments?: { reportEmployeeId: string; newManagerId: string | null }[];
  finalPayment?: FinalPaymentInput;
}

export interface CreateTerminationResult {
  termination: EmployeeTermination;
  executedNow: boolean;
}

export async function createTermination(input: CreateTerminationInput): Promise<CreateTerminationResult> {
  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee || employee.tenantId !== input.tenantId) {
    throw new Error('Employee not found');
  }

  const terminatedStatusId = await getOrCreateTerminatedStatusId(input.tenantId);
  if (employee.statusId === terminatedStatusId) {
    throw new Error('This employee is already terminated');
  }

  const existingPending = await getLatestTermination(input.employeeId);
  if (existingPending && !existingPending.executedAt) {
    throw new Error('This employee already has a scheduled termination — cancel it first');
  }

  const terminationDate = new Date(input.terminationDate);
  if (Number.isNaN(terminationDate.getTime())) {
    throw new Error('Invalid termination date');
  }

  // Direct reports not explicitly reassigned still need a row (newManagerId: null) so
  // executeTermination clears their managerId instead of silently leaving it pointed at someone
  // who no longer manages anyone — built here from the full list, not just what the admin touched.
  const directReports = await listDirectReports(input.employeeId);
  const chosen = new Map((input.reassignments ?? []).map((r) => [r.reportEmployeeId, r.newManagerId]));
  const reassignmentRows = directReports.map((report) => ({
    reportEmployeeId: report.id,
    newManagerId: chosen.get(report.id) ?? null,
  }));

  // newManagerId comes straight from the caller's request body — unlike the ordinary
  // PATCH /employees/:id path (routes/employees.ts), which validates a new managerId belongs to
  // the same tenant and wouldn't create a reporting cycle. Without the same checks here, a crafted
  // termination request could point a report's managerId at another tenant's employee entirely.
  for (const row of reassignmentRows) {
    if (!row.newManagerId) continue;
    const manager = await findEmployeeById(row.newManagerId);
    if (!manager || manager.tenantId !== input.tenantId) {
      throw new Error('Reassignment manager not found');
    }
    if (await wouldCreateManagerCycle(row.reportEmployeeId, row.newManagerId)) {
      throw new Error('This reassignment would create a reporting cycle');
    }
  }

  const finalPaymentEntryIds: string[] = [];
  if (input.finalPayment) {
    // Independent of whether the termination itself is immediate or scheduled — an off-cycle
    // PayrollEntry (payrollOffPaymentService.ts, existing Payroll Unit 18/19) already carries its
    // own paymentDate, so it's created right away regardless. One createOffPayments call per line
    // since it only takes a single `type` per call — the primary payment plus each additional
    // bonus/commission/reimbursement/deduction line all become their own PayrollEntry.
    const lines: { type: PayrollEntryType; amountCents: number; label?: string | null }[] = [
      { type: 'base', amountCents: input.finalPayment.amountCents, label: input.finalPayment.label ?? 'Final payment' },
      ...(input.finalPayment.additionalLines ?? []),
    ];
    for (const line of lines) {
      const [result] = await createOffPayments({
        tenantId: input.tenantId,
        type: line.type,
        paymentDate: input.finalPayment.paymentDate,
        entries: [
          {
            employeeId: input.employeeId,
            amountCents: line.amountCents,
            currency: input.finalPayment.currency,
            label: line.label,
          },
        ],
      });
      finalPaymentEntryIds.push(result.entryId);
    }
  }

  const termination = await prisma.employeeTermination.create({
    data: {
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      terminationDate,
      revokeAccess: input.revokeAccess,
      finalPaymentEntryIds,
      createdByUserId: input.createdByUserId,
      reassignments: { create: reassignmentRows },
    },
  });

  const isDue = terminationDate.getTime() <= Date.now();
  if (isDue) {
    await executeTermination(termination.id);
    const executed = await prisma.employeeTermination.findUniqueOrThrow({ where: { id: termination.id } });
    return { termination: executed, executedNow: true };
  }

  return { termination, executedNow: false };
}

export interface CancelTerminationResult {
  success: boolean;
  error?: string;
}

export async function cancelTermination(terminationId: string, tenantId: string): Promise<CancelTerminationResult> {
  const termination = await prisma.employeeTermination.findUnique({ where: { id: terminationId } });
  if (!termination || termination.tenantId !== tenantId) {
    return { success: false, error: 'Termination not found' };
  }
  if (termination.executedAt) {
    return { success: false, error: 'This termination already took effect and cannot be cancelled' };
  }
  if (termination.cancelledAt) {
    return { success: true }; // already cancelled — idempotent, not an error
  }

  await prisma.employeeTermination.update({ where: { id: terminationId }, data: { cancelledAt: new Date() } });
  return { success: true };
}

// Applies every effect of a termination — reused by the immediate path (createTermination, above)
// and by the daily cron (runScheduledTerminations, below) for terminations whose date has arrived.
// Not wrapped in a single prisma.$transaction: syncTimeOffCalendarEvent makes real Google Calendar
// API calls per request, which can't run inside a DB transaction — each step below is already
// individually safe to retry/re-run (find-or-create status, idempotent field sets), so a partial
// failure just means the remaining steps get retried on the next cron pass rather than losing work.
async function executeTermination(terminationId: string): Promise<void> {
  const termination = await prisma.employeeTermination.findUniqueOrThrow({
    where: { id: terminationId },
    include: { reassignments: true },
  });
  const { employeeId, tenantId, terminationDate } = termination;

  const terminatedStatusId = await getOrCreateTerminatedStatusId(tenantId);
  const employee = await prisma.employee.update({
    where: { id: employeeId },
    data: { statusId: terminatedStatusId, endDate: terminationDate },
  });

  const openCompensation = await prisma.employeeCompensation.findFirst({
    where: { employeeId, effectiveTo: null },
  });
  if (openCompensation) {
    await prisma.employeeCompensation.update({
      where: { id: openCompensation.id },
      data: { effectiveTo: terminationDate },
    });
  }

  if (termination.revokeAccess && employee.userId) {
    await prisma.user.update({ where: { id: employee.userId }, data: { status: 'inactive' } });
  }

  const requestsToClear = await prisma.timeOffRequest.findMany({
    where: {
      employeeId,
      OR: [{ status: 'pending' }, { status: 'approved', startDate: { gte: terminationDate } }],
    },
  });
  for (const request of requestsToClear) {
    const updated = await prisma.timeOffRequest.update({
      where: { id: request.id },
      data: { status: 'cancelled', decidedAt: new Date() },
    });
    // Best-effort, same as every other call site of this function — a Google Calendar hiccup must
    // never block the termination itself from completing.
    await syncTimeOffCalendarEvent(request, updated).catch((err) =>
      console.error('Google Calendar time off sync failed during termination:', err),
    );
  }

  for (const reassignment of termination.reassignments) {
    await prisma.employee.update({
      where: { id: reassignment.reportEmployeeId },
      data: { managerId: reassignment.newManagerId },
    });
  }

  await prisma.employeeTermination.update({ where: { id: terminationId }, data: { executedAt: new Date() } });
}

// Daily cron (src/routes/internal.ts) — same "a failure for one doesn't stop the rest" shape as
// runStripeEventPolling/renewExpiringWatchChannels.
export async function runScheduledTerminations(): Promise<{ checked: number; executed: number; failed: number }> {
  const due = await prisma.employeeTermination.findMany({
    where: { terminationDate: { lte: new Date() }, executedAt: null, cancelledAt: null },
  });

  let executed = 0;
  let failed = 0;
  for (const termination of due) {
    try {
      await executeTermination(termination.id);
      executed++;
    } catch (err) {
      failed++;
      console.error(`Scheduled termination ${termination.id} failed to execute:`, err);
    }
  }

  return { checked: due.length, executed, failed };
}
