import prisma from '../../lib/prisma.js';
import type { Opportunity, Prisma } from '@prisma/client';

export interface CreateOpportunityInput {
  tenantId: string;
  companyId: string;
  pipelineId: string;
  stageId?: string;
  name: string;
  amountCents: number;
  currency: string;
  estimatedCloseDate?: string | null;
  ownerId: string;
  lossReasonId?: string | null;
  nextStepDate?: string | null;
  nextStepNote?: string | null;
}

export interface UpdateOpportunityInput {
  companyId?: string;
  name?: string;
  amountCents?: number;
  currency?: string;
  stageId?: string;
  estimatedCloseDate?: string | null;
  ownerId?: string;
  lossReasonId?: string | null;
  nextStepDate?: string | null;
  nextStepNote?: string | null;
  // Not exposed by any UI yet — set automatically by
  // contactService.ts's deactivateContact when this Opportunity loses its
  // sole active Contact (docs/tareas/specredisenosalesv2.md §2.2). Whitelisted
  // here so that's not a dead end at the API layer either.
  isActive?: boolean;
}

const OPPORTUNITY_INCLUDE = {
  company: { select: { id: true, name: true } },
  pipeline: { select: { id: true, name: true, type: true, isActive: true } },
  stage: true,
  owner: { select: { id: true, firstName: true, lastName: true } },
  contactLinks: { include: { contact: { select: { id: true, firstName: true, lastName: true, email: true } } } },
  stageHistory: { orderBy: { enteredAt: 'desc' } },
} satisfies Prisma.OpportunityInclude;

// Won→Customer: when an Opportunity's stage moves to a `won`-outcome stage,
// the parent Company's lifecycle status advances to whatever the tenant's
// "Customer" StatusDefinition is (entityType 'company', seeded with that name
// — see statusService.ts's DEFAULT_STATUSES). Best-effort: if the tenant
// renamed/deactivated that status, there's nothing safe to advance to, so
// this just skips rather than failing the Opportunity update over it.
async function maybeAdvanceCompanyToCustomer(tenantId: string, companyId: string): Promise<void> {
  const customerStatus = await prisma.statusDefinition.findFirst({
    where: { tenantId, entityType: 'company', name: 'Customer', isActive: true },
  });
  if (!customerStatus) {
    return;
  }
  await prisma.company.update({ where: { id: companyId }, data: { statusId: customerStatus.id } });
}

export async function createOpportunity(input: CreateOpportunityInput): Promise<Opportunity> {
  let stageId = input.stageId;
  if (!stageId) {
    const firstStage = await prisma.pipelineStageDefinition.findFirst({
      where: { pipelineId: input.pipelineId, isActive: true },
      orderBy: { order: 'asc' },
    });
    if (!firstStage) {
      throw new Error('Pipeline has no active stages to default into');
    }
    stageId = firstStage.id;
  }

  const opportunity = await prisma.opportunity.create({
    data: {
      tenantId: input.tenantId,
      companyId: input.companyId,
      pipelineId: input.pipelineId,
      stageId,
      name: input.name,
      amountCents: input.amountCents,
      currency: input.currency,
      estimatedCloseDate: input.estimatedCloseDate ? new Date(input.estimatedCloseDate) : null,
      ownerId: input.ownerId,
      lossReasonId: input.lossReasonId ?? null,
      nextStepDate: input.nextStepDate ? new Date(input.nextStepDate) : null,
      nextStepNote: input.nextStepNote ?? null,
    },
  });

  await prisma.opportunityStageHistory.create({
    data: { tenantId: input.tenantId, opportunityId: opportunity.id, stageId },
  });

  const stage = await prisma.pipelineStageDefinition.findUnique({ where: { id: stageId } });
  if (stage?.outcome === 'won') {
    await maybeAdvanceCompanyToCustomer(input.tenantId, input.companyId);
  }

  return opportunity;
}

// includeInactive defaults to false — same isActive-gated-by-default idiom as
// contactService.ts's listContacts. No caller passes `true` yet.
export async function listOpportunities(tenantId: string, includeInactive = false) {
  return prisma.opportunity.findMany({
    where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
    include: OPPORTUNITY_INCLUDE,
  });
}

export async function findOpportunityById(id: string) {
  return prisma.opportunity.findUnique({ where: { id }, include: OPPORTUNITY_INCLUDE });
}

export async function updateOpportunity(
  id: string,
  tenantId: string,
  input: UpdateOpportunityInput,
): Promise<Opportunity> {
  const existing = await prisma.opportunity.findUniqueOrThrow({ where: { id } });

  // Whitelist explicitly — never pass the input object straight through, since it
  // may originate from req.body and carry extra fields (e.g. tenantId/pipelineId)
  // that would otherwise reassign this row across tenants or move it between
  // pipelines with an incompatible stage set.
  const data: Prisma.OpportunityUncheckedUpdateInput = {};
  if (input.companyId !== undefined) data.companyId = input.companyId;
  if (input.name !== undefined) data.name = input.name;
  if (input.amountCents !== undefined) data.amountCents = input.amountCents;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.stageId !== undefined) data.stageId = input.stageId;
  if (input.estimatedCloseDate !== undefined) {
    data.estimatedCloseDate = input.estimatedCloseDate ? new Date(input.estimatedCloseDate) : null;
  }
  if (input.ownerId !== undefined) data.ownerId = input.ownerId;
  if (input.lossReasonId !== undefined) data.lossReasonId = input.lossReasonId;
  if (input.nextStepDate !== undefined) data.nextStepDate = input.nextStepDate ? new Date(input.nextStepDate) : null;
  if (input.nextStepNote !== undefined) data.nextStepNote = input.nextStepNote;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  const updated = await prisma.opportunity.update({ where: { id }, data });

  if (input.stageId && input.stageId !== existing.stageId) {
    await prisma.opportunityStageHistory.create({
      data: { tenantId, opportunityId: id, stageId: input.stageId },
    });

    const stage = await prisma.pipelineStageDefinition.findUnique({ where: { id: input.stageId } });
    if (stage?.outcome === 'won') {
      await maybeAdvanceCompanyToCustomer(tenantId, updated.companyId);
    }
  }

  return updated;
}

export async function deleteOpportunity(id: string): Promise<void> {
  // No onDelete cascade on OpportunityStageHistory/OpportunityContact's FKs —
  // every Opportunity has at least one history row from creation, so a plain
  // delete would always hit a foreign-key restrict. Clean up children first.
  await prisma.$transaction([
    prisma.opportunityStageHistory.deleteMany({ where: { opportunityId: id } }),
    prisma.opportunityContact.deleteMany({ where: { opportunityId: id } }),
    prisma.opportunity.delete({ where: { id } }),
  ]);
}

export async function addOpportunityContact(tenantId: string, opportunityId: string, contactId: string, role?: string | null) {
  return prisma.opportunityContact.create({
    data: { tenantId, opportunityId, contactId, role: role ?? null },
    include: { contact: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
}

export async function removeOpportunityContact(opportunityId: string, contactId: string): Promise<void> {
  await prisma.opportunityContact.deleteMany({ where: { opportunityId, contactId } });
}

export async function listOpportunityStageHistory(tenantId: string, opportunityId: string) {
  return prisma.opportunityStageHistory.findMany({
    where: { tenantId, opportunityId },
    include: { stage: { select: { id: true, name: true, color: true } } },
    orderBy: { enteredAt: 'asc' },
  });
}
