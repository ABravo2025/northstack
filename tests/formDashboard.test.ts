import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: { formResponse: { findMany: vi.fn() }, fieldCatalogDefinition: { findMany: vi.fn() } },
}));

import prisma from '../src/lib/prisma.js';
import { getFormsDashboard, npsOf } from '../src/modules/forms/formDashboardService.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

const at = new Date('2026-10-15T12:00:00Z');
const clientNps = (score: number) => ({ score, createdAt: at, departmentId: null, source: 'personal_link', linkedEntityType: 'contact', utmSource: null, form: { kind: 'survey', module: 'clients', action: 'save_only', surveySettings: { metric: 'nps' } } });
const enps = (score: number, departmentId: string) => ({ score, createdAt: at, departmentId, source: 'personal_link', linkedEntityType: null, utmSource: null, form: { kind: 'survey', module: 'employees', action: 'save_to_file', surveySettings: { metric: 'enps', anonymous: true, minAnonymousGroup: 3 } } });
const lead = (utmSource: string | null, source = 'public_link') => ({ score: null, createdAt: at, departmentId: null, source, linkedEntityType: 'contact', utmSource, form: { kind: 'form', module: 'leads', action: 'create_lead', surveySettings: null } });

beforeEach(() => {
  vi.clearAllMocks();
  db.fieldCatalogDefinition.findMany.mockResolvedValue([
    { id: 'ops', name: 'Operaciones' },
    { id: 'sales', name: 'Ventas' },
  ]);
});

describe('surveys dashboard', () => {
  it('computes NPS as promoters minus detractors', () => {
    expect(npsOf([10, 9, 8, 6])).toBe(25);
    expect(npsOf([])).toBeNull();
  });

  it('shows client NPS with its breakdown, scoped to the tenant and range', async () => {
    db.formResponse.findMany.mockResolvedValue([clientNps(10), clientNps(9), clientNps(7), clientNps(3)]);
    const d = await getFormsDashboard('t1', { from: '2026-10-01', to: '2026-10-31' });
    expect(db.formResponse.findMany.mock.calls[0][0].where.tenantId).toBe('t1');
    expect(d.nps).toMatchObject({ score: 25, count: 4, promoters: 2, passives: 1, detractors: 1 });
    expect(d.nps.byMonth).toEqual([{ month: '2026-10', score: 25, count: 4 }]);
  });

  it('never shows an eNPS for a department below the anonymity threshold', async () => {
    const ops = [enps(10, 'ops'), enps(9, 'ops'), enps(2, 'ops')];
    const big = [enps(10, 'big'), enps(10, 'big'), enps(8, 'big')];
    db.formResponse.findMany.mockResolvedValue([...ops, ...big, enps(3, 'sales'), enps(10, 'sales'), enps(9, 'sales')]);
    const d = await getFormsDashboard('t1', { from: '2026-10-01', to: '2026-10-31' });
    expect(d.enps.byDepartment.find((x) => x.departmentId === 'ops')).toMatchObject({ count: 3, score: 33 });

    db.formResponse.findMany.mockResolvedValue([...ops, enps(3, 'sales')]);
    const onlySales = await getFormsDashboard('t1', { from: '2026-10-01', to: '2026-10-31', departmentId: 'sales' });
    expect(onlySales.enps).toMatchObject({ count: 1, score: null });
  });

  it('hides every department when the total minus the visible ones would reveal a small one', async () => {
    db.formResponse.findMany.mockResolvedValue([enps(10, 'ops'), enps(9, 'ops'), enps(2, 'ops'), enps(3, 'sales'), enps(10, 'sales')]);
    const d = await getFormsDashboard('t1', { from: '2026-10-01', to: '2026-10-31' });
    expect(d.enps).toMatchObject({ score: 20, departmentsHidden: true });
    expect(d.enps.byDepartment.every((x) => x.score === null)).toBe(true);
    const onlyOps = await getFormsDashboard('t1', { from: '2026-10-01', to: '2026-10-31', departmentId: 'ops' });
    expect(onlyOps.enps.score).toBeNull();
  });

  it('counts leads from forms by campaign, website or direct link', async () => {
    db.formResponse.findMany.mockResolvedValue([lead('google'), lead('google'), lead(null, 'embed'), lead(null)]);
    const d = await getFormsDashboard('t1', { from: '2026-10-01', to: '2026-10-31' });
    expect(d.leads.count).toBe(4);
    expect(d.leads.bySource).toEqual([
      { source: 'google', count: 2 },
      { source: 'website', count: 1 },
      { source: 'direct', count: 1 },
    ]);
    expect(d.byModule).toEqual([{ module: 'leads', count: 4 }]);
  });
});
