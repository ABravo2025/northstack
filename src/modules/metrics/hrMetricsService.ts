import prisma from '../../lib/prisma.js';
import { avg, daysBetween, lastNMonthKeys, median, monthKey, monthsAgoUtc, pct } from './mathUtils.js';

interface StatusCount {
  statusId: string;
  name: string;
  color: string | null;
  count: number;
}

async function getHeadcountByStatus(tenantId: string): Promise<{ total: number; byStatus: StatusCount[] }> {
  const groups = await prisma.employee.groupBy({ by: ['statusId'], where: { tenantId }, _count: true });
  const statuses = await prisma.statusDefinition.findMany({
    where: { id: { in: groups.map((g) => g.statusId) } },
    select: { id: true, name: true, color: true, order: true },
  });
  const byId = new Map(statuses.map((s) => [s.id, s]));
  const byStatus = groups
    .map((g) => {
      const s = byId.get(g.statusId);
      return { statusId: g.statusId, name: s?.name ?? 'Unknown', color: s?.color ?? null, order: s?.order ?? 0, count: g._count };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ order: _order, ...rest }) => rest);
  const total = groups.reduce((sum, g) => sum + g._count, 0);
  // Total intentionally includes the auto-created owner Employee record — unlike
  // module-adoption metrics elsewhere, headcount is a literal count of real
  // employee rows, and the owner genuinely is one.
  return { total, byStatus };
}

async function getHeadcountGrowth(tenantId: string, monthsBack: number): Promise<{ month: string; count: number }[]> {
  const since = monthsAgoUtc(monthsBack - 1);
  const employees = await prisma.employee.findMany({
    where: { tenantId, OR: [{ startDate: { gte: since } }, { AND: [{ startDate: null }, { createdAt: { gte: since } }] }] },
    select: { startDate: true, createdAt: true },
  });
  const months = lastNMonthKeys(monthsBack);
  const counts = new Map<string, number>(months.map((m) => [m, 0]));
  for (const e of employees) {
    const key = monthKey(e.startDate ?? e.createdAt);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return months.map((month) => ({ month, count: counts.get(month) ?? 0 }));
}

interface CatalogBucket {
  id: string | null;
  name: string;
  count: number;
}

async function getHeadcountByCatalog(tenantId: string, field: 'departmentId' | 'jobTitleId'): Promise<CatalogBucket[]> {
  const groups = await prisma.employee.groupBy({ by: [field], where: { tenantId }, _count: true });
  const ids = groups.map((g) => g[field]).filter((id): id is string => id !== null);
  const defs = ids.length
    ? await prisma.fieldCatalogDefinition.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const byId = new Map(defs.map((d) => [d.id, d.name]));
  return groups
    .map((g) => ({ id: g[field], name: g[field] ? (byId.get(g[field]!) ?? 'Unknown') : 'Not set', count: g._count }))
    .sort((a, b) => b.count - a.count);
}

async function getContractTypeMix(tenantId: string): Promise<{ contractType: string; count: number }[]> {
  const groups = await prisma.employee.groupBy({ by: ['contractType'], where: { tenantId }, _count: true });
  return groups.map((g) => ({ contractType: g.contractType ?? 'not_set', count: g._count }));
}

async function getPersonTypeMix(tenantId: string): Promise<{ personType: string; count: number }[]> {
  const groups = await prisma.employee.groupBy({ by: ['personType'], where: { tenantId }, _count: true });
  return groups.map((g) => ({ personType: g.personType ?? 'not_set', count: g._count }));
}

async function getTenureStats(tenantId: string): Promise<{ medianDays: number; avgDays: number; sampleSize: number }> {
  const employees = await prisma.employee.findMany({
    where: { tenantId, startDate: { not: null } },
    select: { startDate: true, endDate: true },
  });
  const now = new Date();
  const days = employees.map((e) => daysBetween(e.startDate!, e.endDate ?? now));
  return { medianDays: Math.round(median(days)), avgDays: Math.round(avg(days)), sampleSize: days.length };
}

async function getSpanOfControl(tenantId: string): Promise<{ managerCount: number; medianReports: number; avgReports: number }> {
  const groups = await prisma.employee.groupBy({ by: ['managerId'], where: { tenantId, managerId: { not: null } }, _count: true });
  const reportCounts = groups.map((g) => g._count);
  return { managerCount: groups.length, medianReports: median(reportCounts), avgReports: Math.round(avg(reportCounts) * 10) / 10 };
}

interface CustomFieldCompletion {
  id: string;
  name: string;
  filledCount: number;
  completionPct: number | null;
}

async function getCustomFieldCompletion(
  tenantId: string,
): Promise<{ activeDefinitionCount: number; employeeCount: number; fields: CustomFieldCompletion[] }> {
  const [defs, employeeCount] = await Promise.all([
    prisma.customFieldDefinition.findMany({
      where: { tenantId, entityType: 'employee', isActive: true },
      select: { id: true, name: true },
    }),
    prisma.employee.count({ where: { tenantId } }),
  ]);
  if (defs.length === 0) {
    return { activeDefinitionCount: 0, employeeCount, fields: [] };
  }
  const valueCounts = await prisma.customFieldValue.groupBy({
    by: ['customFieldDefinitionId'],
    where: { tenantId, entityType: 'employee', customFieldDefinitionId: { in: defs.map((d) => d.id) } },
    _count: true,
  });
  const countByDef = new Map(valueCounts.map((v) => [v.customFieldDefinitionId, v._count]));
  const fields = defs.map((d) => ({
    id: d.id,
    name: d.name,
    filledCount: countByDef.get(d.id) ?? 0,
    completionPct: pct(countByDef.get(d.id) ?? 0, employeeCount),
  }));
  return { activeDefinitionCount: defs.length, employeeCount, fields };
}

export async function getHrMetrics(tenantId: string, monthsBack = 6) {
  const [headcount, growth, byDepartment, byJobTitle, contractTypeMix, personTypeMix, tenure, spanOfControl, customFields] =
    await Promise.all([
      getHeadcountByStatus(tenantId),
      getHeadcountGrowth(tenantId, monthsBack),
      getHeadcountByCatalog(tenantId, 'departmentId'),
      getHeadcountByCatalog(tenantId, 'jobTitleId'),
      getContractTypeMix(tenantId),
      getPersonTypeMix(tenantId),
      getTenureStats(tenantId),
      getSpanOfControl(tenantId),
      getCustomFieldCompletion(tenantId),
    ]);
  return { headcount, growth, byDepartment, byJobTitle, contractTypeMix, personTypeMix, tenure, spanOfControl, customFields };
}
