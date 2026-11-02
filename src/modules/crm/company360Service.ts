import prisma from '../../lib/prisma.js';

// Clientes C5 (spec-clientes-gastos-formularios.md): the company 360 view — one timeline of what
// happened with the account, and its onboarding. Products live in productService (C4), billing is
// the existing Payments tab, health (C6) and tickets (C7) add their own tabs.

export type TimelineEvent = {
  at: Date;
  kind:
    | 'opportunity_created'
    | 'stage_changed'
    | 'won'
    | 'lost'
    | 'handoff'
    | 'lead_converted'
    | 'product_added'
    | 'product_cancelled'
    | 'note'
    | 'task_done'
    | 'survey_answered';
  title: string;
  detail?: string | null;
  href?: string | null;
};

const MAX_EVENTS = 150;

// Opportunity events only for someone who can see opportunities.
export async function getCompanyTimeline(tenantId: string, companyId: string, opts: { canViewOpportunities: boolean }) {
  const company = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { id: true } });
  if (!company) return null;

  const [opportunities, contacts, products, notes, tasks, leads] = await Promise.all([
    opts.canViewOpportunities
      ? prisma.opportunity.findMany({
          where: { tenantId, companyId },
          select: {
            id: true,
            name: true,
            createdAt: true,
            handoffAt: true,
            stageHistory: { select: { enteredAt: true, stage: { select: { name: true, outcome: true } } }, orderBy: { enteredAt: 'asc' } },
          },
        })
      : [],
    prisma.contact.findMany({ where: { tenantId, companyId }, select: { id: true, firstName: true, lastName: true } }),
    prisma.companyProduct.findMany({ where: { tenantId, companyId }, select: { startDate: true, cancelledAt: true, quantity: true, product: { select: { name: true } } } }),
    prisma.note.findMany({ where: { tenantId, entityType: 'company', entityId: companyId }, select: { title: true, description: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.task.findMany({
      where: { tenantId, entityType: 'company', entityId: companyId, completedAt: { not: null } },
      select: { title: true, completedAt: true },
      orderBy: { completedAt: 'desc' },
      take: 50,
    }),
    prisma.lead.findMany({ where: { tenantId, convertedCompanyId: companyId }, select: { firstName: true, lastName: true, convertedAt: true } }),
  ]);

  // Only the score and the form's name — answers stay encrypted and in Formularios.
  const responses = contacts.length
    ? await prisma.formResponse.findMany({
        where: { tenantId, linkedEntityType: 'contact', linkedEntityId: { in: contacts.map((c) => c.id) } },
        select: { createdAt: true, score: true, linkedEntityId: true, form: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
    : [];
  const contactName = new Map(contacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()]));

  const events: TimelineEvent[] = [];
  for (const o of opportunities) {
    events.push({ at: o.createdAt, kind: 'opportunity_created', title: o.name, href: '/opportunities' });
    // The first history row is the stage it was created in, not a move.
    for (const h of o.stageHistory.slice(1)) {
      const kind = h.stage.outcome === 'won' ? 'won' : h.stage.outcome === 'lost' ? 'lost' : 'stage_changed';
      events.push({ at: h.enteredAt, kind, title: o.name, detail: h.stage.name, href: '/opportunities' });
    }
    if (o.handoffAt) events.push({ at: o.handoffAt, kind: 'handoff', title: o.name });
  }
  for (const l of leads) {
    if (l.convertedAt) events.push({ at: l.convertedAt, kind: 'lead_converted', title: `${l.firstName} ${l.lastName}`.trim() });
  }
  for (const p of products) {
    events.push({ at: p.startDate, kind: 'product_added', title: p.product.name, detail: p.quantity > 1 ? `× ${p.quantity}` : null });
    if (p.cancelledAt) events.push({ at: p.cancelledAt, kind: 'product_cancelled', title: p.product.name });
  }
  for (const n of notes) events.push({ at: n.createdAt, kind: 'note', title: n.title, detail: n.description.slice(0, 160) });
  for (const t of tasks) events.push({ at: t.completedAt!, kind: 'task_done', title: t.title });
  for (const r of responses) {
    events.push({
      at: r.createdAt,
      kind: 'survey_answered',
      title: r.form.name,
      detail: [contactName.get(r.linkedEntityId ?? ''), r.score !== null ? String(r.score) : null].filter(Boolean).join(' · '),
      href: '/forms/responses',
    });
  }
  return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, MAX_EVENTS);
}

// The company's projects (onboarding first): progress by tasks done, and whether it's the one
// created by a deal's hand-off.
export async function getCompanyOnboarding(tenantId: string, companyId: string) {
  const company = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { id: true } });
  if (!company) return null;
  const [projects, handoffs] = await Promise.all([
    prisma.project.findMany({
      where: { tenantId, companyId },
      select: { id: true, name: true, status: true, startDate: true, dueDate: true, ownerEmployee: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.opportunity.findMany({ where: { tenantId, companyId, handoffProjectId: { not: null } }, select: { handoffProjectId: true } }),
  ]);
  const handoffIds = new Set(handoffs.map((h) => h.handoffProjectId));
  const counts = projects.length
    ? await prisma.task.groupBy({
        by: ['entityId'],
        where: { tenantId, entityType: 'project', entityId: { in: projects.map((p) => p.id) } },
        _count: { _all: true },
      })
    : [];
  const done = projects.length
    ? await prisma.task.groupBy({
        by: ['entityId'],
        where: { tenantId, entityType: 'project', entityId: { in: projects.map((p) => p.id) }, completedAt: { not: null } },
        _count: { _all: true },
      })
    : [];
  const total = new Map(counts.map((c) => [c.entityId, c._count._all]));
  const finished = new Map(done.map((c) => [c.entityId, c._count._all]));
  return projects
    .map((p) => ({
      ...p,
      isOnboarding: handoffIds.has(p.id),
      tasks: total.get(p.id) ?? 0,
      tasksDone: finished.get(p.id) ?? 0,
    }))
    .sort((a, b) => Number(b.isOnboarding) - Number(a.isOnboarding));
}
