import prisma from '../../lib/prisma.js';
import { avg, median, monthKey, monthKeysInRange, pct } from './mathUtils.js';
import type { DateRange } from './dateRange.js';

interface CurrencyAmount {
  currency: string;
  amountCents: number;
}

async function getCostByPeriod(tenantId: string, range: DateRange): Promise<{ month: string; byCurrency: CurrencyAmount[] }[]> {
  const entries = await prisma.payrollEntry.findMany({
    where: { tenantId, paymentDate: { gte: range.since, lte: range.until } },
    select: { amountCents: true, currency: true, paymentDate: true },
  });
  const months = monthKeysInRange(range.since, range.until);
  const buckets = new Map<string, Map<string, number>>(months.map((m) => [m, new Map<string, number>()]));
  for (const e of entries) {
    const key = monthKey(e.paymentDate);
    const byCurrency = buckets.get(key);
    if (!byCurrency) continue;
    byCurrency.set(e.currency, (byCurrency.get(e.currency) ?? 0) + e.amountCents);
  }
  return months.map((month) => ({
    month,
    byCurrency: [...(buckets.get(month) ?? new Map())].map(([currency, amountCents]) => ({ currency, amountCents })),
  }));
}

interface TypeCurrencyAmount {
  type: string;
  currency: string;
  amountCents: number;
  count: number;
}

async function getCostByType(tenantId: string, range: DateRange): Promise<TypeCurrencyAmount[]> {
  const groups = await prisma.payrollEntry.groupBy({
    by: ['type', 'currency'],
    where: { tenantId, paymentDate: { gte: range.since, lte: range.until } },
    _sum: { amountCents: true },
    _count: true,
  });
  return groups.map((g) => ({ type: g.type, currency: g.currency, amountCents: g._sum.amountCents ?? 0, count: g._count }));
}

interface CompensationBucket {
  departmentId: string | null;
  departmentName: string;
  compensationType: string;
  currency: string;
  medianRateCents: number;
  avgRateCents: number;
  sampleSize: number;
}

// Not range-filtered — this is "who's actively being paid what right now"
// (effectiveTo: null), a current-state snapshot, not an aggregate over
// events in a period. Reconstructing "as of a past date" would need the
// full compensation history walked per employee — out of scope here.
async function getCompensationByDepartment(tenantId: string): Promise<CompensationBucket[]> {
  const active = await prisma.employeeCompensation.findMany({
    where: { tenantId, effectiveTo: null },
    select: {
      rateCents: true,
      currency: true,
      compensationType: true,
      employee: { select: { departmentId: true, departmentDefn: { select: { name: true } } } },
    },
  });
  const groups = new Map<string, { departmentId: string | null; departmentName: string; compensationType: string; currency: string; rates: number[] }>();
  for (const c of active) {
    const key = `${c.employee.departmentId ?? 'none'}|${c.compensationType}|${c.currency}`;
    if (!groups.has(key)) {
      groups.set(key, {
        departmentId: c.employee.departmentId,
        departmentName: c.employee.departmentDefn?.name ?? 'Not set',
        compensationType: c.compensationType,
        currency: c.currency,
        rates: [],
      });
    }
    groups.get(key)!.rates.push(c.rateCents);
  }
  // `?? 0` is unreachable, not a silent "no data" fallback: every entry in groups.values() had at
  // least one rate pushed onto it at the point it was created (see the loop above), so g.rates is
  // never empty here — median/avg's null case (an empty array) can't actually occur.
  return [...groups.values()].map((g) => ({
    departmentId: g.departmentId,
    departmentName: g.departmentName,
    compensationType: g.compensationType,
    currency: g.currency,
    medianRateCents: Math.round(median(g.rates) ?? 0),
    avgRateCents: Math.round(avg(g.rates) ?? 0),
    sampleSize: g.rates.length,
  }));
}

async function getOffCyclePayments(tenantId: string, range: DateRange): Promise<{ count: number; byCurrency: CurrencyAmount[] }> {
  const entries = await prisma.payrollEntry.findMany({
    where: { tenantId, runId: null, paymentDate: { gte: range.since, lte: range.until } },
    select: { amountCents: true, currency: true },
  });
  const byCurrencyMap = new Map<string, number>();
  for (const e of entries) byCurrencyMap.set(e.currency, (byCurrencyMap.get(e.currency) ?? 0) + e.amountCents);
  return { count: entries.length, byCurrency: [...byCurrencyMap].map(([currency, amountCents]) => ({ currency, amountCents })) };
}

async function getContractConfirmationRate(tenantId: string, range: DateRange): Promise<{ confirmed: number; total: number; ratePct: number | null }> {
  const [total, confirmed] = await Promise.all([
    prisma.employeeCompensation.count({ where: { tenantId, createdAt: { gte: range.since, lte: range.until } } }),
    prisma.employeeCompensation.count({
      where: { tenantId, createdAt: { gte: range.since, lte: range.until }, confirmedAt: { not: null } },
    }),
  ]);
  return { confirmed, total, ratePct: pct(confirmed, total) };
}

export async function getPayrollMetrics(tenantId: string, range: DateRange) {
  const [costByPeriod, costByType, compensationByDepartment, offCycle, contractConfirmation] = await Promise.all([
    getCostByPeriod(tenantId, range),
    getCostByType(tenantId, range),
    getCompensationByDepartment(tenantId),
    getOffCyclePayments(tenantId, range),
    getContractConfirmationRate(tenantId, range),
  ]);
  return { costByPeriod, costByType, compensationByDepartment, offCycle, contractConfirmation };
}
