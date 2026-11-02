import prisma from '../../lib/prisma.js';

// Dashboards → Encuestas (spec-clientes-gastos-formularios.md, B6). Scores are kept in clear on
// each response for exactly this: no decrypting. eNPS respects each survey's anonymity threshold —
// a department (or the whole company) with fewer answers than minAnonymousGroup shows no score, so
// a small team's answers can't be traced back to people. The department filter applies to
// employee surveys only; client NPS/CSAT and leads aren't tied to a department.

const asDate = (s: string, end = false) => new Date(`${s}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
const monthOf = (d: Date) => d.toISOString().slice(0, 7);

export function npsOf(scores: number[]): number | null {
  if (!scores.length) return null;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

function npsBreakdown(scores: number[]) {
  return {
    score: npsOf(scores),
    count: scores.length,
    promoters: scores.filter((s) => s >= 9).length,
    passives: scores.filter((s) => s === 7 || s === 8).length,
    detractors: scores.filter((s) => s <= 6).length,
    distribution: Array.from({ length: 11 }, (_, n) => ({ value: n, count: scores.filter((s) => s === n).length })),
  };
}

export async function getFormsDashboard(tenantId: string, filter: { from: string; to: string; departmentId?: string }) {
  const createdAt = { gte: asDate(filter.from), lte: asDate(filter.to, true) };
  const responses = await prisma.formResponse.findMany({
    where: { tenantId, createdAt },
    select: {
      score: true,
      createdAt: true,
      departmentId: true,
      source: true,
      linkedEntityType: true,
      utmSource: true,
      form: { select: { kind: true, module: true, action: true, surveySettings: true } },
    },
  });

  const metricOf = (r: (typeof responses)[number]) => (r.form.surveySettings as { metric?: string } | null)?.metric ?? 'none';
  const minGroupOf = (r: (typeof responses)[number]) => Math.max(3, (r.form.surveySettings as { minAnonymousGroup?: number } | null)?.minAnonymousGroup ?? 3);
  const scored = responses.filter((r) => r.form.kind === 'survey' && r.score !== null);

  // Clients' NPS and CSAT.
  const npsRows = scored.filter((r) => r.form.module !== 'employees' && metricOf(r) === 'nps');
  const csatRows = scored.filter((r) => metricOf(r) === 'csat');
  const npsByMonth = new Map<string, number[]>();
  for (const r of npsRows) npsByMonth.set(monthOf(r.createdAt), [...(npsByMonth.get(monthOf(r.createdAt)) ?? []), r.score!]);

  // Employees' eNPS, never below the anonymity threshold.
  const enpsRows = scored.filter((r) => r.form.module === 'employees' && (metricOf(r) === 'enps' || metricOf(r) === 'nps'));
  const minGroup = enpsRows.length ? Math.max(...enpsRows.map(minGroupOf)) : 3;
  const byDept = new Map<string | null, number[]>();
  for (const r of enpsRows) byDept.set(r.departmentId, [...(byDept.get(r.departmentId) ?? []), r.score!]);
  const filtered = filter.departmentId ? (byDept.get(filter.departmentId === 'none' ? null : filter.departmentId) ?? []) : enpsRows.map((r) => r.score!);
  const departments = await prisma.fieldCatalogDefinition.findMany({
    where: { tenantId, kind: 'department', id: { in: [...byDept.keys()].filter((k): k is string => !!k) } },
    select: { id: true, name: true },
  });
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  // The difference rule: if the departments below the threshold add up to fewer answers than the
  // threshold, the company total minus the visible departments would reveal them — so then no
  // department shows a score, only the total.
  const hiddenTotal = [...byDept.values()].filter((s) => s.length < minGroup).reduce((a, s) => a + s.length, 0);
  const departmentsHidden = hiddenTotal > 0 && hiddenTotal < minGroup;

  // Leads that arrived through forms, and where from.
  const leadRows = responses.filter((r) => r.form.action === 'create_lead' && (r.linkedEntityType === 'contact' || r.linkedEntityType === 'lead'));
  const leadsBySource = new Map<string, number>();
  for (const r of leadRows) {
    const key = r.utmSource || (r.source === 'embed' ? 'website' : 'direct');
    leadsBySource.set(key, (leadsBySource.get(key) ?? 0) + 1);
  }
  const leadsByMonth = new Map<string, number>();
  for (const r of leadRows) leadsByMonth.set(monthOf(r.createdAt), (leadsByMonth.get(monthOf(r.createdAt)) ?? 0) + 1);

  const byModule = new Map<string, number>();
  for (const r of responses) byModule.set(r.form.module, (byModule.get(r.form.module) ?? 0) + 1);

  return {
    from: filter.from,
    to: filter.to,
    totalResponses: responses.length,
    nps: { ...npsBreakdown(npsRows.map((r) => r.score!)), byMonth: [...npsByMonth.entries()].sort().map(([month, s]) => ({ month, score: npsOf(s), count: s.length })) },
    csat: {
      average: csatRows.length ? Math.round((csatRows.reduce((a, r) => a + r.score!, 0) / csatRows.length) * 10) / 10 : null,
      count: csatRows.length,
      satisfiedPct: csatRows.length ? Math.round((csatRows.filter((r) => r.score! >= 4).length / csatRows.length) * 100) : null,
    },
    enps: {
      minGroup,
      count: filtered.length,
      // Hidden (null) below the threshold, with only the count shown.
      score: filtered.length >= minGroup && !(filter.departmentId && departmentsHidden) ? npsOf(filtered) : null,
      departmentsHidden,
      byDepartment: [...byDept.entries()]
        .map(([departmentId, s]) => ({
          departmentId,
          name: departmentId ? (deptName.get(departmentId) ?? '—') : null,
          count: s.length,
          score: s.length >= minGroup && !departmentsHidden ? npsOf(s) : null,
        }))
        .sort((a, b) => b.count - a.count),
    },
    leads: {
      count: leadRows.length,
      bySource: [...leadsBySource.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
      byMonth: [...leadsByMonth.entries()].sort().map(([month, count]) => ({ month, count })),
    },
    byModule: [...byModule.entries()].map(([module, count]) => ({ module, count })).sort((a, b) => b.count - a.count),
  };
}
