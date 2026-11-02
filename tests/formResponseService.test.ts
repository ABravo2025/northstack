import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({
  default: {
    contact: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn(async () => []) },
    company: { findFirst: vi.fn(), create: vi.fn() },
    employee: { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn(async () => []) },
    task: { create: vi.fn(), findMany: vi.fn(async () => []) },
    clientTicket: { findMany: vi.fn(async () => []) },
    tenant: { findUnique: vi.fn() },
    fieldCatalogDefinition: { findFirst: vi.fn() },
    customFieldDefinition: { findMany: vi.fn() },
    customFieldValue: { findFirst: vi.fn(), update: vi.fn() },
    formResponse: { create: vi.fn(), count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    form: { findMany: vi.fn() },
    lead: { findFirst: vi.fn(), findMany: vi.fn(async () => []) },
  },
}));
vi.mock('../src/modules/crm/contactService.js', () => ({ createContact: vi.fn() }));
vi.mock('../src/modules/crm/opportunityService.js', () => ({ createOpportunity: vi.fn(), addOpportunityContact: vi.fn() }));
vi.mock('../src/modules/crm/leadService.js', () => ({ createLead: vi.fn(async () => ({ id: 'lead-new' })) }));
vi.mock('../src/modules/hr/statusService.js', () => ({ getDefaultStatusId: vi.fn() }));
vi.mock('../src/modules/hr/customFieldService.js', () => ({ createCustomFieldValue: vi.fn(), isValueValidForFieldType: () => true }));

import prisma from '../src/lib/prisma.js';
import { decryptAnswers } from '../src/lib/formsEncryption.js';
import { createContact } from '../src/modules/crm/contactService.js';
import { createOpportunity } from '../src/modules/crm/opportunityService.js';
import { getResponse, listResponses, submitResponse } from '../src/modules/forms/formResponseService.js';
import { createLead as createInboxLead } from '../src/modules/crm/leadService.js';

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
let previousKey: string | undefined;

beforeAll(() => {
  previousKey = process.env.FORMS_DATA_ENCRYPTION_KEY;
  process.env.FORMS_DATA_ENCRYPTION_KEY = '1'.repeat(64);
});
afterAll(() => {
  if (previousKey === undefined) delete process.env.FORMS_DATA_ENCRYPTION_KEY;
  else process.env.FORMS_DATA_ENCRYPTION_KEY = previousKey;
});
beforeEach(() => {
  vi.clearAllMocks();
  db.customFieldDefinition.findMany.mockResolvedValue([]);
  db.formResponse.create.mockImplementation(async ({ data }) => ({ id: 'r1', ...data }));
  // Starter: no Leads inbox, so a lead form creates the contact (and opportunity) directly.
  db.tenant.findUnique.mockResolvedValue({ currency: 'ARS', plan: 'starter', planOverride: null });
});

const form = (over: Record<string, unknown> = {}) =>
  ({
    id: 'f1',
    tenantId: 't1',
    kind: 'form',
    module: 'leads',
    action: 'create_lead',
    pipelineId: 'p1',
    actionConfig: null,
    surveySettings: null,
    fields: [
      { id: 'q1', label: 'Email', type: 'email', required: true, mapTo: 'contact.email' },
      { id: 'q2', label: 'Nombre', type: 'short_text', required: true, mapTo: 'contact.firstName' },
      { id: 'q3', label: '¿Cómo nos conociste?', type: 'long_text', required: false, mapTo: null },
    ],
    ...over,
  }) as never;

describe('submitResponse', () => {
  it('creates a lead with an opportunity, and stores the answers encrypted with what was copied', async () => {
    db.contact.findUnique.mockResolvedValue(null);
    // Another contact at acme.com already belongs to a company: the lead joins it.
    db.contact.findFirst.mockResolvedValue({ companyId: 'co1' });
    vi.mocked(createContact).mockResolvedValue({ id: 'c1' } as never);
    vi.mocked(createOpportunity).mockResolvedValue({ id: 'o1' } as never);

    const result = await submitResponse(form(), { q1: 'ana@acme.com', q2: 'Ana', q3: 'Un amigo' }, { source: 'public_link', utm: { source: 'google' } });

    expect(result.linked).toEqual({ type: 'contact', id: 'c1' });
    expect(createContact).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1', email: 'ana@acme.com', firstName: 'Ana', companyId: 'co1', leadStatus: 'new' }));
    expect(createOpportunity).toHaveBeenCalledWith(expect.objectContaining({ pipelineId: 'p1', companyId: 'co1', currency: 'ARS' }));
    const saved = db.formResponse.create.mock.calls[0][0].data;
    expect(saved.answersEnc).not.toContain('ana@acme.com');
    expect(decryptAnswers(saved.answersEnc)).toEqual({ q1: 'ana@acme.com', q2: 'Ana', q3: 'Un amigo' });
    expect(saved).toMatchObject({ linkedEntityType: 'contact', linkedEntityId: 'c1', utmSource: 'google' });
    expect(saved.copiedFields).toEqual([
      { questionId: 'q1', mapTo: 'contact.email' },
      { questionId: 'q2', mapTo: 'contact.firstName' },
    ]);
  });

  it('with the Leads inbox on, a new lead lands in the inbox with its campaign', async () => {
    db.contact.findUnique.mockResolvedValue(null);
    db.tenant.findUnique.mockResolvedValue({ currency: 'ARS', plan: 'growth', planOverride: null });
    db.lead.findFirst.mockResolvedValue(null);
    const result = await submitResponse(form(), { q1: 'ana@acme.com', q2: 'Ana' }, { source: 'embed', utm: { source: 'google' } });
    expect(result.linked).toEqual({ type: 'lead', id: 'lead-new' });
    expect(createInboxLead).toHaveBeenCalledWith('t1', null, expect.objectContaining({ email: 'ana@acme.com', firstName: 'Ana', formId: 'f1', utm: { source: 'google' } }));
    expect(createContact).not.toHaveBeenCalled();
  });

  it('links an existing contact instead of overwriting it', async () => {
    db.contact.findUnique.mockResolvedValue({ id: 'existing' });
    const result = await submitResponse(form(), { q1: 'ana@acme.com', q2: 'Otra' }, { source: 'embed' });
    expect(result.linked).toEqual({ type: 'contact', id: 'existing' });
    expect(createContact).not.toHaveBeenCalled();
  });

  it('rejects an invalid answer without running the action', async () => {
    await expect(submitResponse(form(), { q1: 'not-an-email', q2: 'Ana' }, { source: 'public_link' })).rejects.toMatchObject({ code: 'invalid_answer:q1' });
    expect(createContact).not.toHaveBeenCalled();
    expect(db.formResponse.create).not.toHaveBeenCalled();
  });

  it('a personal-link action never runs from a public link', async () => {
    const f = form({ module: 'clients', action: 'update_contact', fields: [{ id: 'q1', label: 'Tel', type: 'phone', required: true, mapTo: 'contact.phone' }] });
    await expect(submitResponse(f, { q1: '1155' }, { source: 'public_link' })).rejects.toMatchObject({ code: 'needs_personal_link' });
  });

  it('updates only the mapped fields of the respondent contact, scoped to the tenant', async () => {
    const f = form({ module: 'clients', action: 'update_contact', fields: [{ id: 'q1', label: 'Tel', type: 'phone', required: true, mapTo: 'contact.phone' }] });
    db.contact.findFirst.mockResolvedValue({ id: 'c9', companyId: null });
    await submitResponse(f, { q1: '+54 11 5555' }, { source: 'personal_link', respondent: { type: 'contact', id: 'c9' } });
    expect(db.contact.findFirst).toHaveBeenCalledWith({ where: { id: 'c9', tenantId: 't1' } });
    expect(db.contact.update).toHaveBeenCalledWith({ where: { id: 'c9' }, data: { phone: '+54 11 5555' } });
  });

  it('an anonymous employee survey keeps the department and score, never who answered', async () => {
    const f = form({
      kind: 'survey',
      module: 'employees',
      action: 'save_to_file',
      surveySettings: { metric: 'enps', anonymous: true },
      fields: [{ id: 'q1', label: 'eNPS', type: 'rating_nps', required: true, mapTo: null }],
    });
    db.employee.findFirst.mockResolvedValue({ departmentId: 'd1' });
    await submitResponse(f, { q1: 8 }, { source: 'personal_link', respondent: { type: 'employee', id: 'e1' } });
    const saved = db.formResponse.create.mock.calls[0][0].data;
    expect(saved).toMatchObject({ score: 8, departmentId: 'd1', respondentId: null, respondentType: null, linkedEntityId: null });
  });

  it('support tickets wait for the Clients phase', async () => {
    const f = form({ module: 'support', action: 'create_ticket', fields: [{ id: 'q1', label: 'Asunto', type: 'short_text', required: true, mapTo: 'ticket.subject' }] });
    await expect(submitResponse(f, { q1: 'No anda' }, { source: 'public_link' })).rejects.toMatchObject({ status: 409 });
  });
});

describe('anonymous surveys under their threshold', () => {
  it('keep their single answers out of the list and the modal', async () => {
    db.form.findMany.mockResolvedValue([
      { id: 'enps', surveySettings: { anonymous: true, minAnonymousGroup: 3 } },
      { id: 'nps', surveySettings: { anonymous: false } },
    ]);
    db.formResponse.count.mockResolvedValue(2);
    db.formResponse.findMany.mockResolvedValue([]);
    expect(await listResponses('t1', { formId: 'enps' })).toEqual([]);
    expect(db.formResponse.findMany).not.toHaveBeenCalled();
    await listResponses('t1', {});
    expect(db.formResponse.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', formId: { notIn: ['enps'] } });
    db.formResponse.findFirst.mockResolvedValue({ id: 'r1', formId: 'enps' });
    await expect(getResponse('t1', 'r1')).rejects.toMatchObject({ status: 404 });
  });
});
