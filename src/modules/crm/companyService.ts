import prisma from '../../lib/prisma.js';
import { getDefaultStatusId } from '../hr/statusService.js';
import { listCustomFieldValuesForEntities } from '../hr/customFieldService.js';
import { listTagsForEntities } from '../crossModule/tagService.js';
import { deleteOpportunity } from './opportunityService.js';
import { wouldCreateCycle } from '../../lib/cycleDetection.js';
import { recordActivity } from '../activity/activityLogService.js';
import { companyActivityFieldConfig } from '../activity/fieldConfigs/companyFieldConfig.js';
import { contactActivityFieldConfig, contactDisplayName } from '../activity/fieldConfigs/contactFieldConfig.js';
import type { Company, Contact, Prisma } from '@prisma/client';

export interface CreateCompanyInput {
  name: string;
  industry?: string | null;
  website?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
  sizeId?: string | null;
  accountOwnerId?: string | null;
  statusId?: string;
  tenantId: string;
  // A Company can't exist without a linked Contact (confirmed business rule,
  // not just a form nicety) — resolved in the same transaction as creation so
  // the two can never drift apart. Either a brand-new Contact (the "Add
  // Company" form) or an existing one this Company is being spun up for (e.g.
  // ContactDetailModal creating an ad-hoc Company for a Contact that doesn't
  // have one yet) — both satisfy the same invariant.
  contact: { firstName: string; lastName: string; email: string } | { contactId: string };
  // True only for the ad-hoc Company created inline from a `lead`-type
  // Pipeline when a Contact has no Company yet (ContactDetailModal.tsx) —
  // every other call site (the "Add Company" form, public Form matching)
  // omits this and gets the default `false`. See Company.isPlaceholder in
  // schema.prisma for what this gates.
  isPlaceholder?: boolean;
}

// statusId deliberately excluded — Company.status is derived from business
// events (Opportunity reaching a `won` stage, future Contract expiry), never
// edited directly. Keeping it out of the whitelist enforces that at the
// service layer too, not just by omitting a control in the UI.
export interface UpdateCompanyInput {
  name?: string;
  industry?: string | null;
  website?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
  sizeId?: string | null;
  accountOwnerId?: string | null;
  parentCompanyId?: string | null;
  // Only ever flipped false — the "complete this company's real details"
  // step of moving an Opportunity into an `account` pipeline
  // (OpportunityDetailModal.tsx's handleCompleteCompanyAndMove, see
  // docs/tareas/specredisenosalesv2.md §3.6). Nothing sets it back to true.
  isPlaceholder?: boolean;
}

const COMPANY_INCLUDE = {
  statusDefn: true,
  accountOwner: { select: { id: true, firstName: true, lastName: true } },
  sizeDefn: true,
  parentCompany: { select: { id: true, name: true } },
} satisfies Prisma.CompanyInclude;

// Same walk-the-chain shape as employeeService.ts's wouldCreateManagerCycle,
// applied to Company.parentCompanyId instead of Employee.managerId. The
// caller (routes/companies.ts) is responsible for confirming proposedParentId
// belongs to the same tenant before calling this — this function only walks
// the chain, it doesn't re-check tenant ownership at each hop.
export async function wouldCreateCompanyHierarchyCycle(companyId: string, proposedParentId: string): Promise<boolean> {
  return wouldCreateCycle(companyId, proposedParentId, async (id) => {
    const parent = await prisma.company.findUnique({ where: { id }, select: { parentCompanyId: true } });
    return parent?.parentCompanyId ?? null;
  });
}

export async function createCompany(input: CreateCompanyInput, changedByUserId: string): Promise<Company> {
  const statusId = input.statusId ?? (await getDefaultStatusId(input.tenantId, 'company'));

  const { company, contact, contactAction, contactBefore } = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: input.name,
        industry: input.industry ?? null,
        website: input.website ?? null,
        phone: input.phone ?? null,
        billingAddress: input.billingAddress ?? null,
        sizeId: input.sizeId ?? null,
        accountOwnerId: input.accountOwnerId ?? null,
        statusId,
        tenantId: input.tenantId,
        isPlaceholder: input.isPlaceholder ?? false,
      },
      include: COMPANY_INCLUDE,
    });

    let contact: Contact;
    let contactAction: 'create' | 'update';
    let contactBefore: Contact | null = null;

    if ('contactId' in input.contact) {
      contactBefore = await tx.contact.findUniqueOrThrow({ where: { id: input.contact.contactId } });
      contact = await tx.contact.update({ where: { id: input.contact.contactId }, data: { companyId: company.id } });
      contactAction = 'update';
    } else {
      contact = await tx.contact.create({
        data: {
          tenantId: input.tenantId,
          firstName: input.contact.firstName,
          lastName: input.contact.lastName,
          email: input.contact.email,
          companyId: company.id,
        },
      });
      contactAction = 'create';
    }

    return { company, contact, contactAction, contactBefore };
  });

  await recordActivity({
    tenantId: input.tenantId,
    entityType: 'company',
    entityId: company.id,
    entityLabel: company.name,
    action: 'create',
    changedByUserId,
    after: company,
    fieldConfig: companyActivityFieldConfig,
  });

  // The linked/created Contact is written inside the same transaction as the Company (see the
  // CreateCompanyInput.contact comment above — they can never drift apart), but that write was
  // invisible to the Activity Log until now: this is the only place that touches Contact rows
  // without going through contactService's createContact/updateContact.
  await recordActivity({
    tenantId: input.tenantId,
    entityType: 'contact',
    entityId: contact.id,
    entityLabel: contactDisplayName(contact),
    action: contactAction,
    changedByUserId,
    ...(contactAction === 'update' ? { before: contactBefore } : {}),
    after: contact,
    fieldConfig: contactActivityFieldConfig,
  });

  return company;
}

export async function listCompanies(tenantId: string) {
  const companies = await prisma.company.findMany({
    where: { tenantId },
    include: COMPANY_INCLUDE,
  });

  const companyIds = companies.map((company) => company.id);
  const [values, tags] = await Promise.all([
    listCustomFieldValuesForEntities(tenantId, 'company', companyIds),
    listTagsForEntities(tenantId, 'company', companyIds),
  ]);

  return companies.map((company) => ({
    ...company,
    customFieldVals: values.filter((value) => value.entityId === company.id),
    tags: tags.filter((tag) => tag.entityId === company.id),
  }));
}

export async function findCompanyById(id: string): Promise<Company | null> {
  return prisma.company.findUnique({
    where: { id },
  });
}

export async function updateCompany(id: string, input: UpdateCompanyInput, changedByUserId: string): Promise<Company> {
  // Whitelist explicitly — never pass the input object straight through, since it
  // may originate from req.body and carry extra fields (e.g. tenantId/statusId)
  // that would otherwise reassign this row across tenants or bypass the
  // no-manual-status-edit rule above.
  const data: Prisma.CompanyUncheckedUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.industry !== undefined) data.industry = input.industry;
  if (input.website !== undefined) data.website = input.website;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.billingAddress !== undefined) data.billingAddress = input.billingAddress;
  if (input.sizeId !== undefined) data.sizeId = input.sizeId;
  if (input.accountOwnerId !== undefined) data.accountOwnerId = input.accountOwnerId;
  if (input.parentCompanyId !== undefined) data.parentCompanyId = input.parentCompanyId;
  if (input.isPlaceholder !== undefined) data.isPlaceholder = input.isPlaceholder;

  // Read and write in the same transaction (same pattern as subscriptionService.ts's
  // syncSubscriptionAndTenant) so the "before" snapshot used for the Activity Log diff can't be
  // made stale by a concurrent update to this row landing between the read and the write.
  const { existing, updated } = await prisma.$transaction(async (tx) => {
    const existing = await tx.company.findUniqueOrThrow({ where: { id } });
    const updated = await tx.company.update({
      where: { id },
      data,
      include: COMPANY_INCLUDE,
    });
    return { existing, updated };
  });

  await recordActivity({
    tenantId: existing.tenantId,
    entityType: 'company',
    entityId: id,
    entityLabel: updated.name,
    action: 'update',
    changedByUserId,
    before: existing,
    after: updated,
    fieldConfig: companyActivityFieldConfig,
  });

  return updated;
}

export interface DeleteCompanyResult {
  success: boolean;
  error?: string;
}

export interface DeleteCompanyOptions {
  // Opportunity.companyId is a required FK (unlike Contact.companyId, which is
  // nullable) — an Opportunity structurally cannot survive its Company being
  // deleted, so this is opt-in cascade, same shape as contactService.ts's
  // deleteContact. Contacts are handled differently: they're unlinked
  // (companyId -> null), never deleted, so no opt-in is needed for them —
  // deleting a Company should never take a Contact down with it.
  deleteLinkedOpportunities?: boolean;
  // Child companies (Company.parentCompanyId) default to the same
  // unlink-never-delete treatment as Contacts — a parent's fate is
  // independent of its children's (docs/tareas/specredisenosalesv2.md §1.2).
  // Opt-in cascade deletes the whole subtree instead: each direct child is
  // deleted the same way (recursively), carrying deleteLinkedOpportunities
  // along so a child with Opportunities doesn't dead-end mid-cascade.
  cascadeToChildCompanies?: boolean;
}

export async function deleteCompany(
  id: string,
  changedByUserId: string,
  options: DeleteCompanyOptions = {},
): Promise<DeleteCompanyResult> {
  const existing = await prisma.company.findUniqueOrThrow({ where: { id } });

  const opportunityCount = await prisma.opportunity.count({ where: { companyId: id } });
  if (opportunityCount > 0 && !options.deleteLinkedOpportunities) {
    return { success: false, error: 'Cannot delete a company with existing opportunities' };
  }

  if (opportunityCount > 0) {
    const opportunities = await prisma.opportunity.findMany({ where: { companyId: id }, select: { id: true } });
    // Each deleteOpportunity call is its own transaction over disjoint rows (that Opportunity's
    // own history/contact-links/tags) — independent, so they run concurrently.
    await Promise.all(opportunities.map((opportunity) => deleteOpportunity(opportunity.id, changedByUserId)));
  }

  if (options.cascadeToChildCompanies) {
    const children = await prisma.company.findMany({ where: { parentCompanyId: id }, select: { id: true } });
    for (const child of children) {
      const childResult = await deleteCompany(child.id, changedByUserId, options);
      if (!childResult.success) {
        return childResult;
      }
    }
  } else {
    await prisma.company.updateMany({ where: { parentCompanyId: id }, data: { parentCompanyId: null } });
  }

  await prisma.$transaction([
    prisma.contact.updateMany({ where: { companyId: id }, data: { companyId: null } }),
    prisma.tagAssignment.deleteMany({ where: { entityType: 'company', entityId: id } }),
    prisma.company.delete({ where: { id } }),
  ]);

  await recordActivity({
    tenantId: existing.tenantId,
    entityType: 'company',
    entityId: id,
    entityLabel: existing.name,
    action: 'delete',
    changedByUserId,
    before: existing,
    fieldConfig: companyActivityFieldConfig,
  });

  return { success: true };
}
