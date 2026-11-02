import type { Lead, LeadInboxStatus, Prisma } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { getDefaultStatusId } from '../hr/statusService.js';
import { createContact } from './contactService.js';
import { addOpportunityContact, createOpportunity } from './opportunityService.js';
import {
  CADENCE_TOUCHES,
  QUALIFICATION_KEYS,
  TOUCH_CHANNELS,
  TOUCH_OUTCOMES,
  canConvert,
  leadScore,
  leadStatusFor,
  nextTouchAt,
  readQualification,
  type Qualification,
} from './leadLogic.js';

// Clientes C2 (spec-clientes-gastos-formularios.md): the Leads inbox. Every lookup is scoped by
// tenant first; ids that come in (owner, source, company, pipeline, stage) must belong to it.

export class LeadError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: string,
  ) {
    super(message);
  }
}

const leadInclude = {
  owner: { select: { id: true, firstName: true, lastName: true } },
  leadSource: { select: { id: true, name: true } },
  touches: { orderBy: { at: 'asc' as const } },
} satisfies Prisma.LeadInclude;

type LeadRow = Prisma.LeadGetPayload<{ include: typeof leadInclude }>;

function present(lead: LeadRow) {
  return { ...lead, qualification: readQualification(lead.qualification), canConvert: canConvert(readQualification(lead.qualification)) };
}

export type LeadView = ReturnType<typeof present>;

// Score, status and next touch always come from the lead's own data, never from the request.
async function recompute(lead: Lead & { touches: { outcome: string }[] }) {
  const q = readQualification(lead.qualification);
  return prisma.lead.update({
    where: { id: lead.id },
    data: {
      score: leadScore({ qualification: q, repliedTouch: lead.touches.some((t) => t.outcome === 'replied' || t.outcome === 'meeting_booked'), inbound: !!lead.formId }),
      status: leadStatusFor(lead.status, lead.touchCount, q),
      nextTouchAt: lead.status === 'converted' || lead.status === 'disqualified' ? null : nextTouchAt(lead.createdAt, lead.touchCount),
    },
    include: leadInclude,
  });
}

async function findOwned(tenantId: string, id: string) {
  const lead = await prisma.lead.findFirst({ where: { id, tenantId }, include: leadInclude });
  if (!lead) throw new LeadError('Lead not found', 404);
  return lead;
}

export async function listLeads(tenantId: string, filter: { view?: 'open' | 'converted' | 'disqualified'; ownerId?: string; q?: string }) {
  const status: Prisma.LeadWhereInput['status'] =
    filter.view === 'converted' ? 'converted' : filter.view === 'disqualified' ? 'disqualified' : { in: ['new', 'working', 'qualified'] };
  const q = filter.q?.trim();
  const rows = await prisma.lead.findMany({
    where: {
      tenantId,
      status,
      ...(filter.ownerId ? { ownerId: filter.ownerId === 'none' ? null : filter.ownerId } : {}),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { companyName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    // Open leads: who's due first. Closed ones: most recent first.
    orderBy: filter.view && filter.view !== 'open' ? [{ updatedAt: 'desc' }] : [{ nextTouchAt: { sort: 'asc', nulls: 'last' } }, { score: 'desc' }],
    include: leadInclude,
    take: 500,
  });
  return rows.map(present);
}

export async function getLead(tenantId: string, id: string) {
  return present(await findOwned(tenantId, id));
}

async function assertRefs(tenantId: string, refs: { ownerId?: string | null; leadSourceId?: string | null }) {
  if (refs.ownerId) {
    const u = await prisma.user.findFirst({ where: { id: refs.ownerId, tenantId }, select: { id: true } });
    if (!u) throw new LeadError('Owner not found', 404);
  }
  if (refs.leadSourceId) {
    const s = await prisma.fieldCatalogDefinition.findFirst({ where: { id: refs.leadSourceId, tenantId, kind: 'leadSource' }, select: { id: true } });
    if (!s) throw new LeadError('Lead source not found', 404);
  }
}

export interface LeadInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  companyName?: string | null;
  title?: string | null;
  dealName?: string | null;
  estimatedAmountCents?: number | null;
  notes?: string | null;
  leadSourceId?: string | null;
  ownerId?: string | null;
  qualification?: Qualification;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanInput(input: LeadInput, partial: boolean): Prisma.LeadUncheckedUpdateInput {
  const data: Prisma.LeadUncheckedUpdateInput = {};
  const text = (v: string | null | undefined, max: number) => (v === null || v === undefined ? v : v.trim().slice(0, max) || null);
  if (input.firstName !== undefined || !partial) {
    const v = (input.firstName ?? '').trim().slice(0, 100);
    if (!v) throw new LeadError('First name is required', 400, 'first_name_required');
    data.firstName = v;
  }
  if (input.email !== undefined || !partial) {
    const v = (input.email ?? '').trim().toLowerCase().slice(0, 200);
    if (!EMAIL.test(v)) throw new LeadError('Enter a valid email', 400, 'invalid_email');
    data.email = v;
  }
  if (input.lastName !== undefined) data.lastName = input.lastName.trim().slice(0, 100);
  if (input.phone !== undefined) data.phone = text(input.phone, 50);
  if (input.companyName !== undefined) data.companyName = text(input.companyName, 200);
  if (input.title !== undefined) data.title = text(input.title, 120);
  if (input.dealName !== undefined) data.dealName = text(input.dealName, 200);
  if (input.notes !== undefined) data.notes = text(input.notes, 5000);
  if (input.estimatedAmountCents !== undefined) {
    const v = input.estimatedAmountCents;
    data.estimatedAmountCents = v === null ? null : Number.isSafeInteger(v) && v >= 0 ? v : undefined;
  }
  if (input.leadSourceId !== undefined) data.leadSourceId = input.leadSourceId || null;
  if (input.ownerId !== undefined) data.ownerId = input.ownerId || null;
  if (input.qualification !== undefined) data.qualification = readQualification(input.qualification) as Prisma.InputJsonObject;
  return data;
}

export async function createLead(tenantId: string, userId: string | null, input: LeadInput & { formId?: string | null; utm?: { source?: string; medium?: string; campaign?: string } }) {
  await assertRefs(tenantId, input);
  const data = cleanInput(input, false);
  const lead = await prisma.lead.create({
    data: {
      ...(data as Prisma.LeadUncheckedCreateInput),
      tenantId,
      createdById: userId,
      formId: input.formId ?? null,
      utmSource: input.utm?.source?.slice(0, 100) || null,
      utmMedium: input.utm?.medium?.slice(0, 100) || null,
      utmCampaign: input.utm?.campaign?.slice(0, 100) || null,
    },
    include: leadInclude,
  });
  return present(await recompute(lead));
}

export async function updateLead(tenantId: string, id: string, input: LeadInput) {
  const existing = await findOwned(tenantId, id);
  if (existing.status === 'converted') throw new LeadError('This lead was already converted', 409, 'converted');
  await assertRefs(tenantId, input);
  const updated = await prisma.lead.update({ where: { id }, data: cleanInput(input, true), include: leadInclude });
  return present(await recompute(updated));
}

export async function addTouch(tenantId: string, userId: string, id: string, input: { channel: string; outcome: string; note?: string | null }) {
  const lead = await findOwned(tenantId, id);
  if (lead.status === 'converted' || lead.status === 'disqualified') throw new LeadError('This lead is closed', 409, 'closed');
  if (!(TOUCH_CHANNELS as readonly string[]).includes(input.channel)) throw new LeadError('Invalid channel', 400);
  if (!(TOUCH_OUTCOMES as readonly string[]).includes(input.outcome)) throw new LeadError('Invalid outcome', 400);
  // Touches past the fifth are still logged; the cadence just has nothing more to schedule.
  const step = Math.min(lead.touchCount + 1, CADENCE_TOUCHES + 50);
  await prisma.leadTouch.create({
    data: { tenantId, leadId: id, step, channel: input.channel, outcome: input.outcome, note: input.note?.trim().slice(0, 2000) || null, byUserId: userId },
  });
  const updated = await prisma.lead.update({ where: { id }, data: { touchCount: { increment: 1 } }, include: leadInclude });
  return present(await recompute(updated));
}

export async function disqualifyLead(tenantId: string, id: string, reason: string) {
  const lead = await findOwned(tenantId, id);
  if (lead.status === 'converted') throw new LeadError('This lead was already converted', 409, 'converted');
  const updated = await prisma.lead.update({
    where: { id },
    data: { status: 'disqualified', disqualifyReason: reason.trim().slice(0, 500) || null, nextTouchAt: null },
    include: leadInclude,
  });
  return present(updated);
}

export async function reopenLead(tenantId: string, id: string) {
  const lead = await findOwned(tenantId, id);
  if (lead.status !== 'disqualified') throw new LeadError('Only a disqualified lead can be reopened', 409);
  const updated = await prisma.lead.update({ where: { id }, data: { status: 'working', disqualifyReason: null }, include: leadInclude });
  return present(await recompute(updated));
}

export interface ConvertInput {
  companyId?: string | null; // an existing company, or…
  companyName?: string | null; // …a new one with this name
  pipelineId: string;
  stageId?: string | null;
  opportunityName?: string | null;
  amountCents?: number | null;
  ownerId?: string | null;
}

// Convert: Company + Contact + Opportunity together, from a lead with 3 of 4 qualification "yes".
// An existing contact with the same email is reused (and joined to the company if it had none).
export async function convertLead(tenantId: string, userId: string, id: string, input: ConvertInput) {
  const lead = await findOwned(tenantId, id);
  if (lead.status === 'converted') throw new LeadError('This lead was already converted', 409, 'converted');
  if (!canConvert(readQualification(lead.qualification))) throw new LeadError('Qualify the lead first (3 of 4)', 409, 'not_qualified');

  const pipeline = await prisma.pipeline.findFirst({ where: { id: input.pipelineId, tenantId, isActive: true } });
  if (!pipeline) throw new LeadError('Pipeline not found', 404);
  if (input.stageId) {
    const stage = await prisma.pipelineStageDefinition.findFirst({ where: { id: input.stageId, tenantId, pipelineId: pipeline.id, isActive: true } });
    if (!stage) throw new LeadError('Stage not found', 404);
  }
  const ownerId = input.ownerId ?? lead.ownerId ?? userId;
  await assertRefs(tenantId, { ownerId });

  let companyId: string;
  if (input.companyId) {
    const company = await prisma.company.findFirst({ where: { id: input.companyId, tenantId }, select: { id: true } });
    if (!company) throw new LeadError('Company not found', 404);
    companyId = company.id;
  } else {
    const name = (input.companyName ?? lead.companyName ?? '').trim().slice(0, 200);
    if (!name) throw new LeadError('Choose or name the company', 400, 'company_required');
    const existing = await prisma.company.findFirst({ where: { tenantId, name: { equals: name, mode: 'insensitive' } }, select: { id: true } });
    companyId = existing?.id ?? (await prisma.company.create({ data: { tenantId, name, statusId: await getDefaultStatusId(tenantId, 'company') } })).id;
  }

  const sameEmail = await prisma.contact.findUnique({ where: { tenantId_email: { tenantId, email: lead.email } } });
  let contactId: string;
  if (sameEmail) {
    contactId = sameEmail.id;
    if (!sameEmail.companyId) await prisma.contact.update({ where: { id: sameEmail.id }, data: { companyId } });
  } else {
    const contact = await createContact(
      {
        tenantId,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        title: lead.title,
        companyId,
        leadSourceId: lead.leadSourceId,
      },
      userId,
    );
    contactId = contact.id;
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } });
  const amount = input.amountCents ?? lead.estimatedAmountCents ?? 0;
  const opportunity = await createOpportunity(
    {
      tenantId,
      companyId,
      pipelineId: pipeline.id,
      stageId: input.stageId ?? undefined,
      name: (input.opportunityName ?? lead.dealName ?? '').trim() || `${lead.companyName ?? lead.firstName}`.trim(),
      amountCents: Number.isSafeInteger(amount) && amount >= 0 ? amount : 0,
      currency: tenant?.currency ?? 'USD',
      ownerId,
    },
    userId,
  );
  await addOpportunityContact(tenantId, opportunity.id, contactId);

  const updated = await prisma.lead.update({
    where: { id },
    data: {
      status: 'converted' satisfies LeadInboxStatus,
      convertedAt: new Date(),
      convertedCompanyId: companyId,
      convertedContactId: contactId,
      convertedOpportunityId: opportunity.id,
      nextTouchAt: null,
    },
    include: leadInclude,
  });
  return { lead: present(updated), companyId, contactId, opportunityId: opportunity.id };
}

export { QUALIFICATION_KEYS };
