import type { ClientTicketPriority, ClientTicketStatus, Prisma } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { setTicketCounter } from './healthService.js';

// Clientes C7 (spec-clientes-gastos-formularios.md): customer tickets with an SLA. Each priority
// sets when the first response and the resolution are due (calendar hours). A ticket is "overdue"
// when one of those passed without it being met. Every lookup is scoped by tenant first.

export class TicketError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string,
  ) {
    super(message);
  }
}

export const PRIORITIES: ClientTicketPriority[] = ['low', 'normal', 'high', 'urgent'];
export const STATUSES: ClientTicketStatus[] = ['open', 'in_progress', 'waiting', 'resolved', 'closed'];
export const OPEN_STATUSES: ClientTicketStatus[] = ['open', 'in_progress', 'waiting'];

// Hours to first response / to resolution.
export const SLA_HOURS: Record<ClientTicketPriority, { response: number; resolution: number }> = {
  urgent: { response: 1, resolution: 8 },
  high: { response: 4, resolution: 24 },
  normal: { response: 8, resolution: 72 },
  low: { response: 24, resolution: 120 },
};

const HOUR = 3_600_000;

export function slaDue(createdAt: Date, priority: ClientTicketPriority) {
  const h = SLA_HOURS[priority];
  return { firstResponseDueAt: new Date(createdAt.getTime() + h.response * HOUR), resolutionDueAt: new Date(createdAt.getTime() + h.resolution * HOUR) };
}

export function slaState(
  t: { status: ClientTicketStatus; firstResponseDueAt: Date; resolutionDueAt: Date; firstRespondedAt: Date | null; resolvedAt: Date | null },
  now = new Date(),
) {
  const responseBreached = t.firstRespondedAt ? t.firstRespondedAt > t.firstResponseDueAt : now > t.firstResponseDueAt;
  const resolutionBreached = t.resolvedAt ? t.resolvedAt > t.resolutionDueAt : now > t.resolutionDueAt;
  const open = OPEN_STATUSES.includes(t.status);
  return { responseBreached, resolutionBreached, overdue: open && ((!t.firstRespondedAt && responseBreached) || resolutionBreached) };
}

// The health score (C6) counts open and overdue tickets per company.
setTicketCounter(async (tenantId, companyIds) => {
  const rows = await prisma.clientTicket.findMany({
    where: { tenantId, companyId: { in: companyIds }, status: { in: OPEN_STATUSES } },
    select: { companyId: true, status: true, firstResponseDueAt: true, resolutionDueAt: true, firstRespondedAt: true, resolvedAt: true },
  });
  const out = new Map<string, { open: number; overdue: number }>();
  for (const r of rows) {
    const c = out.get(r.companyId!) ?? { open: 0, overdue: 0 };
    c.open++;
    if (slaState(r).overdue) c.overdue++;
    out.set(r.companyId!, c);
  }
  return out;
});

const include = {
  company: { select: { id: true, name: true } },
  comments: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.ClientTicketInclude;

function present<T extends Parameters<typeof slaState>[0]>(t: T) {
  return { ...t, sla: slaState(t) };
}

async function nextNumber(tenantId: string) {
  const last = await prisma.clientTicket.findFirst({ where: { tenantId }, orderBy: { number: 'desc' }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}

export interface CreateTicketInput {
  subject: string;
  description?: string | null;
  priority?: ClientTicketPriority;
  companyId?: string | null;
  contactId?: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
  assigneeId?: string | null;
  source?: 'manual' | 'form';
  formResponseId?: string | null;
}

export async function createTicket(tenantId: string, userId: string | null, input: CreateTicketInput) {
  const subject = input.subject?.trim().slice(0, 200);
  if (!subject) throw new TicketError('Subject is required', 400, 'subject_required');
  const priority = input.priority && PRIORITIES.includes(input.priority) ? input.priority : 'normal';
  if (input.companyId && !(await prisma.company.findFirst({ where: { id: input.companyId, tenantId }, select: { id: true } }))) throw new TicketError('Company not found', 404);
  if (input.assigneeId && !(await prisma.user.findFirst({ where: { id: input.assigneeId, tenantId }, select: { id: true } }))) throw new TicketError('Assignee not found', 404);
  let companyId = input.companyId ?? null;
  let contactId = input.contactId ?? null;
  if (contactId) {
    const contact = await prisma.contact.findFirst({ where: { id: contactId, tenantId }, select: { id: true, companyId: true } });
    if (!contact) throw new TicketError('Contact not found', 404);
    companyId = companyId ?? contact.companyId;
  } else if (input.requesterEmail) {
    // A request from a known contact lands on their company.
    const contact = await prisma.contact.findUnique({ where: { tenantId_email: { tenantId, email: input.requesterEmail.trim().toLowerCase() } }, select: { id: true, companyId: true } });
    if (contact) {
      contactId = contact.id;
      companyId = companyId ?? contact.companyId;
    }
  }
  const now = new Date();
  // The (tenantId, number) unique key settles a race between two tickets created at once.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ticket = await prisma.clientTicket.create({
        data: {
          tenantId,
          number: await nextNumber(tenantId),
          subject,
          description: input.description?.trim().slice(0, 10_000) || null,
          priority,
          companyId,
          contactId,
          requesterName: input.requesterName?.trim().slice(0, 200) || null,
          requesterEmail: input.requesterEmail?.trim().toLowerCase().slice(0, 200) || null,
          assigneeId: input.assigneeId ?? null,
          source: input.source ?? 'manual',
          formResponseId: input.formResponseId ?? null,
          createdById: userId,
          ...slaDue(now, priority),
        },
        include,
      });
      return present(ticket);
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002' || attempt === 2) throw error;
    }
  }
  throw new TicketError('Could not number the ticket', 500);
}

export async function listTickets(tenantId: string, filter: { view?: 'open' | 'closed' | 'all'; companyId?: string; assigneeId?: string; q?: string }) {
  const q = filter.q?.trim();
  const rows = await prisma.clientTicket.findMany({
    where: {
      tenantId,
      ...(filter.view === 'closed' ? { status: { in: ['resolved', 'closed'] } } : filter.view === 'all' ? {} : { status: { in: OPEN_STATUSES } }),
      ...(filter.companyId ? { companyId: filter.companyId } : {}),
      ...(filter.assigneeId ? { assigneeId: filter.assigneeId === 'none' ? null : filter.assigneeId } : {}),
      ...(q ? { OR: [{ subject: { contains: q, mode: 'insensitive' } }, { requesterEmail: { contains: q, mode: 'insensitive' } }, ...(/^\d+$/.test(q) ? [{ number: Number(q) }] : [])] } : {}),
    },
    orderBy: [{ resolutionDueAt: 'asc' }],
    include: { company: { select: { id: true, name: true } } },
    take: 500,
  });
  return rows.map(present);
}

export async function getTicket(tenantId: string, id: string) {
  const t = await prisma.clientTicket.findFirst({ where: { id, tenantId }, include });
  if (!t) throw new TicketError('Ticket not found', 404);
  return present(t);
}

export async function updateTicket(
  tenantId: string,
  id: string,
  input: { status?: ClientTicketStatus; priority?: ClientTicketPriority; assigneeId?: string | null; companyId?: string | null; subject?: string },
) {
  const t = await prisma.clientTicket.findFirst({ where: { id, tenantId } });
  if (!t) throw new TicketError('Ticket not found', 404);
  const data: Prisma.ClientTicketUncheckedUpdateInput = {};
  if (input.subject !== undefined) {
    const s = input.subject.trim().slice(0, 200);
    if (!s) throw new TicketError('Subject is required', 400, 'subject_required');
    data.subject = s;
  }
  if (input.assigneeId !== undefined) {
    if (input.assigneeId && !(await prisma.user.findFirst({ where: { id: input.assigneeId, tenantId }, select: { id: true } }))) throw new TicketError('Assignee not found', 404);
    data.assigneeId = input.assigneeId || null;
  }
  if (input.companyId !== undefined) {
    if (input.companyId && !(await prisma.company.findFirst({ where: { id: input.companyId, tenantId }, select: { id: true } }))) throw new TicketError('Company not found', 404);
    data.companyId = input.companyId || null;
  }
  if (input.priority !== undefined) {
    if (!PRIORITIES.includes(input.priority)) throw new TicketError('Invalid priority', 400);
    // A new priority resets the SLA clock from when the ticket was opened.
    data.priority = input.priority;
    Object.assign(data, slaDue(t.createdAt, input.priority));
  }
  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status)) throw new TicketError('Invalid status', 400);
    data.status = input.status;
    const now = new Date();
    if ((input.status === 'resolved' || input.status === 'closed') && !t.resolvedAt) data.resolvedAt = now;
    if (input.status === 'closed' && !t.closedAt) data.closedAt = now;
    if (OPEN_STATUSES.includes(input.status)) {
      data.resolvedAt = null;
      data.closedAt = null;
    }
  }
  const updated = await prisma.clientTicket.update({ where: { id }, data, include });
  return present(updated);
}

export async function addComment(tenantId: string, userId: string, id: string, input: { body: string; internal?: boolean }) {
  const t = await prisma.clientTicket.findFirst({ where: { id, tenantId } });
  if (!t) throw new TicketError('Ticket not found', 404);
  const body = input.body?.trim().slice(0, 10_000);
  if (!body) throw new TicketError('Write something', 400, 'body_required');
  await prisma.clientTicketComment.create({ data: { tenantId, ticketId: id, authorId: userId, body, internal: input.internal === true } });
  // The first reply to the client (not an internal note) meets the first-response SLA.
  if (!input.internal && !t.firstRespondedAt) {
    await prisma.clientTicket.update({ where: { id }, data: { firstRespondedAt: new Date(), ...(t.status === 'open' ? { status: 'in_progress' } : {}) } });
  }
  return getTicket(tenantId, id);
}
