import prisma from '../../lib/prisma.js';
import type { Prisma, TimeOffAccrualMethod, TimeOffUnusedAction } from '@prisma/client';
import { allocatedDays, closeYear, computeBalance } from './timeOffRules.js';

export interface TimeOffBalance {
  employeeId: string;
  employeeFirstName: string;
  employeeLastName: string;
  timeOffPolicyId: string;
  policyName: string;
  color: string | null;
  accrualMethod: TimeOffAccrualMethod;
  daysPerYear: number;
  year: number;
  // Granted so far this year (all of it for fixed annual; month by month for monthly accrual).
  allocated: number;
  // What the whole year grants — the ceiling for asking in advance.
  fullYear: number;
  // Carried over from last year's unused days, and the net of manual +/- adjustments this year.
  carriedIn: number;
  adjusted: number;
  used: number;
  pending: number;
  // allocated − used (kept for older callers; doesn't count carried/adjusted/pending).
  remaining: number;
  // What the person can use right now with what's accrued, and the hard cap for a new request
  // (equal to `available`, or the full year when the policy allows asking in advance). Never < 0.
  available: number;
  maxRequestable: number;
  allowAdvance: boolean;
}

interface AssignmentRow {
  employeeId: string;
  employee: { firstName: string; lastName: string };
  timeOffPolicyId: string;
  timeOffPolicy: {
    name: string;
    color: string | null;
    accrualMethod: TimeOffAccrualMethod;
    daysPerYear: number;
    allowAdvance: boolean;
    unusedAction: TimeOffUnusedAction;
    carryOverMax: number | null;
  };
  assignedAt: Date;
}

const ASSIGNMENT_INCLUDE = { employee: { select: { firstName: true, lastName: true } }, timeOffPolicy: true } as const;

const yearRange = (year: number) => ({ gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) });
const pairKey = (employeeId: string, policyId: string) => `${employeeId}|${policyId}`;

interface YearTotals {
  used: Map<string, number>;
  pending: Map<string, number>;
  adjusted: Map<string, number>;
  carriedIn: Map<string, number>;
}

// Requests count against the year they start in; adjustments carry their own year; carry-in is
// what last year's close passed forward.
async function loadYearTotals(tenantId: string, year: number, employeeIds: string[]): Promise<YearTotals> {
  const [requests, adjustments, closes] = await Promise.all([
    prisma.timeOffRequest.findMany({
      where: { tenantId, employeeId: { in: employeeIds }, startDate: yearRange(year), status: { in: ['approved', 'pending'] } },
      select: { employeeId: true, timeOffPolicyId: true, status: true, daysRequested: true },
    }),
    prisma.timeOffAdjustment.findMany({
      where: { tenantId, employeeId: { in: employeeIds }, year },
      select: { employeeId: true, timeOffPolicyId: true, days: true },
    }),
    prisma.timeOffYearClose.findMany({
      where: { tenantId, employeeId: { in: employeeIds }, year: year - 1 },
      select: { employeeId: true, timeOffPolicyId: true, carriedDays: true },
    }),
  ]);
  const add = (map: Map<string, number>, key: string, n: number) => map.set(key, (map.get(key) ?? 0) + n);
  const totals: YearTotals = { used: new Map(), pending: new Map(), adjusted: new Map(), carriedIn: new Map() };
  for (const r of requests) add(r.status === 'approved' ? totals.used : totals.pending, pairKey(r.employeeId, r.timeOffPolicyId), r.daysRequested);
  for (const a of adjustments) add(totals.adjusted, pairKey(a.employeeId, a.timeOffPolicyId), a.days);
  for (const c of closes) add(totals.carriedIn, pairKey(c.employeeId, c.timeOffPolicyId), c.carriedDays);
  return totals;
}

// Records what happened to unused days for every finished year that hasn't been closed yet —
// lazily, the first time anyone reads balances after Dec 31, instead of relying on a cron at
// midnight. Idempotent: one row per person/policy/year (unique), so concurrent calls are harmless.
// Years are closed oldest first because each close's carry-in depends on the one before it.
const closedThrough = new Map<string, number>();

export async function ensureYearsClosed(tenantId: string, now: Date = new Date()): Promise<void> {
  const lastFinishedYear = now.getFullYear() - 1;
  if ((closedThrough.get(tenantId) ?? -Infinity) >= lastFinishedYear) return;

  const assignments: AssignmentRow[] = await prisma.employeeTimeOffPolicy.findMany({ where: { tenantId }, include: ASSIGNMENT_INCLUDE });
  if (assignments.length > 0) {
    const firstYear = Math.max(lastFinishedYear - 4, Math.min(...assignments.map((a) => a.assignedAt.getFullYear())));
    for (let year = firstYear; year <= lastFinishedYear; year++) {
      const due = assignments.filter((a) => a.assignedAt.getFullYear() <= year);
      if (due.length === 0) continue;
      const existing = await prisma.timeOffYearClose.findMany({ where: { tenantId, year }, select: { employeeId: true, timeOffPolicyId: true } });
      const done = new Set(existing.map((c) => pairKey(c.employeeId, c.timeOffPolicyId)));
      const open = due.filter((a) => !done.has(pairKey(a.employeeId, a.timeOffPolicyId)));
      if (open.length === 0) continue;
      const totals = await loadYearTotals(tenantId, year, [...new Set(open.map((a) => a.employeeId))]);
      const rows: Prisma.TimeOffYearCloseCreateManyInput[] = open.map((a) => {
        const key = pairKey(a.employeeId, a.timeOffPolicyId);
        const fullYear = allocatedDays(a.timeOffPolicy.accrualMethod, a.timeOffPolicy.daysPerYear, a.assignedAt, year, new Date(year, 11, 31, 23, 59, 59));
        const numbers = closeYear(
          fullYear,
          totals.carriedIn.get(key) ?? 0,
          totals.adjusted.get(key) ?? 0,
          totals.used.get(key) ?? 0,
          a.timeOffPolicy.unusedAction,
          a.timeOffPolicy.carryOverMax,
        );
        return { tenantId, employeeId: a.employeeId, timeOffPolicyId: a.timeOffPolicyId, year, ...numbers };
      });
      await prisma.timeOffYearClose.createMany({ data: rows, skipDuplicates: true });
    }
  }
  closedThrough.set(tenantId, lastFinishedYear);
}

async function buildBalances(assignments: AssignmentRow[], tenantId: string, now: Date = new Date()): Promise<TimeOffBalance[]> {
  if (assignments.length === 0) return [];
  await ensureYearsClosed(tenantId, now);
  const year = now.getFullYear();
  const totals = await loadYearTotals(tenantId, year, [...new Set(assignments.map((a) => a.employeeId))]);

  return assignments.map((a) => {
    const key = pairKey(a.employeeId, a.timeOffPolicyId);
    const used = totals.used.get(key) ?? 0;
    const pending = totals.pending.get(key) ?? 0;
    const carriedIn = totals.carriedIn.get(key) ?? 0;
    const adjusted = totals.adjusted.get(key) ?? 0;
    const numbers = computeBalance({
      accrualMethod: a.timeOffPolicy.accrualMethod,
      daysPerYear: a.timeOffPolicy.daysPerYear,
      assignedAt: a.assignedAt,
      allowAdvance: a.timeOffPolicy.allowAdvance,
      year,
      now,
      used,
      pending,
      carriedIn,
      adjusted,
    });
    return {
      employeeId: a.employeeId,
      employeeFirstName: a.employee.firstName,
      employeeLastName: a.employee.lastName,
      timeOffPolicyId: a.timeOffPolicyId,
      policyName: a.timeOffPolicy.name,
      color: a.timeOffPolicy.color,
      accrualMethod: a.timeOffPolicy.accrualMethod,
      daysPerYear: a.timeOffPolicy.daysPerYear,
      year,
      allocated: numbers.allocated,
      fullYear: numbers.fullYear,
      carriedIn,
      adjusted,
      used,
      pending,
      remaining: Math.round((numbers.allocated - used) * 100) / 100,
      available: numbers.available,
      maxRequestable: numbers.maxRequestable,
      allowAdvance: a.timeOffPolicy.allowAdvance,
    };
  });
}

export async function calculateEmployeeTimeOffBalances(tenantId: string, employeeId: string): Promise<TimeOffBalance[]> {
  const assignments = await prisma.employeeTimeOffPolicy.findMany({ where: { tenantId, employeeId }, include: ASSIGNMENT_INCLUDE });
  return buildBalances(assignments, tenantId);
}

// One person + one policy — what request creation and manual adjustments check against.
export async function calculatePolicyBalance(tenantId: string, employeeId: string, timeOffPolicyId: string): Promise<TimeOffBalance | null> {
  const assignments = await prisma.employeeTimeOffPolicy.findMany({ where: { tenantId, employeeId, timeOffPolicyId }, include: ASSIGNMENT_INCLUDE });
  const [balance] = await buildBalances(assignments, tenantId);
  return balance ?? null;
}

// A manager's direct reports only (employee.managerId = the manager's own employee record) —
// what the Time Off "Team" view shows a manager who isn't a tenant-wide admin. Same balance
// math as the admin-wide list, just a narrower set of assignments.
export async function calculateTeamTimeOffBalances(tenantId: string, managerEmployeeId: string): Promise<TimeOffBalance[]> {
  const assignments = await prisma.employeeTimeOffPolicy.findMany({
    where: { tenantId, employee: { managerId: managerEmployeeId } },
    include: ASSIGNMENT_INCLUDE,
  });
  return buildBalances(assignments, tenantId);
}

export async function calculateAllTimeOffBalances(tenantId: string): Promise<TimeOffBalance[]> {
  const assignments = await prisma.employeeTimeOffPolicy.findMany({ where: { tenantId }, include: ASSIGNMENT_INCLUDE });
  return buildBalances(assignments, tenantId);
}
