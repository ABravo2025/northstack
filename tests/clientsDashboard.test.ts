import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    user: { findMany: vi.fn() },
    employee: { findMany: vi.fn() },
    opportunityStageHistory: { findMany: vi.fn() },
    lead: { findMany: vi.fn() },
    companyProduct: { findMany: vi.fn() },
    opportunity: { findMany: vi.fn() },
    company: { findMany: vi.fn() },
    clientTicket: { findMany: vi.fn() },
    companyCheckIn: { count: vi.fn() },
  },
}));
vi.mock('../src/modules/crm/healthService.js', () => ({ computeHealth: vi.fn(), setTicketCounter: vi.fn() }));

import prisma from '../src/lib/prisma.js';
import { computeHealth } from '../src/modules/crm/healthService.js';
import { getClientsDashboard, getSalesExtras } from '../src/modules/crm/clientsDashboardService.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const period = { from: '2026-10-01', to: '2026-10-31' };
const d = (s: string) => new Date(`${s}T12:00:00Z`);

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findMany.mockResolvedValue([{ id: 'u-sales' }, { id: 'u-ops' }]);
  db.employee.findMany.mockResolvedValue([
    { userId: 'u-sales', departmentId: 'dep-sales' },
    { userId: 'u-ops', departmentId: 'dep-ops' },
  ]);
});

describe('sales additions', () => {
  it('counts each won deal once, by its pipeline purpose and currency', async () => {
    const opp = (id: string, purpose: string, cents: number) => ({ opportunity: { id, amountCents: cents, currency: 'USD', pipeline: { purpose } } });
    db.opportunityStageHistory.findMany.mockResolvedValue([opp('o1', 'new_business', 1000), opp('o1', 'new_business', 1000), opp('o2', 'expansion', 500)]);
    db.lead.findMany.mockResolvedValue([
      { status: 'converted', touchCount: 3, formId: 'f1', utmSource: 'google', leadSource: null },
      { status: 'working', touchCount: 1, formId: null, utmSource: null, leadSource: null },
      { status: 'new', touchCount: 0, formId: null, utmSource: null, leadSource: null },
    ]);
    const r = await getSalesExtras('t1', period);
    expect(r.wonByPurpose).toEqual([
      { purpose: 'new_business', currency: 'USD', count: 1, cents: 1000 },
      { purpose: 'expansion', currency: 'USD', count: 1, cents: 500 },
    ]);
    expect(r.leads).toMatchObject({ total: 3, worked: 2, qualified: 1, converted: 1 });
  });

  it('filters by the owner’s department', async () => {
    db.opportunityStageHistory.findMany.mockResolvedValue([]);
    db.lead.findMany.mockResolvedValue([]);
    await getSalesExtras('t1', { ...period, departmentId: 'dep-sales' });
    expect(db.opportunityStageHistory.findMany.mock.calls[0][0].where.opportunity).toEqual({ ownerId: { in: ['u-sales'] } });
    expect(db.lead.findMany.mock.calls[0][0].where.ownerId).toEqual({ in: ['u-sales'] });
  });
});

describe('clients dashboard', () => {
  it('health spread, MRR, new MRR in the period and ticket SLA', async () => {
    db.companyProduct.findMany.mockResolvedValue([
      { companyId: 'co1', startDate: d('2026-10-05'), cancelledAt: null, quantity: 1, unitPriceCents: 10000, product: { billing: 'monthly', currency: 'USD' } },
      { companyId: 'co2', startDate: d('2026-03-01'), cancelledAt: d('2026-10-20'), quantity: 1, unitPriceCents: 5000, product: { billing: 'monthly', currency: 'USD' } },
    ]);
    db.opportunity.findMany.mockResolvedValue([{ companyId: 'co2' }]);
    vi.mocked(computeHealth).mockResolvedValue(new Map([['co1', { status: 'healthy' }], ['co2', { status: 'critical' }]]) as never);
    db.clientTicket.findMany.mockResolvedValue([
      { priority: 'high', status: 'resolved', createdAt: d('2026-10-02'), firstResponseDueAt: d('2026-10-02'), resolutionDueAt: d('2026-10-03'), firstRespondedAt: d('2026-10-02'), resolvedAt: d('2026-10-02') },
      { priority: 'urgent', status: 'resolved', createdAt: d('2026-10-10'), firstResponseDueAt: d('2026-10-10'), resolutionDueAt: d('2026-10-10'), firstRespondedAt: d('2026-10-11'), resolvedAt: d('2026-10-12') },
    ]);
    db.companyCheckIn.count.mockResolvedValue(4);
    const r = await getClientsDashboard('t1', period);
    expect(r).toMatchObject({ clients: 2, health: { healthy: 1, at_risk: 0, critical: 1 }, mrr: [{ currency: 'USD', cents: 10000 }], cancelledInPeriod: 1, checkIns: 4 });
    expect(r.newMrrByMonth).toEqual([{ month: '2026-10', byCurrency: [{ currency: 'USD', cents: 10000 }] }]);
    expect(r.tickets).toMatchObject({ opened: 2, resolved: 2, slaPct: 50 });
  });
});
