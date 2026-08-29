import prisma from '../../lib/prisma.js';
import { avg, lastNMonthKeys, median, monthKey, monthsAgoUtc, pct } from './mathUtils.js';

interface CurrencyAmount {
  currency: string;
  amountCents: number;
}

async function getCostByPeriod(tenantId: string, monthsBack: number): Promise<{ month: string; byCurrency: CurrencyAmount[] }[]> {
  const since = monthsAgoUtc(monthsBack - 1);
  const entries = await prisma.payrollEntry.findMany({
    where: { tenantId, paymentDate: { gte: since } },
    select: { amountCents: true, currency: true, paymentDate: true },
  });
  const months = lastNMonthKeys(monthsBack);
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

async function getCostByType(tenantId: string, monthsBack: number): Promise<TypeCurrencyAmount[]> {
  const since = monthsAgoUtc(monthsBack - 1);
  const groups = await prisma.payrollEntry.groupBy({
    by: ['type', 'currency'],
    where: { tenantId, paymentDate: { gte: since } },
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
  return [...groups.values()].map((g) => ({
    departmentId: g.departmentId,
    departmentName: g.departmentName,
    compensationType: g.compensationType,
    currency: g.currency,
    medianRateCents: Math.round(median(g.rates)),
    avgRateCents: Math.round(avg(g.rates)),
    sampleSize: g.rates.length,
  }));
}

async function getOffCyclePayments(tenantId: string, monthsBack: number): Promise<{ count: number; byCurrency: CurrencyAmount[] }> {
  const since = monthsAgoUtc(monthsBack - 1);
  const entries = await prisma.payrollEntry.findMany({
    where: { tenantId, runId: null, paymentDate: { gte: since } },
    select: { amountCents: true, currency: true },
  });
  const byCurrencyMap = new Map<string, number>();
  for (const e of entries) byCurrencyMap.set(e.currency, (byCurrencyMap.get(e.currency) ?? 0) + e.amountCents);
  return { count: entries.length, byCurrency: [...byCurrencyMap].map(([currency, amountCents]) => ({ currency, amountCents })) };
}

async function getContractConfirmationRate(tenantId: string): Promise<{ confirmed: number; total: number; ratePct: number | null }> {
  const [total, confirmed] = await Promise.all([
    prisma.employeeCompensation.count({ where: { tenantId } }),
    prisma.employeeCompensation.count({ where: { tenantId, confirmedAt: { not: null } } }),
  ]);
  return { confirmed, total, ratePct: pct(confirmed, total) };
}

export async function getPayrollMetrics(tenantId: string, monthsBack = 6) {
  const [costByPeriod, costByType, compensationByDepartment, offCycle, contractConfirmation] = await Promise.all([
    getCostByPeriod(tenantId, monthsBack),
    getCostByType(tenantId, monthsBack),
    getCompensationByDepartment(tenantId),
    getOffCyclePayments(tenantId, monthsBack),
    getContractConfirmationRate(tenantId),
  ]);
  return { costByPeriod, costByType, compensationByDepartment, offCycle, contractConfirmation };
}
