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
  minutes: number;
  billableMinutes: number;
  cost: CostTotals | null;
  // Hours whose person had no hourly rate that day (fixed salary or no compensation on file).
  minutesWithoutRate: number;
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

export async function buildHoursReport(
  tenantId: string,
  opts: { from: string; to: string; groupBy: ReportGroup; approvedOnly: boolean; withCost: boolean },
) {
  const entries = await prisma.timeEntry.findMany({
    where: {
      tenantId,
      date: { gte: new Date(`${opts.from}T00:00:00Z`), lte: new Date(`${opts.to}T00:00:00Z`) },
      timesheet: opts.approvedOnly ? { status: 'approved' } : {},
    },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true } },
      timesheet: { select: { status: true } },
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });

  const companyIds = [...new Set(entries.map((e) => e.companyId).filter((x): x is string => !!x))];
  const projectIds = [...new Set(entries.map((e) => e.projectId).filter((x): x is string => !!x))];
  const [companies, projects, rates] = await Promise.all([
    companyIds.length ? prisma.company.findMany({ where: { tenantId, id: { in: companyIds } }, select: { id: true, name: true } }) : [],
    projectIds.length ? prisma.project.findMany({ where: { tenantId, id: { in: projectIds } }, select: { id: true, name: true } }) : [],
    opts.withCost ? loadRates(tenantId, [...new Set(entries.map((e) => e.employeeId))], opts.from, opts.to) : Promise.resolve([]),
  ]);
  const companyName = new Map(companies.map((c) => [c.id, c.name]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  const rows = new Map<string, ReportRow>();
  const totals: ReportRow = { key: null, name: null, minutes: 0, billableMinutes: 0, cost: opts.withCost ? {} : null, minutesWithoutRate: 0 };
  for (const e of entries) {
    const date = e.date.toISOString().slice(0, 10);
    const key = opts.groupBy === 'person' ? e.employeeId : opts.groupBy === 'company' ? e.companyId : e.projectId;
    const name =
      opts.groupBy === 'person'
        ? `${e.employee.firstName} ${e.employee.lastName}`
        : opts.groupBy === 'company'
          ? (e.companyId ? (companyName.get(e.companyId) ?? null) : null)
          : (e.projectId ? (projectName.get(e.projectId) ?? null) : null);
    const mapKey = key ?? '__none__';
    const row = rows.get(mapKey) ?? { key, name, minutes: 0, billableMinutes: 0, cost: opts.withCost ? {} : null, minutesWithoutRate: 0 };
    for (const target of [row, totals]) {
      target.minutes += e.minutes;
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
    rows.set(mapKey, row);
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

  return {
    rows: [...rows.values()].sort((a, b) => b.minutes - a.minutes),
    totals,
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
