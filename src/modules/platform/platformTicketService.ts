import prisma from '../../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import { createNote, listNotesForEntity } from '../notes/noteService.js';
import { sendTicketNoteCreatedEmail } from '../../lib/mailer.js';
import type { SortOrder } from './platformTenantService.js';

const ticketInclude = {
  tenant: { select: { id: true, name: true } },
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  status: true,
} satisfies Prisma.TicketInclude;

export type TicketSortField = 'subject' | 'createdAt';

export interface ListTicketsInput {
  status?: string; // status key, or '__open__' for "not terminal"
  assignee?: string; // userId, or 'unassigned'
  search?: string;
  sortBy: TicketSortField;
  sortOrder: SortOrder;
}

export async function listTickets(input: ListTicketsInput) {
  const where: Prisma.TicketWhereInput = {};

  if (input.status === '__open__') {
    where.status = { isTerminal: false };
  } else if (input.status) {
    where.status = { key: input.status };
  }

  if (input.assignee === 'unassigned') {
    where.assignedToUserId = null;
  } else if (input.assignee) {
    where.assignedToUserId = input.assignee;
  }

  if (input.search) {
    where.OR = [
      { subject: { contains: input.search, mode: 'insensitive' } },
      { tenant: { name: { contains: input.search, mode: 'insensitive' } } },
      {
        user: {
          OR: [
            { firstName: { contains: input.search, mode: 'insensitive' } },
            { lastName: { contains: input.search, mode: 'insensitive' } },
            { email: { contains: input.search, mode: 'insensitive' } },
          ],
        },
      },
    ];
  }

  return prisma.ticket.findMany({
    where,
    include: ticketInclude,
    orderBy: { [input.sortBy]: input.sortOrder },
  });
}

export async function getTicketWithNotes(id: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id }, include: ticketInclude });
  if (!ticket) return null;
  const notes = await listNotesForEntity(ticket.tenantId, 'ticket', ticket.id);
  return { ...ticket, notes };
}

export interface CreateTicketInput {
  tenantId: string;
  userId?: string;
  createdByType: 'user' | 'platform_staff';
  subject: string;
  description: string;
}

export async function createTicket(input: CreateTicketInput) {
  const defaultStatus = await prisma.platformStatusDefinition.findFirstOrThrow({
    where: { entityType: 'ticket', isDefault: true },
  });

  return prisma.ticket.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      createdByType: input.createdByType,
      subject: input.subject,
      description: input.description,
      statusId: defaultStatus.id,
    },
    include: ticketInclude,
  });
}

export interface UpdateTicketInput {
  statusId?: string;
  assignedToUserId?: string | null;
}

export async function updateTicket(id: string, input: UpdateTicketInput) {
  // Whitelist explicitly — never spread req.body straight through (same rule
  // as every other update service in the app).
  const data: Prisma.TicketUncheckedUpdateInput = {};
  if (input.statusId !== undefined) data.statusId = input.statusId;
  if (input.assignedToUserId !== undefined) data.assignedToUserId = input.assignedToUserId;

  return prisma.ticket.update({ where: { id }, data, include: ticketInclude });
}

// The Notes thread's "Admin/Support/Tenant" author distinction (per the UI
// spec) is derived from the author's platformRole rather than stored as a
// separate field -- reuses the identity Notes already has via createdBy,
// no new mechanism.
export async function createTicketNote(ticketId: string, createdById: string, description: string) {
  const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  const author = await prisma.user.findUniqueOrThrow({ where: { id: createdById } });

  const note = await createNote({
    tenantId: ticket.tenantId,
    entityType: 'ticket',
    entityId: ticket.id,
    title: 'Reply',
    description,
    createdById,
  });

  if (author.platformRole && ticket.userId) {
    const reporter = await prisma.user.findUnique({ where: { id: ticket.userId } });
    if (reporter) {
      sendTicketNoteCreatedEmail({
        to: reporter.email,
        ticketSubject: ticket.subject,
        authorName: `${author.firstName} ${author.lastName}`,
        noteBody: description,
      }).catch((error) => {
        // Best-effort, same pattern as invitationService.ts's invitation
        // email -- the note itself already exists, a failed send shouldn't
        // fail the request.
        console.error('Failed to send ticket note email:', error);
      });
    }
  }

  return note;
}

export interface CreateIdeaInput {
  tenantId: string;
  userId?: string;
  createdByType: 'user' | 'platform_staff';
  subject: string;
  description: string;
}

// No list/detail/patch routes yet -- Ideas UI is a future block (see
// docs/Admin-platform/spec-admin-center-tickets-ideas.md section 6). This is
// used by the in-app feedback form (Block 7) to persist an Idea.
export async function createIdea(input: CreateIdeaInput) {
  const defaultStatus = await prisma.platformStatusDefinition.findFirstOrThrow({
    where: { entityType: 'idea', isDefault: true },
  });

  return prisma.idea.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      createdByType: input.createdByType,
      subject: input.subject,
      description: input.description,
      statusId: defaultStatus.id,
    },
  });
}
