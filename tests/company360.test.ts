import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    company: { findFirst: vi.fn() },
    opportunity: { findMany: vi.fn() },
    contact: { findMany: vi.fn() },
    companyProduct: { findMany: vi.fn() },
    note: { findMany: vi.fn() },
    task: { findMany: vi.fn(), groupBy: vi.fn() },
    lead: { findMany: vi.fn() },
    formResponse: { findMany: vi.fn() },
    project: { findMany: vi.fn() },
  },
}));

import prisma from '../src/lib/prisma.js';
import { getCompanyOnboarding, getCompanyTimeline } from '../src/modules/crm/company360Service.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const d = (s: string) => new Date(`${s}T12:00:00Z`);

beforeEach(() => {
  vi.clearAllMocks();
  db.company.findFirst.mockResolvedValue({ id: 'co1' });
  for (const m of [db.opportunity.findMany, db.contact.findMany, db.companyProduct.findMany, db.note.findMany, db.task.findMany, db.lead.findMany, db.formResponse.findMany]) m.mockResolvedValue([]);
});

describe('company 360', () => {
  it('another tenant’s company is not found', async () => {
    db.company.findFirst.mockResolvedValue(null);
    expect(await getCompanyTimeline('t1', 'co-of-B', { canViewOpportunities: true })).toBeNull();
    expect(db.company.findFirst).toHaveBeenCalledWith({ where: { id: 'co-of-B', tenantId: 't1' }, select: { id: true } });
  });

  it('merges deals, products, notes and survey scores newest first, never the answers', async () => {
    db.opportunity.findMany.mockResolvedValue([
      {
        id: 'o1',
        name: 'Acme · Pro',
        createdAt: d('2026-09-01'),
        handoffAt: d('2026-10-02'),
        stageHistory: [
          { enteredAt: d('2026-09-01'), stage: { name: 'Calificado', outcome: 'open' } },
          { enteredAt: d('2026-10-01'), stage: { name: 'Ganada', outcome: 'won' } },
        ],
      },
    ]);
    db.contact.findMany.mockResolvedValue([{ id: 'c1', firstName: 'Ana', lastName: 'Paz' }]);
    db.companyProduct.findMany.mockResolvedValue([{ startDate: d('2026-10-03'), cancelledAt: null, quantity: 2, product: { name: 'Plan Pro' } }]);
    db.formResponse.findMany.mockResolvedValue([{ createdAt: d('2026-10-20'), score: 9, linkedEntityId: 'c1', form: { name: 'NPS clientes' } }]);
    const events = (await getCompanyTimeline('t1', 'co1', { canViewOpportunities: true }))!;
    expect(events.map((e) => e.kind)).toEqual(['survey_answered', 'product_added', 'handoff', 'won', 'opportunity_created']);
    expect(events[0]).toMatchObject({ title: 'NPS clientes', detail: 'Ana Paz · 9' });
    expect(db.formResponse.findMany.mock.calls[0][0].select).not.toHaveProperty('answersEnc');
  });

  it('leaves deals out for someone who can’t see opportunities', async () => {
    await getCompanyTimeline('t1', 'co1', { canViewOpportunities: false });
    expect(db.opportunity.findMany).not.toHaveBeenCalled();
  });

  it('lists projects with progress, the hand-off one first', async () => {
    db.project.findMany.mockResolvedValue([
      { id: 'p-other', name: 'Soporte', status: 'active' },
      { id: 'p-onb', name: 'Onboarding · Acme', status: 'active' },
    ]);
    db.opportunity.findMany.mockResolvedValue([{ handoffProjectId: 'p-onb' }]);
    db.task.groupBy.mockResolvedValueOnce([{ entityId: 'p-onb', _count: { _all: 10 } }]).mockResolvedValueOnce([{ entityId: 'p-onb', _count: { _all: 4 } }]);
    const projects = (await getCompanyOnboarding('t1', 'co1'))!;
    expect(projects[0]).toMatchObject({ id: 'p-onb', isOnboarding: true, tasks: 10, tasksDone: 4 });
    expect(projects[1]).toMatchObject({ id: 'p-other', isOnboarding: false, tasks: 0 });
  });
});
