import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    clientTicket: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    clientTicketComment: { create: vi.fn() },
    company: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn(), findUnique: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}));

import prisma from '../src/lib/prisma.js';
import { addComment, createTicket, slaDue, slaState, updateTicket } from '../src/modules/crm/ticketService.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
beforeEach(() => {
  vi.clearAllMocks();
  db.clientTicket.create.mockImplementation(async ({ data }) => ({ id: 'tk1', comments: [], company: null, firstRespondedAt: null, resolvedAt: null, status: 'open', ...data }));
  db.clientTicket.update.mockImplementation(async ({ data }) => ({ id: 'tk1', comments: [], company: null, status: 'open', firstRespondedAt: null, resolvedAt: null, firstResponseDueAt: new Date(), resolutionDueAt: new Date(), ...data }));
});

const H = 3_600_000;

describe('ticket SLA', () => {
  it('sets first-response and resolution due by priority', () => {
    const at = new Date('2026-11-02T10:00:00Z');
    expect(slaDue(at, 'urgent')).toEqual({ firstResponseDueAt: new Date(at.getTime() + H), resolutionDueAt: new Date(at.getTime() + 8 * H) });
    expect(slaDue(at, 'low').resolutionDueAt).toEqual(new Date(at.getTime() + 120 * H));
  });

  it('is overdue while open past a due time, never once resolved in time', () => {
    const now = new Date('2026-11-02T12:00:00Z');
    const due = { firstResponseDueAt: new Date('2026-11-02T11:00:00Z'), resolutionDueAt: new Date('2026-11-03T10:00:00Z') };
    expect(slaState({ status: 'open', ...due, firstRespondedAt: null, resolvedAt: null }, now).overdue).toBe(true);
    expect(slaState({ status: 'in_progress', ...due, firstRespondedAt: new Date('2026-11-02T10:30:00Z'), resolvedAt: null }, now).overdue).toBe(false);
    expect(slaState({ status: 'resolved', ...due, firstRespondedAt: null, resolvedAt: new Date('2026-11-02T11:30:00Z') }, now)).toMatchObject({ overdue: false, responseBreached: true });
  });
});

describe('tickets', () => {
  it('numbers per company and lands a known requester on their company', async () => {
    db.clientTicket.findFirst.mockResolvedValue({ number: 41 });
    db.contact.findUnique.mockResolvedValue({ id: 'c1', companyId: 'co1' });
    const t = await createTicket('t1', null, { subject: ' No anda el login ', requesterEmail: 'Ana@Acme.com', source: 'form' });
    expect(db.clientTicket.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', number: 42, subject: 'No anda el login', contactId: 'c1', companyId: 'co1', requesterEmail: 'ana@acme.com', priority: 'normal', source: 'form' });
    expect(db.contact.findUnique).toHaveBeenCalledWith({ where: { tenantId_email: { tenantId: 't1', email: 'ana@acme.com' } }, select: { id: true, companyId: true } });
    expect(t.sla).toBeDefined();
  });

  it('refuses a company or assignee of another tenant', async () => {
    db.company.findFirst.mockResolvedValueOnce(null);
    await expect(createTicket('t1', 'u1', { subject: 'X', companyId: 'co-of-B' })).rejects.toMatchObject({ status: 404 });
    expect(db.clientTicket.create).not.toHaveBeenCalled();
  });

  it('the first reply to the client meets the first-response SLA; an internal note does not', async () => {
    db.clientTicket.findFirst.mockResolvedValue({ id: 'tk1', status: 'open', firstRespondedAt: null, comments: [], company: null, firstResponseDueAt: new Date(), resolutionDueAt: new Date(), resolvedAt: null });
    await addComment('t1', 'u1', 'tk1', { body: 'Lo estoy viendo', internal: true });
    expect(db.clientTicket.update).not.toHaveBeenCalled();
    await addComment('t1', 'u1', 'tk1', { body: 'Hola Ana, ya lo arreglamos' });
    expect(db.clientTicket.update.mock.calls[0][0].data).toMatchObject({ status: 'in_progress' });
    expect(db.clientTicket.update.mock.calls[0][0].data.firstRespondedAt).toBeInstanceOf(Date);
  });

  it('resolving stamps the time; reopening clears it; a new priority recalculates the SLA', async () => {
    const created = new Date('2026-11-01T00:00:00Z');
    db.clientTicket.findFirst.mockResolvedValue({ id: 'tk1', createdAt: created, resolvedAt: null, closedAt: null });
    await updateTicket('t1', 'tk1', { status: 'resolved' });
    expect(db.clientTicket.update.mock.calls[0][0].data.resolvedAt).toBeInstanceOf(Date);
    await updateTicket('t1', 'tk1', { status: 'open' });
    expect(db.clientTicket.update.mock.calls[1][0].data).toMatchObject({ resolvedAt: null, closedAt: null });
    await updateTicket('t1', 'tk1', { priority: 'urgent' });
    expect(db.clientTicket.update.mock.calls[2][0].data.resolutionDueAt).toEqual(new Date(created.getTime() + 8 * H));
  });
});
