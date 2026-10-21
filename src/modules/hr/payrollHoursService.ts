import prisma from '../../lib/prisma.js';
import { recordActivity } from '../activity/activityLogService.js';
import { payrollRunActivityFieldConfig } from '../activity/fieldConfigs/payrollRunFieldConfig.js';

// Timesheet → Payroll (Alejandro, 2026-10-21): "Bring approved hours" fills the hours of every
// hourly person in a DRAFT pay run with what their APPROVED timesheet weeks logged in the chosen
// period (adjustment entries included, by their own date). Weeks not approved yet are left out and
// listed, so whoever runs payroll can chase them first. Hours can still be edited by hand after.
// Each person sees the hours that went to payroll on their own Timesheet — hours only, never money.

type Result<T> = { success: true; value: T } | { success: false; error: string; field?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const dayString = (d: Date) => d.toISOString().slice(0, 10);

// Pure (tested): minutes → hours with 2 decimals, the way payroll stores them.
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function parsePeriod(from: unknown, to: unknown): Result<{ from: string; to: string }> {
  if (typeof from !== 'string' || !DATE.test(from) || Number.isNaN(toDate(from).getTime())) return { success: false, error: 'Pick the start of the period', field: 'from' };
  if (typeof to !== 'string' || !DATE.test(to) || Number.isNaN(toDate(to).getTime())) return { success: false, error: 'Pick the end of the period', field: 'to' };
  if (from > to) return { success: false, error: 'The period ends before it starts', field: 'to' };
  if ((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000 > 62) return { success: false, error: 'Pick at most two months', field: 'to' };
  return { success: true, value: { from, to } };
}

export interface ImportedHours {
  employeeId: string;
  name: string;
  minutes: number;
  hours: number;
}

export interface PendingWeeks {
  employeeId: string;
  name: string;
  weeks: { weekStart: string; status: string }[];
}

export async function importApprovedHours(
  tenantId: string,
  runId: string,
  input: { from: unknown; to: unknown },
  actorUserId: string,
): Promise<Result<{ updated: ImportedHours[]; pending: PendingWeeks[]; from: string; to: string }>> {
  const period = parsePeriod(input.from, input.to);
  if (!period.success) return period;
  const { from, to } = period.value;

  const run = await prisma.payrollRun.findFirst({ where: { id: runId, tenantId } });
  if (!run) return { success: false, error: 'Pay run not found' };
  if (run.status !== 'draft') return { success: false, error: 'This run is already confirmed' };

  const baseEntries = await prisma.payrollEntry.findMany({
    where: { tenantId, runId, type: 'base' },
    include: { employee: { select: { id: true, firstName: true, lastName: true } } },
  });
  const comps = await prisma.employeeCompensation.findMany({
    where: { tenantId, employeeId: { in: baseEntries.map((e) => e.employeeId) }, effectiveTo: null, compensationType: 'hourly' },
    select: { employeeId: true, rateCents: true },
  });
  const rate = new Map(comps.map((c) => [c.employeeId, c.rateCents]));
  const hourly = baseEntries.filter((e) => rate.has(e.employeeId));
  if (hourly.length === 0) return { success: false, error: 'Nobody in this run is paid by the hour' };
  const ids = hourly.map((e) => e.employeeId);

  const [logged, openWeeks] = await Promise.all([
    prisma.timeEntry.groupBy({
      by: ['employeeId'],
      where: { tenantId, employeeId: { in: ids }, date: { gte: toDate(from), lte: toDate(to) }, timesheet: { status: 'approved' } },
      _sum: { minutes: true },
    }),
    // Weeks touching the period that aren't approved and have hours in it.
    prisma.timesheet.findMany({
      where: {
        tenantId,
        employeeId: { in: ids },
        status: { not: 'approved' },
        entries: { some: { date: { gte: toDate(from), lte: toDate(to) } } },
      },
      select: { employeeId: true, weekStart: true, status: true },
      orderBy: { weekStart: 'asc' },
    }),
  ]);
  const minutes = new Map(logged.map((l) => [l.employeeId, l._sum.minutes ?? 0]));
  const name = (e: (typeof hourly)[number]) => `${e.employee.firstName} ${e.employee.lastName}`.trim();

  const updated: ImportedHours[] = [];
  await prisma.$transaction(
    hourly.map((e) => {
      const m = Math.max(0, minutes.get(e.employeeId) ?? 0);
      const hours = minutesToHours(m);
      updated.push({ employeeId: e.employeeId, name: name(e), minutes: m, hours });
      return prisma.payrollEntry.update({
        where: { id: e.id },
        data: { hoursQty: hours, amountCents: Math.round(hours * rate.get(e.employeeId)!), hoursFrom: toDate(from), hoursTo: toDate(to), hoursFromTimesheet: true },
      });
    }),
  );

  const pending: PendingWeeks[] = [];
  for (const e of hourly) {
    const weeks = openWeeks.filter((w) => w.employeeId === e.employeeId).map((w) => ({ weekStart: dayString(w.weekStart), status: w.status }));
    if (weeks.length) pending.push({ employeeId: e.employeeId, name: name(e), weeks });
  }

  await recordActivity({
    tenantId,
    entityType: 'payrollRun',
    entityId: run.id,
    entityLabel: `Payroll run: ${run.periodLabel}`,
    action: 'update',
    changedByUserId: actorUserId,
    before: { hoursImport: null },
    after: { hoursImport: `${from} – ${to} (${updated.length})` },
    fieldConfig: payrollRunActivityFieldConfig,
  }).catch(() => undefined);

  return { success: true, value: { updated: updated.sort((a, b) => a.name.localeCompare(b.name)), pending, from, to } };
}

// The person's own view (Timesheet → "Hours sent to payroll"): hours only, never amounts.
export async function listMyPayrollHours(tenantId: string, employeeId: string) {
  const rows = await prisma.payrollEntry.findMany({
    where: { tenantId, employeeId, type: 'base', hoursQty: { not: null }, runId: { not: null } },
    include: { run: { select: { periodLabel: true, status: true, confirmedAt: true, createdAt: true } } },
    orderBy: { createdAt: 'desc' },
    take: 24,
  });
  return rows.map((r) => ({
    id: r.id,
    periodLabel: r.run!.periodLabel,
    status: r.run!.status,
    confirmedAt: r.run!.confirmedAt,
    hours: r.hoursQty!,
    from: r.hoursFrom ? dayString(r.hoursFrom) : null,
    to: r.hoursTo ? dayString(r.hoursTo) : null,
    fromTimesheet: r.hoursFromTimesheet,
  }));
}
