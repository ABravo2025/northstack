import prisma from '../../lib/prisma.js';
import { listCustomFieldValuesForEntities } from '../hr/customFieldService.js';
import { listTagsForEntities } from '../crossModule/tagService.js';
import { recordActivity } from '../activity/activityLogService.js';
import { contactActivityFieldConfig, contactDisplayName } from '../activity/fieldConfigs/contactFieldConfig.js';
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

// changedByUserId is optional — see employeeService.ts's createEmployee for why
// (publicFormService.ts's anonymous submission path doesn't pass one, and gets no Activity Log entry).
export async function createContact(input: CreateContactInput, changedByUserId?: string): Promise<Contact> {
  const companyId = input.companyId ?? null;
  const isPrimary = input.isPrimary ?? false;

  // isPrimary is unique per Company (docs/tareas/specredisenosalesv2.md §2.3)
  // — a companyId-less Contact has no Company to be unique against, so the
  // flag is stored as-is but never triggers the demotion below.
  const contact =
    isPrimary && companyId
      ? await prisma.$transaction(async (tx) => {
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
        })
      : await prisma.contact.create({
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

  if (changedByUserId) {
    await recordActivity({
      tenantId: input.tenantId,
      entityType: 'contact',
      entityId: contact.id,
      entityLabel: contactDisplayName(contact),
      action: 'create',
      changedByUserId,
      after: contact,
      fieldConfig: contactActivityFieldConfig,
    });
  }

  return contact;
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

  const contactIds = contacts.map((contact) => contact.id);
  const [values, tags] = await Promise.all([
    listCustomFieldValuesForEntities(tenantId, 'contact', contactIds),
    listTagsForEntities(tenantId, 'contact', contactIds),
  ]);

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

export async function updateContact(id: string, input: UpdateContactInput, changedByUserId: string): Promise<Contact> {
  const existing = await prisma.contact.findUniqueOrThrow({ where: { id } });

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

  // isPrimary is unique per Company (docs/tareas/specredisenosalesv2.md §2.3). Re-checked
  // whenever this PATCH touches *either* isPrimary or companyId — a contact that's already
  // isPrimary: true and only gets relinked to a different company (companyId changes,
  // isPrimary isn't resent) still has to demote whoever's primary there today, or the target
  // company ends up with two primary contacts.
  let demoteOthersInCompanyId: string | null = null;
  if (input.isPrimary !== undefined || input.companyId !== undefined) {
    const effectiveIsPrimary = input.isPrimary !== undefined ? input.isPrimary : existing.isPrimary;
    const effectiveCompanyId = input.companyId !== undefined ? input.companyId : existing.companyId;
    if (effectiveIsPrimary && effectiveCompanyId) {
      demoteOthersInCompanyId = effectiveCompanyId;
    }
  }

  const updated = demoteOthersInCompanyId
    ? await prisma.$transaction(async (tx) => {
        await tx.contact.updateMany({
          where: { companyId: demoteOthersInCompanyId!, isPrimary: true, id: { not: id } },
          data: { isPrimary: false },
        });
        return tx.contact.update({ where: { id }, data, include: CONTACT_INCLUDE });
      })
    : await prisma.contact.update({
        where: { id },
        data,
        include: CONTACT_INCLUDE,
      });

  await recordActivity({
    tenantId: existing.tenantId,
    entityType: 'contact',
    entityId: id,
    entityLabel: contactDisplayName(updated),
    action: 'update',
    changedByUserId,
    before: existing,
    after: updated,
    fieldConfig: contactActivityFieldConfig,
  });

  return updated;
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
export async function deactivateContact(id: string, changedByUserId: string): Promise<DeactivateContactResult> {
  const result = await prisma.$transaction(async (tx) => {
    const links = await tx.opportunityContact.findMany({ where: { contactId: id }, select: { opportunityId: true } });
    const deactivatedOpportunityIds: string[] = [];

    // One batched count for every linked Opportunity instead of one query per link — counted
    // before this Contact's own row flips below, so it's still included here (a count of 1 means
    // "just this one").
    const opportunityIds = links.map((l) => l.opportunityId);
    const activeCounts = await tx.opportunityContact.groupBy({
      by: ['opportunityId'],
      where: { opportunityId: { in: opportunityIds }, contact: { isActive: true } },
      _count: { _all: true },
    });
    const activeCountByOpportunity = new Map(activeCounts.map((c) => [c.opportunityId, c._count._all]));

    for (const { opportunityId } of links) {
      const activeLinkCount = activeCountByOpportunity.get(opportunityId) ?? 0;
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

  await recordActivity({
    tenantId: result.contact.tenantId,
    entityType: 'contact',
    entityId: id,
    entityLabel: contactDisplayName(result.contact),
    action: 'delete',
    changedByUserId,
    before: result.contact,
    fieldConfig: contactActivityFieldConfig,
  });

  return result;
}
