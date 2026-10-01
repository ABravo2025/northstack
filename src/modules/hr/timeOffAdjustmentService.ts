import prisma from '../../lib/prisma.js';
import type { TimeOffAdjustment, TimeOffYearClose } from '@prisma/client';
import { recordActivity } from '../activity/activityLogService.js';
import { timeOffAdjustmentActivityFieldConfig } from '../activity/fieldConfigs/timeOffAdjustmentFieldConfig.js';
import { calculatePolicyBalance, ensureYearsClosed } from './timeOffBalanceService.js';

// Manual +/- days on one person's balance of one policy (2026-10) — e.g. compensation for an
// on-call weekend, or taking back days granted by mistake. Applies to the current year and can
// never leave the balance negative.

export interface CreateAdjustmentInput {
  timeOffPolicyId?: unknown;
  days?: unknown;
  reason?: unknown;
}

type Result<T> = { success: true; value: T } | { success: false; error: string; field?: string };

export async function createTimeOffAdjustment(
  tenantId: string,
  employeeId: string,
  input: CreateAdjustmentInput,
  changedByUserId: string,
): Promise<Result<TimeOffAdjustment>> {
  if (typeof input.timeOffPolicyId !== 'string') return { success: false, error: 'Pick a policy', field: 'timeOffPolicyId' };
  const days = typeof input.days === 'number' ? input.days : Number.NaN;
  if (!Number.isFinite(days) || days === 0 || Math.abs(days) > 365 || Math.round(days * 2) !== days * 2) {
    return { success: false, error: 'Days must be a non-zero whole or half number', field: 'days' };
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!reason) return { success: false, error: 'Explain why — the person sees this reason', field: 'reason' };
  if (reason.length > 300) return { success: false, error: 'Reason is too long', field: 'reason' };

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { tenantId: true, firstName: true, lastName: true } });
  if (!employee || employee.tenantId !== tenantId) return { success: false, error: 'Employee not found' };
  const balance = await calculatePolicyBalance(tenantId, employeeId, input.timeOffPolicyId);
  if (!balance) return { success: false, error: 'That policy is not assigned to this person', field: 'timeOffPolicyId' };

  // Taking days away: the whole year's balance (incl. what's in review) must stay at or above 0.
  if (days < 0) {
    const left = balance.fullYear + balance.carriedIn + balance.adjusted - balance.used - balance.pending;
    if (left + days < 0) {
      return { success: false, error: `That would leave a negative balance — at most ${Math.max(0, left)} days can be taken away`, field: 'days' };
    }
  }

  const adjustment = await prisma.timeOffAdjustment.create({
    data: { tenantId, employeeId, timeOffPolicyId: input.timeOffPolicyId, year: balance.year, days, reason, createdByUserId: changedByUserId },
  });

  await recordActivity({
    tenantId,
    entityType: 'timeOffAdjustment',
    entityId: adjustment.id,
    entityLabel: `${employee.firstName} ${employee.lastName} — ${balance.policyName} ${days > 0 ? '+' : ''}${days}`,
    action: 'create',
    changedByUserId,
    after: { policyName: balance.policyName, year: balance.year, days, reason },
    fieldConfig: timeOffAdjustmentActivityFieldConfig,
    parentEntityType: 'employee',
    parentEntityId: employeeId,
  });

  return { success: true, value: adjustment };
}

export interface TimeOffLedger {
  adjustments: (TimeOffAdjustment & { policyName: string; createdByName: string | null })[];
  yearCloses: (TimeOffYearClose & { policyName: string })[];
}

// The person's manual adjustments and year-end closes, newest first — shown in their Time Off
// panel next to the request history.
export async function getTimeOffLedger(tenantId: string, employeeId: string): Promise<TimeOffLedger> {
  await ensureYearsClosed(tenantId);
  const [adjustments, yearCloses] = await Promise.all([
    prisma.timeOffAdjustment.findMany({ where: { tenantId, employeeId }, include: { timeOffPolicy: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.timeOffYearClose.findMany({ where: { tenantId, employeeId }, include: { timeOffPolicy: { select: { name: true } } }, orderBy: [{ year: 'desc' }] }),
  ]);
  const userIds = [...new Set(adjustments.map((a) => a.createdByUserId))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const nameOf = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  return {
    adjustments: adjustments.map(({ timeOffPolicy, ...a }) => ({ ...a, policyName: timeOffPolicy.name, createdByName: nameOf.get(a.createdByUserId) ?? null })),
    yearCloses: yearCloses.map(({ timeOffPolicy, ...c }) => ({ ...c, policyName: timeOffPolicy.name })),
  };
}
