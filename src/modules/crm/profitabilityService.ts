import prisma from '../../lib/prisma.js';
import { decryptAmountCents } from '../../lib/expenseEncryption.js';
import { monthlyCents } from './productService.js';

// Cruces D1 (spec-clientes-gastos-formularios.md): profitability per client for a period —
//   revenue  − labor (hours logged on the client × each person's hourly cost) − expenses assigned to it.
// Revenue: the client's Stripe payments when it's linked (passed in by the caller, which owns the
// Stripe call), otherwise an estimate from its products (monthly recurring × months in the period).
// Each part is only computed for someone allowed to see it: labor needs payroll, expenses need
// Gastos (and its key). Amounts are per currency; nothing is converted.

const DAY = 86_400_000;
// Hours a fixed salary covers per pay period, to turn it into an hourly cost.
const HOURS_PER_PERIOD: Record<string, number> = { weekly: 40, biweekly: 80, semimonthly: 80, monthly: 160 };

export type Money = { currency: string; cents: number }[];

function add(map: Map<string, number>, currency: string, cents: number) {
  map.set(currency, (map.get(currency) ?? 0) + cents);
}
const toList = (m: Map<string, number>): Money => [...m.entries()].map(([currency, cents]) => ({ currency, cents }));

export function hourlyCostCents(comp: { compensationType: string; rateCents: number; cadence: string | null }): number {
  if (comp.compensationType === 'hourly') return comp.rateCents;
  return Math.round(comp.rateCents / (HOURS_PER_PERIOD[comp.cadence ?? 'monthly'] ?? 160));
}

export function monthsIn(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime() + DAY) / (30.4375 * DAY));
}

export async function getProfitability(
  tenantId: string,
  companyIds: string[],
  period: { from: Date; to: Date },
  opts: { canSeeLabor: boolean; canSeeExpenses: boolean; stripeRevenue?: Map<string, Money> },
) {
  const result = new Map<string, { revenue: Money; revenueSource: 'stripe' | 'products' | 'none'; labor: Money | null; laborMinutes: number | null; expenses: Money | null; profit: Money }>();
  if (!companyIds.length) return result;

  // Revenue estimate from products for clients without Stripe revenue.
  const lines = await prisma.companyProduct.findMany({
    where: { tenantId, companyId: { in: companyIds } },
    select: { companyId: true, startDate: true, cancelledAt: true, quantity: true, unitPriceCents: true, product: { select: { billing: true, currency: true } } },
  });

  // Labor: time on the client directly, or on its projects.
  let labor = new Map<string, Map<string, number>>();
  const minutes = new Map<string, number>();
  if (opts.canSeeLabor) {
    const projects = await prisma.project.findMany({ where: { tenantId, companyId: { in: companyIds } }, select: { id: true, companyId: true } });
    const projectCompany = new Map(projects.map((p) => [p.id, p.companyId!]));
    const entries = await prisma.timeEntry.findMany({
      where: {
        tenantId,
        date: { gte: period.from, lte: period.to },
        OR: [{ companyId: { in: companyIds } }, { projectId: { in: projects.map((p) => p.id) } }],
      },
      select: { employeeId: true, date: true, minutes: true, companyId: true, projectId: true },
    });
    const comps = entries.length
      ? await prisma.employeeCompensation.findMany({
          where: { tenantId, employeeId: { in: [...new Set(entries.map((e) => e.employeeId))] } },
          select: { employeeId: true, compensationType: true, rateCents: true, currency: true, effectiveFrom: true, effectiveTo: true, payFrequency: { select: { cadence: true } } },
          orderBy: { effectiveFrom: 'desc' },
        })
      : [];
    labor = new Map();
    for (const e of entries) {
      const companyId = e.companyId && companyIds.includes(e.companyId) ? e.companyId : e.projectId ? projectCompany.get(e.projectId) : undefined;
      if (!companyId) continue;
      minutes.set(companyId, (minutes.get(companyId) ?? 0) + e.minutes);
      // The compensation in effect that day.
      const comp = comps.find((c) => c.employeeId === e.employeeId && c.effectiveFrom <= e.date && (!c.effectiveTo || c.effectiveTo >= e.date));
      if (!comp) continue;
      const cost = Math.round((e.minutes / 60) * hourlyCostCents({ compensationType: comp.compensationType, rateCents: comp.rateCents, cadence: comp.payFrequency.cadence }));
      const m = labor.get(companyId) ?? new Map();
      add(m, comp.currency, cost);
      labor.set(companyId, m);
    }
  }

  // Expenses assigned to the client (debits count, refunds net), decrypted in the app.
  const expenses = new Map<string, Map<string, number>>();
  if (opts.canSeeExpenses) {
    const [movements, tenant] = await Promise.all([
      prisma.expenseMovement.findMany({
        where: { tenantId, companyId: { in: companyIds }, kind: 'expense', date: { gte: period.from, lte: period.to } },
        select: { companyId: true, amountEnc: true, direction: true },
      }),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } }),
    ]);
    const currency = tenant?.currency ?? 'USD';
    for (const m of movements) {
      const cents = decryptAmountCents(m.amountEnc);
      const map = expenses.get(m.companyId!) ?? new Map();
      add(map, currency, m.direction === 'debit' ? cents : -cents);
      expenses.set(m.companyId!, map);
    }
  }

  const months = monthsIn(period.from, period.to);
  for (const companyId of companyIds) {
    let revenue = opts.stripeRevenue?.get(companyId) ?? null;
    let revenueSource: 'stripe' | 'products' | 'none' = revenue && revenue.length ? 'stripe' : 'none';
    if (!revenue || !revenue.length) {
      const est = new Map<string, number>();
      for (const l of lines.filter((x) => x.companyId === companyId)) {
        // Only the part of the period the product was active.
        const start = l.startDate > period.from ? l.startDate : period.from;
        const end = l.cancelledAt && l.cancelledAt < period.to ? l.cancelledAt : period.to;
        if (end < start) continue;
        const monthly = monthlyCents({ billing: l.product.billing, unitPriceCents: l.unitPriceCents, quantity: l.quantity });
        const oneTime = l.product.billing === 'one_time' && l.startDate >= period.from && l.startDate <= period.to ? l.unitPriceCents * l.quantity : 0;
        add(est, l.product.currency, Math.round(monthly * Math.min(months, monthsIn(start, end))) + oneTime);
      }
      revenue = toList(est).filter((r) => r.cents > 0);
      revenueSource = revenue.length ? 'products' : 'none';
    }
    const profit = new Map<string, number>();
    for (const r of revenue) add(profit, r.currency, r.cents);
    for (const [c, v] of labor.get(companyId) ?? []) add(profit, c, -v);
    for (const [c, v] of expenses.get(companyId) ?? []) add(profit, c, -v);
    result.set(companyId, {
      revenue,
      revenueSource,
      labor: opts.canSeeLabor ? toList(labor.get(companyId) ?? new Map()) : null,
      laborMinutes: opts.canSeeLabor ? (minutes.get(companyId) ?? 0) : null,
      expenses: opts.canSeeExpenses ? toList(expenses.get(companyId) ?? new Map()) : null,
      profit: toList(profit),
    });
  }
  return result;
}
