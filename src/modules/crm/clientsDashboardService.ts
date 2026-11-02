import prisma from '../../lib/prisma.js';
import { computeHealth } from './healthService.js';
import { monthlyCents } from './productService.js';
import { OPEN_STATUSES, slaState } from './ticketService.js';

// Clientes C9 (spec-clientes-gastos-formularios.md): Dashboards → Clientes, and the Sales additions
// (won by pipeline purpose, leads funnel). Every metric takes the shared Dashboards period and a
// department filter: the department of the deal's / lead's / account's owner (their employee file).

const asDate = (s: string, end = false) => new Date(`${s}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
const monthOf = (d: Date) => d.toISOString().slice(0, 7);

// Users whose employee file is in the department ("none" = users with no department or no file).
async function ownersInDepartment(tenantId: string, departmentId?: string): Promise<string[] | null> {
  if (!departmentId) return null;
  const users = await prisma.user.findMany({ where: { tenantId }, select: { id: true } });
  const employees = await prisma.employee.findMany({ where: { tenantId, userId: { not: null } }, select: { userId: true, departmentId: true } });
  const deptOf = new Map(employees.map((e) => [e.userId!, e.departmentId]));
  return users.filter((u) => (departmentId === 'none' ? !deptOf.get(u.id) : deptOf.get(u.id) === departmentId)).map((u) => u.id);
}

export async function getSalesExtras(tenantId: string, filter: { from: string; to: string; departmentId?: string }) {
  const owners = await ownersInDepartment(tenantId, filter.departmentId);
  const range = { gte: asDate(filter.from), lte: asDate(filter.to, true) };

  // Deals that entered a won stage in the period, by their pipeline's purpose.
  const won = await prisma.opportunityStageHistory.findMany({
    where: { tenantId, enteredAt: range, stage: { outcome: 'won' }, ...(owners ? { opportunity: { ownerId: { in: owners } } } : {}) },
    select: { opportunity: { select: { id: true, amountCents: true, currency: true, pipeline: { select: { purpose: true } } } } },
  });
  const seen = new Set<string>();
  const byPurpose = new Map<string, Map<string, { count: number; cents: number }>>();
  for (const w of won) {
    if (seen.has(w.opportunity.id)) continue;
    seen.add(w.opportunity.id);
    const purpose = w.opportunity.pipeline.purpose;
    const cur = byPurpose.get(purpose) ?? new Map();
    const v = cur.get(w.opportunity.currency) ?? { count: 0, cents: 0 };
    v.count++;
    v.cents += w.opportunity.amountCents;
    cur.set(w.opportunity.currency, v);
    byPurpose.set(purpose, cur);
  }

  // Leads funnel: leads that arrived in the period and how far they got.
  const leads = await prisma.lead.findMany({
    where: { tenantId, createdAt: range, ...(owners ? { ownerId: { in: owners } } : {}) },
    select: { status: true, touchCount: true, formId: true, utmSource: true, leadSource: { select: { name: true } } },
  });
  const qualifiedOrBeyond = leads.filter((l) => l.status === 'qualified' || l.status === 'converted').length;
  const sources = new Map<string, { total: number; converted: number }>();
  for (const l of leads) {
    const key = l.leadSource?.name ?? l.utmSource ?? (l.formId ? 'form' : 'manual');
    const v = sources.get(key) ?? { total: 0, converted: 0 };
    v.total++;
    if (l.status === 'converted') v.converted++;
    sources.set(key, v);
  }

  return {
    wonByPurpose: [...byPurpose.entries()].flatMap(([purpose, cur]) => [...cur.entries()].map(([currency, v]) => ({ purpose, currency, ...v }))),
    leads: {
      total: leads.length,
      worked: leads.filter((l) => l.touchCount > 0).length,
      qualified: qualifiedOrBeyond,
      converted: leads.filter((l) => l.status === 'converted').length,
      disqualified: leads.filter((l) => l.status === 'disqualified').length,
      bySource: [...sources.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.total - a.total),
    },
  };
}

export async function getClientsDashboard(tenantId: string, filter: { from: string; to: string; departmentId?: string }) {
  const owners = await ownersInDepartment(tenantId, filter.departmentId);
  const range = { gte: asDate(filter.from), lte: asDate(filter.to, true) };

  // Clients = companies with an active product or a won deal; by their account owner's department.
  const [lines, wonDeals] = await Promise.all([
    prisma.companyProduct.findMany({
      where: { tenantId },
      select: { companyId: true, startDate: true, cancelledAt: true, quantity: true, unitPriceCents: true, product: { select: { billing: true, currency: true } } },
    }),
    prisma.opportunity.findMany({ where: { tenantId, isActive: true, stage: { outcome: 'won' } }, select: { companyId: true } }),
  ]);
  let companyIds = [...new Set([...lines.filter((l) => !l.cancelledAt).map((l) => l.companyId), ...wonDeals.map((d) => d.companyId)])];
  if (owners) {
    const companies = await prisma.company.findMany({ where: { tenantId, id: { in: companyIds }, accountOwnerId: { in: owners } }, select: { id: true } });
    companyIds = companies.map((c) => c.id);
  }
  const inScope = new Set(companyIds);

  const health = await computeHealth(tenantId, companyIds);
  const healthCounts = { healthy: 0, at_risk: 0, critical: 0 };
  for (const h of health.values()) healthCounts[h.status]++;

  const mrr = new Map<string, number>();
  const newMrrByMonth = new Map<string, Map<string, number>>();
  let cancelledInPeriod = 0;
  for (const l of lines) {
    if (!inScope.has(l.companyId)) continue;
    const monthly = monthlyCents({ billing: l.product.billing, unitPriceCents: l.unitPriceCents, quantity: l.quantity });
    if (!l.cancelledAt) mrr.set(l.product.currency, (mrr.get(l.product.currency) ?? 0) + monthly);
    if (l.startDate >= range.gte && l.startDate <= range.lte && monthly) {
      const m = newMrrByMonth.get(monthOf(l.startDate)) ?? new Map();
      m.set(l.product.currency, (m.get(l.product.currency) ?? 0) + monthly);
      newMrrByMonth.set(monthOf(l.startDate), m);
    }
    if (l.cancelledAt && l.cancelledAt >= range.gte && l.cancelledAt <= range.lte) cancelledInPeriod++;
  }

  const [tickets, checkIns] = await Promise.all([
    prisma.clientTicket.findMany({
      where: { tenantId, OR: [{ createdAt: range }, { status: { in: OPEN_STATUSES } }], ...(owners ? { companyId: { in: companyIds } } : {}) },
      select: { priority: true, status: true, createdAt: true, firstResponseDueAt: true, resolutionDueAt: true, firstRespondedAt: true, resolvedAt: true },
    }),
    prisma.companyCheckIn.count({ where: { tenantId, at: range, ...(owners ? { companyId: { in: companyIds } } : {}) } }),
  ]);
  const opened = tickets.filter((tk) => tk.createdAt >= range.gte && tk.createdAt <= range.lte);
  const closedInPeriod = tickets.filter((tk) => tk.resolvedAt && tk.resolvedAt >= range.gte && tk.resolvedAt <= range.lte);
  const onTime = closedInPeriod.filter((tk) => !slaState(tk).resolutionBreached).length;
  const open = tickets.filter((tk) => OPEN_STATUSES.includes(tk.status));
  const byPriority = new Map<string, number>();
  for (const tk of opened) byPriority.set(tk.priority, (byPriority.get(tk.priority) ?? 0) + 1);

  return {
    clients: companyIds.length,
    health: healthCounts,
    mrr: [...mrr.entries()].map(([currency, cents]) => ({ currency, cents })),
    newMrrByMonth: [...newMrrByMonth.entries()].sort().map(([month, cur]) => ({ month, byCurrency: [...cur.entries()].map(([currency, cents]) => ({ currency, cents })) })),
    cancelledInPeriod,
    checkIns,
    tickets: {
      opened: opened.length,
      open: open.length,
      overdue: open.filter((tk) => slaState(tk).overdue).length,
      resolved: closedInPeriod.length,
      slaPct: closedInPeriod.length ? Math.round((onTime / closedInPeriod.length) * 100) : null,
      byPriority: ['urgent', 'high', 'normal', 'low'].map((priority) => ({ priority, count: byPriority.get(priority) ?? 0 })),
    },
  };
}
