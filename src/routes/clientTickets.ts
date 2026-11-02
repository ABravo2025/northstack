import type express from 'express';
import type { ClientTicketPriority, ClientTicketStatus } from '@prisma/client';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { canManageCompany, canViewCompany } from '../modules/auth/permissionService.js';
import { isClientsAllowed } from '../modules/tenant/planLimits.js';
import { TicketError, addComment, createTicket, getTicket, listTickets, updateTicket } from '../modules/crm/ticketService.js';

// Clientes C7: customer tickets with SLA. Company permissions, Growth (clientsEnabled). Under
// /api/client-tickets so it never collides with /api/tickets (Northstack's own support).
export const clientTicketsRouter = createAsyncRouter();

async function guard(req: express.Request, res: express.Response, write: boolean) {
  const user = await validateSession(req, res);
  if (!user) return null;
  if (!(write ? canManageCompany(user.roleContext) : canViewCompany(user.roleContext))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return null;
  }
  if (!isClientsAllowed(user.tenant)) {
    res.status(403).json({ error: 'Customer tickets are part of the Growth plan', code: 'plan_required' });
    return null;
  }
  return user;
}

function fail(res: express.Response, error: unknown) {
  if (error instanceof TicketError) return res.status(error.status).json({ error: error.message, code: error.code });
  throw error;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

clientTicketsRouter.get('/api/client-tickets', async (req, res) => {
  const user = await guard(req, res, false);
  if (!user) return;
  const view = req.query.view === 'closed' || req.query.view === 'all' ? req.query.view : 'open';
  return res.json(await listTickets(user.tenantId!, { view, companyId: str(req.query.companyId), assigneeId: str(req.query.assigneeId), q: str(req.query.q) }));
});

clientTicketsRouter.get('/api/client-tickets/:id', async (req, res) => {
  const user = await guard(req, res, false);
  if (!user) return;
  try {
    return res.json(await getTicket(user.tenantId!, req.params.id));
  } catch (error) {
    return fail(res, error);
  }
});

clientTicketsRouter.post('/api/client-tickets', async (req, res) => {
  const user = await guard(req, res, true);
  if (!user) return;
  const b = req.body ?? {};
  try {
    return res.status(201).json(
      await createTicket(user.tenantId!, user.id, {
        subject: String(b.subject ?? ''),
        description: typeof b.description === 'string' ? b.description : null,
        priority: b.priority as ClientTicketPriority,
        companyId: str(b.companyId) ?? null,
        contactId: str(b.contactId) ?? null,
        requesterName: str(b.requesterName) ?? null,
        requesterEmail: str(b.requesterEmail) ?? null,
        assigneeId: str(b.assigneeId) ?? null,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
});

clientTicketsRouter.patch('/api/client-tickets/:id', async (req, res) => {
  const user = await guard(req, res, true);
  if (!user) return;
  const b = req.body ?? {};
  try {
    return res.json(
      await updateTicket(user.tenantId!, req.params.id, {
        status: b.status as ClientTicketStatus | undefined,
        priority: b.priority as ClientTicketPriority | undefined,
        assigneeId: b.assigneeId === null ? null : str(b.assigneeId),
        companyId: b.companyId === null ? null : str(b.companyId),
        subject: typeof b.subject === 'string' ? b.subject : undefined,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
});

clientTicketsRouter.post('/api/client-tickets/:id/comments', async (req, res) => {
  const user = await guard(req, res, true);
  if (!user) return;
  try {
    return res.status(201).json(await addComment(user.tenantId!, user.id, req.params.id, { body: String(req.body?.body ?? ''), internal: req.body?.internal === true }));
  } catch (error) {
    return fail(res, error);
  }
});
