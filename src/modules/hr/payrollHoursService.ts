import prisma from '../../lib/prisma.js';
import { recordActivity } from '../activity/activityLogService.js';
import { payrollRunActivityFieldConfig } from '../activity/fieldConfigs/payrollRunFieldConfig.js';
import { getShiftsSettings } from '../shifts/shiftsSettingsService.js';
import { zonedParts } from '../shifts/shiftTime.js';
import { activeOvertimeRules } from './overtimePolicyService.js';
import { computeOvertime, weekStartOf, type DayInput, type OvertimeRules } from './overtimeRules.js';

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
  // spec-overtime.md, when the company has overtime rules and the person isn't exempt.
  overtime?: { regularHours: number; weekdayHours: number; restHours: number; nightHours: number };
}

const LINE_LABELS: Record<'en' | 'es', Record<'weekday' | 'rest' | 'night', (pct: number) => string>> = {
  en: { weekday: (p) => `Overtime +${p}%`, rest: (p) => `Overtime, rest day / holiday +${p}%`, night: (p) => `Night surcharge +${p}%` },
  es: { weekday: (p) => `Horas extra +${p} %`, rest: (p) => `Horas extra en descanso / feriado +${p} %`, night: (p) => `Recargo nocturno +${p} %` },
};

const addDay = (d: string, n: number) => dayString(new Date(toDate(d).getTime() + n * 86_400_000));
const localDay = (p: { year: number; month: number; day: number }) => `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;

// Approved minutes per day for each person, plus when they worked (clock-in first, else the
// accepted shift, in the location's time zone) and the company's days off — what the rules need.
async function loadDays(tenantId: string, ids: string[], from: string, to: string): Promise<Map<string, DayInput[]>> {
  const [entries, holidays, clocks, shifts] = await Promise.all([
    prisma.timeEntry.groupBy({
      by: ['employeeId', 'date'],
      where: { tenantId, employeeId: { in: ids }, date: { gte: toDate(from), lte: toDate(to) }, timesheet: { status: 'approved' } },
      _sum: { minutes: true },
    }),
    prisma.timeOffHoliday.findMany({ where: { tenantId, isOff: true, kind: { not: 'religious' }, date: { gte: toDate(from), lte: toDate(to) } }, select: { date: true } }),
    prisma.clockEntry.findMany({
      where: { tenantId, employeeId: { in: ids }, clockOutAt: { not: null }, clockInAt: { gte: new Date(toDate(from).getTime() - 86_400_000), lte: new Date(toDate(to).getTime() + 2 * 86_400_000) } },
      select: { employeeId: true, clockInAt: true, clockOutAt: true, location: { select: { timezone: true } } },
    }),
    prisma.shiftAssignment.findMany({
      where: { employeeId: { in: ids }, status: 'accepted', shift: { tenantId, status: { not: 'cancelled' }, date: { gte: toDate(addDay(from, -1)), lte: toDate(to) } } },
      select: { employeeId: true, shift: { select: { date: true, startMinute: true, endMinute: true } } },
    }),
  ]);
  const holidaySet = new Set(holidays.map((h) => dayString(h.date)));
  // employee|date → intervals
  const clocked = new Map<string, { start: number; end: number }[]>();
  const planned = new Map<string, { start: number; end: number }[]>();
  const push = (map: Map<string, { start: number; end: number }[]>, key: string, start: number, end: number) => {
    if (end > start) map.set(key, [...(map.get(key) ?? []), { start, end }]);
  };
  for (const c of clocks) {
    const a = zonedParts(c.clockInAt, c.location.timezone);
    const b = zonedParts(c.clockOutAt!, c.location.timezone);
    const aDay = localDay(a);
    const bDay = localDay(b);
    const aMin = a.hour * 60 + a.minute;
    const bMin = b.hour * 60 + b.minute;
    if (aDay === bDay) push(clocked, `${c.employeeId}|${aDay}`, aMin, bMin);
    else {
      push(clocked, `${c.employeeId}|${aDay}`, aMin, 1440);
      push(clocked, `${c.employeeId}|${bDay}`, 0, bMin);
    }
  }
  for (const a of shifts) {
    const d = dayString(a.shift.date);
    if (a.shift.endMinute > a.shift.startMinute) push(planned, `${a.employeeId}|${d}`, a.shift.startMinute, a.shift.endMinute);
    else {
      push(planned, `${a.employeeId}|${d}`, a.shift.startMinute, 1440);
      push(planned, `${a.employeeId}|${addDay(d, 1)}`, 0, a.shift.endMinute);
    }
  }
  const out = new Map<string, DayInput[]>();
  for (const e of entries) {
    const date = dayString(e.date);
    const key = `${e.employeeId}|${date}`;
    out.set(e.employeeId, [
      ...(out.get(e.employeeId) ?? []),
      { date, minutes: e._sum.minutes ?? 0, holiday: holidaySet.has(date), intervals: clocked.get(key) ?? planned.get(key) ?? [] },
    ]);
  }
  return out;
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
  locale: string | null = null,
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
    select: { employeeId: true, rateCents: true, currency: true, employee: { select: { overtimeExempt: true } } },
  });
  const exempt = new Set(comps.filter((c) => c.employee.overtimeExempt).map((c) => c.employeeId));
  const currency = new Map(comps.map((c) => [c.employeeId, c.currency]));
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

  // Overtime (spec-overtime.md): the week the period starts in is loaded whole, so the weekly limit
  // counts the days the previous run already paid.
  const rules: OvertimeRules | null = await activeOvertimeRules(tenantId);
  const weekStartsOn = rules ? (await getShiftsSettings(tenantId)).weekStartsOn : 1;
  const days = rules ? await loadDays(tenantId, ids.filter((id) => !exempt.has(id)), weekStartOf(from, weekStartsOn), to) : new Map<string, DayInput[]>();
  const labels = LINE_LABELS[locale?.startsWith('es') ? 'es' : 'en'];

  const updated: ImportedHours[] = [];
  const writes = [];
  for (const e of hourly) {
    const m = Math.max(0, minutes.get(e.employeeId) ?? 0);
    const r = rate.get(e.employeeId)!;
    const base = { hoursFrom: toDate(from), hoursTo: toDate(to), hoursFromTimesheet: true };
    // A new import replaces the overtime lines of the previous one.
    writes.push(prisma.payrollEntry.deleteMany({ where: { tenantId, runId, employeeId: e.employeeId, type: 'overtime', overtimeKind: { not: null } } }));
    if (!rules || exempt.has(e.employeeId)) {
      const hours = minutesToHours(m);
      updated.push({ employeeId: e.employeeId, name: name(e), minutes: m, hours });
      writes.push(prisma.payrollEntry.update({ where: { id: e.id }, data: { ...base, hoursQty: hours, amountCents: Math.round(hours * r) } }));
      continue;
    }
    const split = computeOvertime(days.get(e.employeeId) ?? [], rules, weekStartsOn, from);
    const regularHours = minutesToHours(split.regularMinutes);
    const lines: { kind: 'weekday' | 'rest' | 'night'; hours: number; factor: number; pct: number }[] = [
      { kind: 'weekday', hours: minutesToHours(split.weekdayOvertimeMinutes), factor: 1 + rules.weekdayPct / 100, pct: rules.weekdayPct },
      { kind: 'rest', hours: minutesToHours(split.restOvertimeMinutes), factor: 1 + rules.restPct / 100, pct: rules.restPct },
      { kind: 'night', hours: minutesToHours(split.nightMinutes), factor: rules.nightPct / 100, pct: rules.nightPct },
    ];
    updated.push({
      employeeId: e.employeeId,
      name: name(e),
      minutes: m,
      hours: minutesToHours(m),
      overtime: { regularHours, weekdayHours: lines[0].hours, restHours: lines[1].hours, nightHours: lines[2].hours },
    });
    writes.push(prisma.payrollEntry.update({ where: { id: e.id }, data: { ...base, hoursQty: regularHours, amountCents: Math.round(regularHours * r) } }));
    for (const l of lines) {
      if (l.hours <= 0 || l.factor <= 0) continue;
      writes.push(
        prisma.payrollEntry.create({
          data: {
            tenantId,
            employeeId: e.employeeId,
            runId,
            type: 'overtime',
            overtimeKind: l.kind,
            label: labels[l.kind](l.pct),
            hoursQty: l.hours,
            amountCents: Math.round(l.hours * r * l.factor),
            currency: currency.get(e.employeeId) ?? e.currency,
            paymentDate: e.paymentDate,
            ...base,
          },
        }),
      );
    }
  }
  await prisma.$transaction(writes);

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
  // Overtime lines of the same runs (spec-overtime.md): shown as "of which N h overtime".
  const extra = await prisma.payrollEntry.groupBy({
    by: ['runId'],
    where: { tenantId, employeeId, type: 'overtime', overtimeKind: { in: ['weekday', 'rest'] }, runId: { in: rows.map((r) => r.runId!) } },
    _sum: { hoursQty: true },
  });
  const extraByRun = new Map(extra.map((x) => [x.runId, x._sum.hoursQty ?? 0]));
  return rows.map((r) => ({
    id: r.id,
    overtimeHours: extraByRun.get(r.runId) ?? 0,
    periodLabel: r.run!.periodLabel,
    status: r.run!.status,
    confirmedAt: r.run!.confirmedAt,
    hours: r.hoursQty!,
    from: r.hoursFrom ? dayString(r.hoursFrom) : null,
    to: r.hoursTo ? dayString(r.hoursTo) : null,
    fromTimesheet: r.hoursFromTimesheet,
  }));
}
