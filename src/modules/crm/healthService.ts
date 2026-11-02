import type { CheckInSentiment } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { healthScore, suggestedNextCheckIn, type HealthInput } from './healthLogic.js';

// Clientes C6: computes each client's health from what's already in Northstack (surveys,
// check-ins, notes, meetings, onboarding, products, tickets) — nothing is stored, so it's always
// current. Batch-friendly: the Clients dashboard (C9) asks for many companies at once.

const DAY = 86_400_000;

// Ticket counts come from C7; until then a company has none.
export type TicketCounter = (tenantId: string, companyIds: string[]) => Promise<Map<string, { open: number; overdue: number }>>;
let countTickets: TicketCounter = async () => new Map();
export function setTicketCounter(fn: TicketCounter) {
  countTickets = fn;
}

export async function computeHealth(tenantId: string, companyIds: string[], now = new Date()) {
  if (!companyIds.length) return new Map<string, ReturnType<typeof healthScore> & { lastContactAt: Date | null; nextCheckInAt: Date | null }>();
  const since180 = new Date(now.getTime() - 180 * DAY);
  const since90 = new Date(now.getTime() - 90 * DAY);

  const [contacts, checkIns, notes, meetings, deals, products, tickets] = await Promise.all([
    prisma.contact.findMany({ where: { tenantId, companyId: { in: companyIds } }, select: { id: true, companyId: true } }),
    prisma.companyCheckIn.findMany({ where: { tenantId, companyId: { in: companyIds } }, orderBy: { at: 'desc' }, select: { companyId: true, at: true, sentiment: true, nextCheckInAt: true } }),
    prisma.note.groupBy({ by: ['entityId'], where: { tenantId, entityType: 'company', entityId: { in: companyIds } }, _max: { createdAt: true } }),
    prisma.task.groupBy({ by: ['entityId'], where: { tenantId, entityType: 'company', entityId: { in: companyIds }, completedAt: { not: null } }, _max: { completedAt: true } }),
    prisma.opportunity.findMany({ where: { tenantId, companyId: { in: companyIds }, handoffProjectId: { not: null } }, select: { companyId: true, handoffProjectId: true }, orderBy: { handoffAt: 'desc' } }),
    prisma.companyProduct.findMany({ where: { tenantId, companyId: { in: companyIds } }, select: { companyId: true, cancelledAt: true } }),
    countTickets(tenantId, companyIds),
  ]);

  const contactCompany = new Map(contacts.map((c) => [c.id, c.companyId!]));
  const responses = contacts.length
    ? await prisma.formResponse.findMany({
        where: { tenantId, linkedEntityType: 'contact', linkedEntityId: { in: contacts.map((c) => c.id) }, score: { not: null }, createdAt: { gte: since180 } },
        select: { linkedEntityId: true, score: true, form: { select: { kind: true, module: true, surveySettings: true } } },
      })
    : [];

  const projectIds = deals.map((d) => d.handoffProjectId!).filter(Boolean);
  const [projects, taskTotals, taskDone] = projectIds.length
    ? await Promise.all([
        prisma.project.findMany({ where: { tenantId, id: { in: projectIds } }, select: { id: true, status: true } }),
        prisma.task.groupBy({ by: ['entityId'], where: { tenantId, entityType: 'project', entityId: { in: projectIds } }, _count: { _all: true } }),
        prisma.task.groupBy({ by: ['entityId'], where: { tenantId, entityType: 'project', entityId: { in: projectIds }, completedAt: { not: null } }, _count: { _all: true } }),
      ])
    : [[], [], []];
  const projectStatus = new Map(projects.map((p) => [p.id, p.status]));
  const totals = new Map(taskTotals.map((t) => [t.entityId, t._count._all]));
  const dones = new Map(taskDone.map((t) => [t.entityId, t._count._all]));

  const out = new Map<string, ReturnType<typeof healthScore> & { lastContactAt: Date | null; nextCheckInAt: Date | null }>();
  for (const companyId of companyIds) {
    const companyCheckIns = checkIns.filter((c) => c.companyId === companyId);
    const lastCheckIn = companyCheckIns[0] ?? null;
    const lastNote = notes.find((n) => n.entityId === companyId)?._max.createdAt ?? null;
    const lastMeeting = meetings.find((m) => m.entityId === companyId)?._max.completedAt ?? null;
    const lastContactAt = [lastCheckIn?.at ?? null, lastNote, lastMeeting].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const surveyScores: HealthInput['surveyScores'] = responses
      .filter((r) => contactCompany.get(r.linkedEntityId!) === companyId && r.form.kind === 'survey')
      .filter((r) => (r.form.surveySettings as { countsTowardHealth?: boolean } | null)?.countsTowardHealth !== false)
      .map((r) => ({ score: r.score!, scale: (r.form.surveySettings as { metric?: string } | null)?.metric === 'csat' ? 'csat' : 'nps' }));

    const handoffProject = deals.find((d) => d.companyId === companyId)?.handoffProjectId ?? null;
    const lines = products.filter((p) => p.companyId === companyId);
    const t = tickets.get(companyId) ?? { open: 0, overdue: 0 };

    const result = healthScore({
      surveyScores,
      daysSinceContact: lastContactAt ? Math.floor((now.getTime() - lastContactAt.getTime()) / DAY) : null,
      lastSentiment: lastCheckIn?.sentiment ?? null,
      onboarding: handoffProject
        ? { tasks: totals.get(handoffProject) ?? 0, done: dones.get(handoffProject) ?? 0, completed: projectStatus.get(handoffProject) === 'completed' }
        : null,
      activeProducts: lines.filter((l) => !l.cancelledAt).length,
      cancelledLast90: lines.filter((l) => l.cancelledAt && l.cancelledAt >= since90).length,
      openTickets: t.open,
      overdueTickets: t.overdue,
    });
    const nextCheckInAt = lastCheckIn?.nextCheckInAt ?? (lastCheckIn ? suggestedNextCheckIn(lastCheckIn.at, lastCheckIn.sentiment) : null);
    out.set(companyId, { ...result, lastContactAt, nextCheckInAt });
  }
  return out;
}

export async function getCompanyHealth(tenantId: string, companyId: string) {
  const company = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { id: true } });
  if (!company) return null;
  const [health, checkIns] = await Promise.all([
    computeHealth(tenantId, [companyId]),
    prisma.companyCheckIn.findMany({ where: { tenantId, companyId }, orderBy: { at: 'desc' }, take: 30 }),
  ]);
  const users = await prisma.user.findMany({
    where: { tenantId, id: { in: checkIns.map((c) => c.byUserId).filter((x): x is string => !!x) } },
    select: { id: true, firstName: true, lastName: true },
  });
  const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
  return { ...health.get(companyId)!, checkIns: checkIns.map((c) => ({ ...c, byName: c.byUserId ? (names.get(c.byUserId) ?? null) : null })) };
}

const SENTIMENTS: CheckInSentiment[] = ['good', 'neutral', 'bad'];

export async function addCheckIn(tenantId: string, userId: string, companyId: string, input: { sentiment: string; note?: string | null; nextCheckInAt?: string | null }) {
  const company = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { id: true } });
  if (!company) return { error: 'Company not found', status: 404 } as const;
  if (!SENTIMENTS.includes(input.sentiment as CheckInSentiment)) return { error: 'Invalid sentiment', status: 400 } as const;
  const sentiment = input.sentiment as CheckInSentiment;
  const now = new Date();
  const next =
    typeof input.nextCheckInAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.nextCheckInAt)
      ? new Date(`${input.nextCheckInAt}T00:00:00Z`)
      : suggestedNextCheckIn(now, sentiment);
  const checkIn = await prisma.companyCheckIn.create({
    data: { tenantId, companyId, byUserId: userId, at: now, sentiment, note: input.note?.trim().slice(0, 2000) || null, nextCheckInAt: next },
  });
  return { checkIn } as const;
}
