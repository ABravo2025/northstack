import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    lead: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    leadTouch: { create: vi.fn() },
    user: { findFirst: vi.fn() },
    fieldCatalogDefinition: { findFirst: vi.fn() },
    pipeline: { findFirst: vi.fn() },
    pipelineStageDefinition: { findFirst: vi.fn() },
    company: { findFirst: vi.fn(), create: vi.fn() },
    contact: { findUnique: vi.fn(), update: vi.fn() },
    tenant: { findUnique: vi.fn() },
  },
}));
vi.mock('../src/modules/crm/contactService.js', () => ({ createContact: vi.fn(async () => ({ id: 'c-new' })) }));
vi.mock('../src/modules/crm/opportunityService.js', () => ({ createOpportunity: vi.fn(async () => ({ id: 'o-new' })), addOpportunityContact: vi.fn() }));
vi.mock('../src/modules/hr/statusService.js', () => ({ getDefaultStatusId: vi.fn(async () => 'st1') }));

import prisma from '../src/lib/prisma.js';
import { createContact } from '../src/modules/crm/contactService.js';
import { addOpportunityContact, createOpportunity } from '../src/modules/crm/opportunityService.js';
import { canConvert, leadScore, leadStatusFor, nextTouchAt } from '../src/modules/crm/leadLogic.js';
import { addTouch, convertLead } from '../src/modules/crm/leadService.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
beforeEach(() => {
  vi.clearAllMocks();
  db.lead.update.mockImplementation(async ({ data }) => ({ ...baseLead(), ...data, touches: [] }));
});

const baseLead = (over: Record<string, unknown> = {}) => ({
  id: 'l1',
  tenantId: 't1',
  firstName: 'Ana',
  lastName: 'Paz',
  email: 'ana@acme.com',
  phone: null,
  title: null,
  companyName: 'Acme',
  dealName: null,
  estimatedAmountCents: 500000,
  leadSourceId: null,
  ownerId: 'u-owner',
  status: 'qualified',
  qualification: { need: true, budget: true, authority: true, timing: false },
  touchCount: 2,
  formId: 'f1',
  createdAt: new Date('2026-11-01T00:00:00Z'),
  touches: [],
  ...over,
});

describe('lead rules', () => {
  it('converts with 3 of 4 qualification answers', () => {
    expect(canConvert({ need: true, budget: true, authority: true, timing: false })).toBe(true);
    expect(canConvert({ need: true, budget: true, authority: null })).toBe(false);
  });

  it('scores 20 per "yes", +10 for an answer to a touch, +10 when it came in on its own', () => {
    expect(leadScore({ qualification: { need: true, budget: true }, repliedTouch: true, inbound: true })).toBe(60);
    expect(leadScore({ qualification: { need: true, budget: true, authority: true, timing: true }, repliedTouch: true, inbound: true })).toBe(100);
  });

  it('schedules the 5-touch cadence on days 0, 2, 5, 9 and 14', () => {
    const start = new Date('2026-11-01T10:00:00Z');
    expect(nextTouchAt(start, 0)?.toISOString()).toBe('2026-11-01T10:00:00.000Z');
    expect(nextTouchAt(start, 3)?.toISOString()).toBe('2026-11-10T10:00:00.000Z');
    expect(nextTouchAt(start, 5)).toBeNull();
  });

  it('follows the work until converted or disqualified', () => {
    expect(leadStatusFor('new', 1, {})).toBe('working');
    expect(leadStatusFor('working', 2, { need: true, budget: true, timing: true })).toBe('qualified');
    expect(leadStatusFor('disqualified', 4, { need: true, budget: true, timing: true })).toBe('disqualified');
  });
});

describe('leads service', () => {
  it('logs a touch, scoped to the tenant, and moves the next one along', async () => {
    db.lead.findFirst.mockResolvedValue(baseLead({ status: 'working', qualification: {} }));
    await addTouch('t1', 'u1', 'l1', { channel: 'call', outcome: 'no_answer' });
    expect(db.lead.findFirst.mock.calls[0][0].where).toEqual({ id: 'l1', tenantId: 't1' });
    expect(db.leadTouch.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', leadId: 'l1', step: 3, channel: 'call' });
  });

  it('refuses to convert an unqualified lead', async () => {
    db.lead.findFirst.mockResolvedValue(baseLead({ qualification: { need: true } }));
    await expect(convertLead('t1', 'u1', 'l1', { pipelineId: 'p1' })).rejects.toMatchObject({ code: 'not_qualified' });
    expect(createOpportunity).not.toHaveBeenCalled();
  });

  it('converts into company + contact + opportunity together', async () => {
    db.lead.findFirst.mockResolvedValue(baseLead());
    db.pipeline.findFirst.mockResolvedValue({ id: 'p1' });
    db.user.findFirst.mockResolvedValue({ id: 'u-owner' });
    db.company.findFirst.mockResolvedValue(null);
    db.company.create.mockResolvedValue({ id: 'co-new' });
    db.contact.findUnique.mockResolvedValue(null);
    db.tenant.findUnique.mockResolvedValue({ currency: 'ARS' });
    const r = await convertLead('t1', 'u1', 'l1', { pipelineId: 'p1' });
    expect(r).toMatchObject({ companyId: 'co-new', contactId: 'c-new', opportunityId: 'o-new' });
    expect(db.company.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', name: 'Acme' });
    expect(createContact).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', email: 'ana@acme.com', companyId: 'co-new' }), 'u1');
    expect(createOpportunity).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'co-new', pipelineId: 'p1', amountCents: 500000, currency: 'ARS', ownerId: 'u-owner' }), 'u1');
    expect(addOpportunityContact).toHaveBeenCalledWith('t1', 'o-new', 'c-new');
    expect(db.lead.update.mock.calls.at(-1)![0].data).toMatchObject({ status: 'converted', convertedOpportunityId: 'o-new' });
  });

  it('reuses an existing contact with the same email and a pipeline of another tenant is not found', async () => {
    db.lead.findFirst.mockResolvedValue(baseLead());
    db.pipeline.findFirst.mockResolvedValueOnce(null);
    await expect(convertLead('t1', 'u1', 'l1', { pipelineId: 'p-of-B' })).rejects.toMatchObject({ status: 404 });
    expect(db.pipeline.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'p-of-B', tenantId: 't1' });

    db.pipeline.findFirst.mockResolvedValue({ id: 'p1' });
    db.user.findFirst.mockResolvedValue({ id: 'u-owner' });
    db.company.findFirst.mockResolvedValue({ id: 'co1' });
    db.contact.findUnique.mockResolvedValue({ id: 'c-old', companyId: null });
    db.tenant.findUnique.mockResolvedValue({ currency: 'USD' });
    const r = await convertLead('t1', 'u1', 'l1', { pipelineId: 'p1' });
    expect(r.contactId).toBe('c-old');
    expect(db.contact.update).toHaveBeenCalledWith({ where: { id: 'c-old' }, data: { companyId: 'co1' } });
    expect(createContact).not.toHaveBeenCalled();
  });
});
