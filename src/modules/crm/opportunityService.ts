import prisma from '../../lib/prisma.js';
import { resolveNextRoundRobinUserId } from './pipelineAssignmentService.js';
import { createNotification } from '../notifications/notificationService.js';
import { sendOpportunityStageChangedEmail } from '../../lib/mailer.js';
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
  // Optional since Unit 8 (docs/tareas/specredisenosalesv2.md §3.8) — an
  // explicit value always wins; omitted/null falls back to the target
  // Pipeline's assignmentMode (round_robin, or account_owner via
  // Company.accountOwnerId), which can itself resolve to null (nobody
  // eligible) rather than fail the create.
  ownerId?: string | null;
  lossReasonId?: string | null;
  winReasonId?: string | null;
  closeNote?: string | null;
  nextStepDate?: string | null;
  nextStepNote?: string | null;
}

export interface UpdateOpportunityInput {
  companyId?: string;
  name?: string;
  amountCents?: number;
  currency?: string;
  // Reassigning this always resets stageId to the target pipeline's first
  // active stage server-side (docs/tareas/specredisenosalesv2.md §3.6) — any
  // stageId also present in the same call is ignored when pipelineId changes,
  // same "server computes it" pattern as createOpportunity.
  pipelineId?: string;
  stageId?: string;
  estimatedCloseDate?: string | null;
  // undefined = caller didn't touch it (account_owner may still resolve one
  // on a pipeline move, §3.8); null = explicitly clear the owner.
  ownerId?: string | null;
  lossReasonId?: string | null;
  // Symmetric to lossReasonId (docs/tareas/specredisenosalesv2.md §3.7) —
  // required at the application layer (routes/opportunities.ts) when the
  // resolved stage has outcome: 'won'.
  winReasonId?: string | null;
  closeNote?: string | null;
  nextStepDate?: string | null;
  nextStepNote?: string | null;
  // Not exposed by any UI yet — set automatically by
  // contactService.ts's deactivateContact when this Opportunity loses its
  // sole active Contact (docs/tareas/specredisenosalesv2.md §2.2). Whitelisted
  // here so that's not a dead end at the API layer either.
  isActive?: boolean;
  // Who's making this call (routes/opportunities.ts's PATCH handler) — used
  // only to skip the stage-change notification when the owner moved their
  // own deal (docs/tareas/specredisenosalesv2.md §3.8). Not persisted.
  changedByUserId?: string;
}

// Resolves Owner for both createOpportunity and updateOpportunity's
// pipeline-move branch (docs/tareas/specredisenosalesv2.md §3.8). `mode`
// distinguishes the two call sites: at creation there's no prior owner to
// override, so `account_owner` just fills in company.accountOwnerId same as
// the round-robin fallback would; on a pipeline move, an already-set owner
// gets overridden by company.accountOwnerId on purpose (the account's
// designated manager takes over regardless of who worked the lead), while
// round-robin only fills in when the Opportunity has no owner yet.
async function resolveAutoAssignedOwnerId(
  tenantId: string,
  pipelineId: string,
  companyId: string,
  options: { mode: 'create' } | { mode: 'move'; existingOwnerId: string | null },
): Promise<string | null> {
  const pipeline = await prisma.pipeline.findUnique({
    where: { id: pipelineId },
    select: { type: true, assignmentMode: true },
  });
  if (!pipeline?.assignmentMode) {
    return options.mode === 'move' ? options.existingOwnerId : null;
  }

  if (pipeline.type === 'account' && pipeline.assignmentMode === 'account_owner') {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { accountOwnerId: true } });
    if (company?.accountOwnerId) {
      return company.accountOwnerId; // override — always wins, both at creation and on a move
    }
    if (options.mode === 'move' && options.existingOwnerId) {
      return options.existingOwnerId; // fill-only-if-empty: already has an owner, leave it
    }
    return resolveNextRoundRobinUserId(tenantId, pipelineId);
  }

  if (pipeline.assignmentMode === 'round_robin') {
    if (options.mode === 'move' && options.existingOwnerId) {
      return options.existingOwnerId;
    }
    return resolveNextRoundRobinUserId(tenantId, pipelineId);
  }

  return options.mode === 'move' ? options.existingOwnerId : null;
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

  const ownerId = input.ownerId
    ? input.ownerId
    : await resolveAutoAssignedOwnerId(input.tenantId, input.pipelineId, input.companyId, { mode: 'create' });

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
      ownerId,
      lossReasonId: input.lossReasonId ?? null,
      winReasonId: input.winReasonId ?? null,
      closeNote: input.closeNote ?? null,
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
  if (input.estimatedCloseDate !== undefined) {
    data.estimatedCloseDate = input.estimatedCloseDate ? new Date(input.estimatedCloseDate) : null;
  }
  if (input.ownerId !== undefined) data.ownerId = input.ownerId;
  if (input.lossReasonId !== undefined) data.lossReasonId = input.lossReasonId;
  if (input.winReasonId !== undefined) data.winReasonId = input.winReasonId;
  if (input.closeNote !== undefined) data.closeNote = input.closeNote;
  if (input.nextStepDate !== undefined) data.nextStepDate = input.nextStepDate ? new Date(input.nextStepDate) : null;
  if (input.nextStepNote !== undefined) data.nextStepNote = input.nextStepNote;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  // A pipeline change always wins over any stageId also present in the same
  // call — the target pipeline's stage set is different, so the caller's
  // stageId (if any) almost certainly belongs to the *old* pipeline.
  let resolvedStageId: string | undefined;
  if (input.pipelineId !== undefined && input.pipelineId !== existing.pipelineId) {
    data.pipelineId = input.pipelineId;
    const firstStage = await prisma.pipelineStageDefinition.findFirst({
      where: { pipelineId: input.pipelineId, isActive: true },
      orderBy: { order: 'asc' },
    });
    if (!firstStage) {
      throw new Error('Pipeline has no active stages to default into');
    }
    data.stageId = firstStage.id;
    resolvedStageId = firstStage.id;

    // account_owner / round-robin on a pipeline move (docs/tareas/specredisenosalesv2.md
    // §3.8) — only when the caller didn't already touch ownerId in this same
    // call (an explicit choice, including an explicit null, always wins).
    if (input.ownerId === undefined) {
      const effectiveCompanyId = input.companyId ?? existing.companyId;
      data.ownerId = await resolveAutoAssignedOwnerId(tenantId, input.pipelineId, effectiveCompanyId, {
        mode: 'move',
        existingOwnerId: existing.ownerId,
      });
    }
  } else if (input.stageId !== undefined) {
    data.stageId = input.stageId;
    resolvedStageId = input.stageId;
  }

  const updated = await prisma.opportunity.update({ where: { id }, data });

  if (resolvedStageId && resolvedStageId !== existing.stageId) {
    await prisma.opportunityStageHistory.create({
      data: { tenantId, opportunityId: id, stageId: resolvedStageId },
    });

    const stage = await prisma.pipelineStageDefinition.findUnique({ where: { id: resolvedStageId } });
    if (stage?.outcome === 'won') {
      await maybeAdvanceCompanyToCustomer(tenantId, updated.companyId);
    }

    // Stage-change notification + email (docs/tareas/specredisenosalesv2.md
    // §3.8) — notify the post-update owner, but never about their own change
    // (most stage moves are the owner dragging their own Kanban card; echoing
    // that back would train people to ignore the bell). Best-effort: a
    // failure here must never fail the Opportunity update itself.
    const recipientId = updated.ownerId;
    if (recipientId && recipientId !== input.changedByUserId) {
      try {
        const [oldStage, newStage, recipient, actor] = await Promise.all([
          prisma.pipelineStageDefinition.findUnique({ where: { id: existing.stageId }, select: { name: true } }),
          stage ?? prisma.pipelineStageDefinition.findUnique({ where: { id: resolvedStageId }, select: { name: true } }),
          prisma.user.findUnique({ where: { id: recipientId }, select: { email: true, firstName: true } }),
          input.changedByUserId
            ? prisma.user.findUnique({ where: { id: input.changedByUserId }, select: { firstName: true, lastName: true } })
            : null,
        ]);
        const actorName = actor ? `${actor.firstName} ${actor.lastName}` : undefined;
        const message = `${updated.name} moved from ${oldStage?.name ?? 'a previous stage'} to ${newStage?.name ?? 'a new stage'}${
          actorName ? ` by ${actorName}` : ''
        }`;

        await createNotification({
          tenantId,
          userId: recipientId,
          type: 'opportunity_stage_changed',
          entityType: 'opportunity',
          entityId: id,
          message,
        });

        if (recipient) {
          const company = await prisma.company.findUnique({ where: { id: updated.companyId }, select: { name: true } });
          const appUrl = `${process.env.APP_BASE_URL ?? 'http://localhost:5173'}/opportunities`;
          sendOpportunityStageChangedEmail({
            to: recipient.email,
            ownerFirstName: recipient.firstName,
            opportunityName: updated.name,
            companyName: company?.name ?? '',
            fromStage: oldStage?.name ?? 'a previous stage',
            toStage: newStage?.name ?? 'a new stage',
            changedByName: actorName,
            appUrl,
          }).catch((error) => console.error('Failed to send opportunity stage changed email:', error));
        }
      } catch (error) {
        console.error('Failed to create opportunity stage changed notification:', error);
      }
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
