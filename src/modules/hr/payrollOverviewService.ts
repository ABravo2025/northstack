import prisma from '../../lib/prisma.js';
import { getCompensationStatus } from './employeeCompensationService.js';

// Payroll v2 (spec-payroll-v2.md §2, unit 2): the Payroll overview — the latest confirmed pay run in
// numbers (per currency, never added across currencies), the runs list with totals, and what's
// blocking the next close: hourly people with weeks not approved, contracts not confirmed, old
// drafts, hourly people with no hours yet.

const DAY_MS = 86_400_000;
const STALE_DRAFT_DAYS = 2;

export type Totals = Record<string, number>; // currency → cents

// Pure (tested): % change of the main currency between two runs; null when there's nothing to compare.
export function variationPct(current: Totals, previous: Totals | null): number | null {
  if (!previous) return null;
  const currency = Object.keys(current).sort((a, b) => current[b] - current[a])[0];
  if (!currency || !previous[currency]) return null;
  return Math.round(((current[currency] - previous[currency]) / previous[currency]) * 1000) / 10;
}

export async function runSummaries(tenantId: string, runIds: string[]) {
  if (runIds.length === 0) return new Map<string, { totals: Totals; people: number; hours: number; overtimeHours: number }>();
  const [money, people, hours] = await Promise.all([
    prisma.payrollEntry.groupBy({ by: ['runId', 'currency'], where: { tenantId, runId: { in: runIds } }, _sum: { amountCents: true } }),
    prisma.payrollEntry.groupBy({ by: ['runId', 'employeeId'], where: { tenantId, runId: { in: runIds } } }),
    prisma.payrollEntry.groupBy({ by: ['runId', 'type'], where: { tenantId, runId: { in: runIds }, type: { in: ['base', 'overtime'] }, OR: [{ overtimeKind: null }, { overtimeKind: { not: 'night' } }] }, _sum: { hoursQty: true } }),
  ]);
  const out = new Map<string, { totals: Totals; people: number; hours: number; overtimeHours: number }>();
  for (const id of runIds) out.set(id, { totals: {}, people: 0, hours: 0, overtimeHours: 0 });
  for (const m of money) out.get(m.runId!)!.totals[m.currency] = (out.get(m.runId!)!.totals[m.currency] ?? 0) + (m._sum.amountCents ?? 0);
  for (const p of people) out.get(p.runId!)!.people += 1;
  for (const h of hours) {
    const row = out.get(h.runId!)!;
    const n = h._sum.hoursQty ?? 0;
    row.hours += n;
    if (h.type === 'overtime') row.overtimeHours += n;
  }
  for (const row of out.values()) {
    row.hours = Math.round(row.hours * 100) / 100;
    row.overtimeHours = Math.round(row.overtimeHours * 100) / 100;
  }
  return out;
}

export async function getPayrollOverview(tenantId: string, now = new Date()) {
  const runs = await prisma.payrollRun.findMany({
    where: { tenantId },
    include: { payFrequency: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 24,
  });
  const summaries = await runSummaries(tenantId, runs.map((r) => r.id));
  const confirmed = runs.filter((r) => r.status === 'confirmed').sort((a, b) => (b.confirmedAt?.getTime() ?? 0) - (a.confirmedAt?.getTime() ?? 0));
  const last = confirmed[0] ?? null;
  const previousSameFrequency = last ? confirmed.find((r) => r.id !== last.id && r.payFrequencyId === last.payFrequencyId) ?? null : null;

  const status = await getCompensationStatus(tenantId);
  const inPayroll = status.filter((s) => s.currentCompensation).length;
  const unconfirmed = status.filter((s) => s.currentCompensation && !s.isConfirmed).map((s) => ({ employeeId: s.employeeId, name: `${s.employeeFirstName} ${s.employeeLastName}`.trim() }));
  // Employees in Argentina / the US still without their CUIL / SSN (asked when they're added).
  const missingTaxIds = status.filter((s) => s.taxIdRequired && !s.taxIdMasked).map((s) => ({ employeeId: s.employeeId, name: `${s.employeeFirstName} ${s.employeeLastName}`.trim() }));

  const drafts = runs.filter((r) => r.status === 'draft');
  const staleDrafts = drafts.filter((r) => now.getTime() - r.createdAt.getTime() > STALE_DRAFT_DAYS * DAY_MS).map((r) => ({ id: r.id, periodLabel: r.periodLabel, days: Math.floor((now.getTime() - r.createdAt.getTime()) / DAY_MS) }));

  // Hourly people in a draft run still without hours.
  const missingHours = drafts.length
    ? await prisma.payrollEntry.findMany({
        where: { tenantId, runId: { in: drafts.map((d) => d.id) }, type: 'base', hoursQty: null, employee: { compensations: { some: { effectiveTo: null, compensationType: 'hourly' } } } },
        select: { runId: true, employee: { select: { id: true, firstName: true, lastName: true } } },
      })
    : [];

  // Hourly people with weeks of this month not approved yet (their hours can't be brought in).
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const hourlyIds = status.filter((s) => s.currentCompensation?.compensationType === 'hourly').map((s) => s.employeeId);
  const openWeeks = hourlyIds.length
    ? await prisma.timesheet.findMany({
        where: { tenantId, employeeId: { in: hourlyIds }, status: { not: 'approved' }, entries: { some: { date: { gte: monthStart } } } },
        select: { employeeId: true, weekStart: true, status: true, employee: { select: { firstName: true, lastName: true } } },
        orderBy: { weekStart: 'asc' },
      })
    : [];

  const serializeRun = (r: (typeof runs)[number]) => ({
    id: r.id,
    periodLabel: r.periodLabel,
    status: r.status,
    frequency: r.payFrequency?.name ?? null,
    createdAt: r.createdAt,
    confirmedAt: r.confirmedAt,
    ...summaries.get(r.id)!,
  });

  return {
    inPayroll,
    lastRun: last ? { ...serializeRun(last), variationPct: variationPct(summaries.get(last.id)!.totals, previousSameFrequency ? summaries.get(previousSameFrequency.id)!.totals : null) } : null,
    draft: drafts[0] ? serializeRun(drafts[0]) : null,
    recentRuns: runs.slice(0, 6).map(serializeRun),
    pending: {
      unapprovedWeeks: openWeeks.map((w) => ({ employeeId: w.employeeId, name: `${w.employee.firstName} ${w.employee.lastName}`.trim(), weekStart: w.weekStart.toISOString().slice(0, 10), status: w.status })),
      unconfirmedContracts: unconfirmed,
      missingTaxIds,
      staleDrafts,
      missingHours: missingHours.map((m) => ({ runId: m.runId!, employeeId: m.employee.id, name: `${m.employee.firstName} ${m.employee.lastName}`.trim() })),
    },
  };
}
