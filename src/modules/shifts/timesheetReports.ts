import type { TimesheetStatus } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { addDays } from './shiftTime.js';

// Shifts module, Unidad 12 (spec-shifts.md) — hours reports and cost. Hours come from timesheet
// entries (approved weeks by default); the schedule cost from planned shifts. Cost = minutes × the
// person's HOURLY rate in effect that day (EmployeeCompensation, Payroll). Fixed salaries have no
// hourly rate, so those hours are counted as "without a rate" instead of guessed. Costs are only
// ever computed for viewers with Payroll access, when the company turned showScheduleCost on.

export type ReportGroup = 'person' | 'company' | 'project';
export type CostTotals = Record<string, number>; // currency → cents

// ---------------------------------------------------------------------------------------------
// Pure (tested)

export interface RateRow {
  employeeId: string;
  compensationType: 'hourly' | 'fixed';
  rateCents: number;
  currency: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

// The compensation in effect on `date` (YYYY-MM-DD), the most recent one if they overlap.
export function rateOn(rates: RateRow[], employeeId: string, date: string): RateRow | null {
  const day = new Date(`${date}T12:00:00Z`).getTime();
  let best: RateRow | null = null;
  for (const r of rates) {
    if (r.employeeId !== employeeId) continue;
    if (r.effectiveFrom.getTime() > day) continue;
    if (r.effectiveTo && r.effectiveTo.getTime() < new Date(`${date}T00:00:00Z`).getTime()) continue;
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  return best;
}

export function costCents(rateCents: number, minutes: number): number {
  return Math.round((rateCents * minutes) / 60);
}

export function addCost(totals: CostTotals, currency: string, cents: number): void {
  totals[currency] = (totals[currency] ?? 0) + cents;
}

// ---------------------------------------------------------------------------------------------

export async function loadRates(tenantId: string, employeeIds: string[], from: string, to: string): Promise<RateRow[]> {
  if (employeeIds.length === 0) return [];
  return prisma.employeeCompensation.findMany({
    where: {
      tenantId,
      employeeId: { in: employeeIds },
      effectiveFrom: { lte: new Date(`${to}T23:59:59Z`) },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(`${from}T00:00:00Z`) } }],
    },
    select: { employeeId: true, compensationType: true, rateCents: true, currency: true, effectiveFrom: true, effectiveTo: true },
  });
}

export interface ReportRow {
  key: string | null;
  name: string | null;
  // Logged in the timesheet, whatever the week's status, and the part already approved.
  minutes: number;
  approvedMinutes: number;
  billableMinutes: number;
  cost: CostTotals | null;
  // Logged hours whose person had no hourly rate that day (fixed salary or no compensation).
  minutesWithoutRate: number;
  // Planned (published shifts, accepted or still waiting for an answer). Per person only (a shift
  // has no company or project), and always in the totals.
  planned: PlannedMinutes | null;
  // Phase 2, block B (Growth): clocked time, late clock-ins and missed shifts. Per person and in
  // the totals; null without clock-in.
  attendance: Attendance | null;
  // Project rows only (phase 2, block C): the project's hour budget.
  budgetMinutes?: number | null;
}

export interface Attendance {
  clockedMinutes: number;
  late: number;
  absent: number;
}

export interface PlannedMinutes {
  total: number;
  past: number; // shifts that already ended
  upcoming: number;
  unconfirmed: number; // still waiting for the person's answer
}

export interface ReportEntry {
  date: string;
  person: string;
  company: string | null;
  project: string | null;
  source: string;
  description: string | null;
  minutes: number;
  billable: boolean;
  weekStatus: TimesheetStatus;
}

const MAX_CSV_ENTRIES = 5000;
const emptyPlanned = (): PlannedMinutes => ({ total: 0, past: 0, upcoming: 0, unconfirmed: 0 });

// Reports (Unidad 12; widened 2026-10-13 at Alejandro's request: "see absolutely everything —
// confirmed, pending and past hours — so we can be predictable"): for the month, what was planned
// (past / upcoming / still unconfirmed) next to what was logged (all of it, and the approved part).
export async function buildHoursReport(
  tenantId: string,
  opts: { from: string; to: string; groupBy: ReportGroup; withCost: boolean; now?: Date; attendance?: { lateToleranceMinutes: number } | null },
) {
  const now = opts.now ?? new Date();
  const range = { gte: new Date(`${opts.from}T00:00:00Z`), lte: new Date(`${opts.to}T00:00:00Z`) };
  const [entries, assignments] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { tenantId, date: range },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        timesheet: { select: { status: true } },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.shiftAssignment.findMany({
      where: { tenantId, status: { in: ['pending', 'accepted'] }, shift: { status: 'published', date: range } },
      select: {
        status: true,
        employee: { select: { id: true, firstName: true, lastName: true } },
        shift: { select: { date: true, startsAt: true, endsAt: true } },
      },
    }),
  ]);

  const employeeIds = [...new Set([...entries.map((e) => e.employeeId), ...assignments.map((a) => a.employee.id)])];
  const companyIds = [...new Set(entries.map((e) => e.companyId).filter((x): x is string => !!x))];
  const projectIds = [...new Set(entries.map((e) => e.projectId).filter((x): x is string => !!x))];
  const [companies, projects, rates] = await Promise.all([
    companyIds.length ? prisma.company.findMany({ where: { tenantId, id: { in: companyIds } }, select: { id: true, name: true } }) : [],
    projectIds.length ? prisma.project.findMany({ where: { tenantId, id: { in: projectIds } }, select: { id: true, name: true, budgetMinutes: true } }) : [],
    opts.withCost ? loadRates(tenantId, employeeIds, opts.from, opts.to) : Promise.resolve([]),
  ]);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const byPerson = opts.groupBy === 'person';
  const newRow = (key: string | null, name: string | null): ReportRow => ({
    key,
    name,
    minutes: 0,
    approvedMinutes: 0,
    billableMinutes: 0,
    cost: opts.withCost ? {} : null,
    minutesWithoutRate: 0,
    planned: byPerson ? emptyPlanned() : null,
    attendance: byPerson && opts.attendance ? { clockedMinutes: 0, late: 0, absent: 0 } : null,
  });
  const rows = new Map<string, ReportRow>();
  const rowFor = (key: string | null, name: string | null) => {
    const k = key ?? '__none__';
    const row = rows.get(k) ?? newRow(key, name);
    rows.set(k, row);
    return row;
  };
  const totals: ReportRow = { ...newRow(null, null), planned: emptyPlanned(), attendance: opts.attendance ? { clockedMinutes: 0, late: 0, absent: 0 } : null };
  const plannedCost: CostTotals | null = opts.withCost ? {} : null;

  for (const e of entries) {
    const date = e.date.toISOString().slice(0, 10);
    const row = byPerson
      ? rowFor(e.employeeId, `${e.employee.firstName} ${e.employee.lastName}`)
      : opts.groupBy === 'company'
        ? rowFor(e.companyId, e.companyId ? (companyName.get(e.companyId) ?? null) : null)
        : rowFor(e.projectId, e.projectId ? (projectName.get(e.projectId) ?? null) : null);
    for (const target of [row, totals]) {
      target.minutes += e.minutes;
      if (e.timesheet.status === 'approved') target.approvedMinutes += e.minutes;
      if (e.billable) target.billableMinutes += e.minutes;
    }
    if (opts.withCost) {
      const rate = rateOn(rates, e.employeeId, date);
      if (rate && rate.compensationType === 'hourly') {
        addCost(row.cost!, rate.currency, costCents(rate.rateCents, e.minutes));
        addCost(totals.cost!, rate.currency, costCents(rate.rateCents, e.minutes));
      } else {
        row.minutesWithoutRate += e.minutes;
        totals.minutesWithoutRate += e.minutes;
      }
    }
  }

  for (const a of assignments) {
    const minutes = Math.round((a.shift.endsAt.getTime() - a.shift.startsAt.getTime()) / 60000);
    const targets = [totals.planned!];
    if (byPerson) targets.push(rowFor(a.employee.id, `${a.employee.firstName} ${a.employee.lastName}`).planned!);
    for (const p of targets) {
      p.total += minutes;
      if (a.shift.endsAt <= now) p.past += minutes;
      else p.upcoming += minutes;
      if (a.status === 'pending') p.unconfirmed += minutes;
    }
    if (plannedCost) {
      const rate = rateOn(rates, a.employee.id, a.shift.date.toISOString().slice(0, 10));
      if (rate && rate.compensationType === 'hourly') addCost(plannedCost, rate.currency, costCents(rate.rateCents, minutes));
    }
  }

  if (opts.attendance) {
    const punches = await prisma.clockEntry.findMany({
      where: { tenantId, clockInAt: { gte: new Date(`${opts.from}T00:00:00Z`), lt: new Date(new Date(`${opts.to}T00:00:00Z`).getTime() + 86_400_000) } },
      select: { employeeId: true, clockInAt: true, clockOutAt: true, breakMinutes: true, status: true, shiftAssignmentId: true, employee: { select: { firstName: true, lastName: true } } },
    });
    const linked = await prisma.shiftAssignment.findMany({
      where: { id: { in: punches.map((p) => p.shiftAssignmentId).filter((x): x is string => !!x) } },
      select: { id: true, shift: { select: { startsAt: true, isOvertime: true } } },
    });
    const startOf = new Map(linked.map((a) => [a.id, a.shift]));
    for (const p of punches) {
      const targets = [totals.attendance!];
      if (byPerson) targets.push(rowFor(p.employeeId, `${p.employee.firstName} ${p.employee.lastName}`).attendance!);
      const minutes = p.clockOutAt ? Math.max(0, Math.round((p.clockOutAt.getTime() - p.clockInAt.getTime()) / 60_000) - p.breakMinutes) : 0;
      const shift = p.shiftAssignmentId ? startOf.get(p.shiftAssignmentId) : undefined;
      const late = !!shift && !shift.isOvertime && p.clockInAt.getTime() > shift.startsAt.getTime() + opts.attendance.lateToleranceMinutes * 60_000;
      for (const t of targets) {
        t.clockedMinutes += minutes;
        if (late) t.late += 1;
      }
    }
    // Missed: accepted, ended shifts at locations that use clock-in, with no punch at all.
    const clockedIds = new Set(punches.map((p) => p.shiftAssignmentId).filter(Boolean));
    const ended = await prisma.shiftAssignment.findMany({
      where: { tenantId, status: 'accepted', shift: { status: 'published', isOvertime: false, date: range, endsAt: { lte: now }, location: { clockMethod: { not: 'off' } } } },
      select: { id: true, employee: { select: { id: true, firstName: true, lastName: true } } },
    });
    const anyPunch = new Set(
      (await prisma.clockEntry.findMany({ where: { shiftAssignmentId: { in: ended.map((a) => a.id) } }, select: { shiftAssignmentId: true } })).map((e) => e.shiftAssignmentId),
    );
    for (const a of ended) {
      if (clockedIds.has(a.id) || anyPunch.has(a.id)) continue;
      totals.attendance!.absent += 1;
      if (byPerson) rowFor(a.employee.id, `${a.employee.firstName} ${a.employee.lastName}`).attendance!.absent += 1;
    }
  }

  if (opts.groupBy === 'project') {
    const budget = new Map(projects.map((p) => [p.id, p.budgetMinutes]));
    for (const row of rows.values()) row.budgetMinutes = row.key ? (budget.get(row.key) ?? null) : null;
  }

  const csv: ReportEntry[] = entries.slice(0, MAX_CSV_ENTRIES).map((e) => ({
    date: e.date.toISOString().slice(0, 10),
    person: `${e.employee.firstName} ${e.employee.lastName}`,
    company: e.companyId ? (companyName.get(e.companyId) ?? null) : null,
    project: e.projectId ? (projectName.get(e.projectId) ?? null) : null,
    source: e.source,
    description: e.description,
    minutes: e.minutes,
    billable: e.billable,
    weekStatus: e.timesheet.status,
  }));

  const size = (r: ReportRow) => Math.max(r.minutes, r.planned?.total ?? 0);
  return {
    rows: [...rows.values()].sort((a, b) => size(b) - size(a)),
    totals,
    plannedCost,
    entries: csv,
    truncated: entries.length > MAX_CSV_ENTRIES,
  };
}

// The planned cost of the schedule in a date range: every non-declined assignment of a published
// shift, at the person's hourly rate on the shift's date.
export async function scheduleCost(tenantId: string, from: string, to: string, locationIds: string[] | null) {
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      tenantId,
      status: { in: ['pending', 'accepted'] },
      shift: {
        status: 'published',
        date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) },
        ...(locationIds ? { locationId: { in: locationIds } } : {}),
      },
    },
    select: { employeeId: true, shift: { select: { date: true, startsAt: true, endsAt: true } } },
  });
  const rates = await loadRates(tenantId, [...new Set(assignments.map((a) => a.employeeId))], addDays(from, 0), to);
  const totals: CostTotals = {};
  let minutesWithoutRate = 0;
  for (const a of assignments) {
    const minutes = Math.round((a.shift.endsAt.getTime() - a.shift.startsAt.getTime()) / 60000);
    const rate = rateOn(rates, a.employeeId, a.shift.date.toISOString().slice(0, 10));
    if (rate && rate.compensationType === 'hourly') addCost(totals, rate.currency, costCents(rate.rateCents, minutes));
    else minutesWithoutRate += minutes;
  }
  return { totals, minutesWithoutRate };
}
