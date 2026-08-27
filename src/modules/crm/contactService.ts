import prisma from '../../lib/prisma.js';
import { listCustomFieldValuesForEntities } from '../hr/customFieldService.js';
import { listTagsForEntities } from '../crossModule/tagService.js';
import type { Contact, LeadStatus, Prisma } from '@prisma/client';

export interface CreateContactInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  companyId?: string | null;
  title?: string | null;
  isPrimary?: boolean;
  leadStatus?: LeadStatus | null;
  leadSourceId?: string | null;
  tenantId: string;
}

export interface UpdateContactInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  companyId?: string | null;
  title?: string | null;
  isPrimary?: boolean;
  leadStatus?: LeadStatus | null;
  leadSourceId?: string | null;
  // Not exposed by any UI yet (no "reactivate" affordance built — see
  // docs/tareas/specredisenosalesv2.md §2.2) but whitelisted so a
  // deactivated Contact isn't a permanent dead end at the API layer.
  isActive?: boolean;
}

const CONTACT_INCLUDE = {
  company: { select: { id: true, name: true } },
  leadSource: { select: { id: true, name: true } },
} satisfies Prisma.ContactInclude;

export async function createContact(input: CreateContactInput): Promise<Contact> {
  const companyId = input.companyId ?? null;
  const isPrimary = input.isPrimary ?? false;

  // isPrimary is unique per Company (docs/tareas/specredisenosalesv2.md §2.3)
  // — a companyId-less Contact has no Company to be unique against, so the
  // flag is stored as-is but never triggers the demotion below.
  if (isPrimary && companyId) {
    return prisma.$transaction(async (tx) => {
      await tx.contact.updateMany({ where: { companyId, isPrimary: true }, data: { isPrimary: false } });
      return tx.contact.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone ?? null,
          companyId,
          title: input.title ?? null,
          isPrimary: true,
          leadStatus: input.leadStatus ?? null,
          leadSourceId: input.leadSourceId ?? null,
          tenantId: input.tenantId,
        },
      });
    });
  }

  return prisma.contact.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone ?? null,
      companyId,
      title: input.title ?? null,
      isPrimary,
      leadStatus: input.leadStatus ?? null,
      leadSourceId: input.leadSourceId ?? null,
      tenantId: input.tenantId,
    },
  });
}

// includeInactive defaults to false — a deactivated Contact (see
// deactivateContact below) drops out of the default list the same way any
// other isActive-gated catalog row does in this app. No caller passes `true`
// yet (no "show deactivated" UI built), but the parameter exists so that's a
// UI-only follow-up, not a service-layer one.
export async function listContacts(tenantId: string, includeInactive = false) {
  const contacts = await prisma.contact.findMany({
    where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
    include: CONTACT_INCLUDE,
  });

  const values = await listCustomFieldValuesForEntities(
    tenantId,
    'contact',
    contacts.map((contact) => contact.id),
  );
  const tags = await listTagsForEntities(tenantId, 'contact', contacts.map((contact) => contact.id));

  return contacts.map((contact) => ({
    ...contact,
    customFieldVals: values.filter((value) => value.entityId === contact.id),
    tags: tags.filter((tag) => tag.entityId === contact.id),
  }));
}

export async function findContactById(id: string): Promise<Contact | null> {
  return prisma.contact.findUnique({
    where: { id },
  });
}

export async function updateContact(id: string, input: UpdateContactInput): Promise<Contact> {
  // Whitelist explicitly — never pass the input object straight through, since it
  // may originate from req.body and carry extra fields (e.g. tenantId) that would
  // otherwise reassign this row across tenants.
  const data: Prisma.ContactUncheckedUpdateInput = {};
  if (input.firstName !== undefined) data.firstName = input.firstName;
  if (input.lastName !== undefined) data.lastName = input.lastName;
  if (input.email !== undefined) data.email = input.email;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.companyId !== undefined) data.companyId = input.companyId;
  if (input.title !== undefined) data.title = input.title;
  if (input.isPrimary !== undefined) data.isPrimary = input.isPrimary;
  if (input.leadStatus !== undefined) data.leadStatus = input.leadStatus;
  if (input.leadSourceId !== undefined) data.leadSourceId = input.leadSourceId;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  // isPrimary is unique per Company (docs/tareas/specredisenosalesv2.md §2.3).
  // The "effective" companyId is whichever this same PATCH sets it to, or the
  // existing one if companyId isn't part of this call — either way, a
  // companyId-less Contact has nothing to be unique against.
  if (input.isPrimary === true) {
    const effectiveCompanyId =
      input.companyId !== undefined ? input.companyId : (await prisma.contact.findUnique({ where: { id }, select: { companyId: true } }))?.companyId;
    if (effectiveCompanyId) {
      return prisma.$transaction(async (tx) => {
        await tx.contact.updateMany({
          where: { companyId: effectiveCompanyId, isPrimary: true, id: { not: id } },
          data: { isPrimary: false },
        });
        return tx.contact.update({ where: { id }, data, include: CONTACT_INCLUDE });
      });
    }
  }

  return prisma.contact.update({
    where: { id },
    data,
    include: CONTACT_INCLUDE,
  });
}

export interface DeactivateContactResult {
  contact: Contact;
  // Ids of any Opportunities that got deactivated as a side effect (this
  // Contact was their sole active link) — the caller/frontend doesn't need
  // to inspect these today, but returning them beats silently hiding what
  // else changed.
  deactivatedOpportunityIds: string[];
}

// Replaces the old hard-delete: "Delete" in the UI now deactivates instead of
// destroying the row (docs/tareas/specredisenosalesv2.md §2.2). A linked
// Opportunity is deactivated too, but only if this Contact was its *sole*
// active link — otherwise just the OpportunityContact join row is dropped,
// same "unlink, don't cascade-destroy" instinct as companyService.ts's
// deleteCompany with Contacts. Never blocks, never destroys anything — there
// was no destructive choice left to ask the user about.
export async function deactivateContact(id: string): Promise<DeactivateContactResult> {
  return prisma.$transaction(async (tx) => {
    const links = await tx.opportunityContact.findMany({ where: { contactId: id }, select: { opportunityId: true } });
    const deactivatedOpportunityIds: string[] = [];

    for (const { opportunityId } of links) {
      // Counted before this Contact's own row flips below, so it's still
      // included here — a count of 1 means "just this one".
      const activeLinkCount = await tx.opportunityContact.count({
        where: { opportunityId, contact: { isActive: true } },
      });
      if (activeLinkCount <= 1) {
        await tx.opportunity.update({ where: { id: opportunityId }, data: { isActive: false } });
        deactivatedOpportunityIds.push(opportunityId);
      } else {
        await tx.opportunityContact.deleteMany({ where: { opportunityId, contactId: id } });
      }
    }

    const contact = await tx.contact.update({ where: { id }, data: { isActive: false }, include: CONTACT_INCLUDE });
    return { contact, deactivatedOpportunityIds };
  });
}
