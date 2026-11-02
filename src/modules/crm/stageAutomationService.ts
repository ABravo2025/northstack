import type { Opportunity, PipelineStageDefinition } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { bestEffort } from '../../lib/bestEffort.js';
import { createTask } from '../tasks/taskService.js';
import { isForwardMove, missingRequired, readAutomations, readChecklist, readChecklistState, type ChecklistItem } from './stageRules.js';

// Clientes C1: what a stage asks before a deal leaves it (exit checklist) and does when a deal
// enters it (entry automations). Both optional, set per stage in Settings → Pipelines.

export class OpportunityChecklistError extends Error {
  constructor(public missing: ChecklistItem[]) {
    super('Complete the stage checklist before moving this deal forward');
  }
}

// Throws when a forward move leaves required checklist items unticked in the current stage.
export async function assertChecklistAllowsMove(
  opportunity: Pick<Opportunity, 'stageId' | 'checklistState'>,
  toStageId: string,
) {
  if (toStageId === opportunity.stageId) return;
  const [from, to] = await Promise.all([
    prisma.pipelineStageDefinition.findUnique({ where: { id: opportunity.stageId } }),
    prisma.pipelineStageDefinition.findUnique({ where: { id: toStageId } }),
  ]);
  if (!from || !to || from.pipelineId !== to.pipelineId || !isForwardMove(from, to)) return;
  const missing = missingRequired(readChecklist(from.exitChecklist), readChecklistState(opportunity.checklistState)[from.id]);
  if (missing.length) throw new OpportunityChecklistError(missing);
}

// Ticks or unticks one checklist item of one stage on a deal. The item must exist on that stage.
export async function setChecklistItem(tenantId: string, opportunityId: string, stageId: string, itemId: string, done: boolean) {
  const opportunity = await prisma.opportunity.findFirst({ where: { id: opportunityId, tenantId } });
  if (!opportunity) return null;
  const stage = await prisma.pipelineStageDefinition.findFirst({ where: { id: stageId, tenantId, pipelineId: opportunity.pipelineId } });
  if (!stage || !readChecklist(stage.exitChecklist).some((i) => i.id === itemId)) return null;
  const state = readChecklistState(opportunity.checklistState);
  const current = new Set(state[stageId] ?? []);
  if (done) current.add(itemId);
  else current.delete(itemId);
  state[stageId] = [...current];
  return prisma.opportunity.update({ where: { id: opportunityId }, data: { checklistState: state } });
}

const DAY = 86_400_000;

// Runs a stage's entry automations for a deal that just entered it. Best-effort per automation:
// a failure is logged and never undoes or fails the move.
export async function runEnterAutomations(
  tenantId: string,
  opportunity: Pick<Opportunity, 'id' | 'name' | 'ownerId'>,
  stage: Pick<PipelineStageDefinition, 'enterAutomations'>,
  actorId?: string | null,
) {
  const automations = readAutomations(stage.enterAutomations);
  for (const a of automations) {
    if (a.type === 'create_task') {
      // Assigned to the deal's owner; without one, to whoever moved it. Nobody to give it to → skip.
      const assigneeId = opportunity.ownerId ?? actorId ?? null;
      if (!assigneeId) continue;
      await bestEffort(
        createTask({
          tenantId,
          entityType: 'opportunity',
          entityId: opportunity.id,
          title: a.title,
          assigneeId,
          createdById: actorId ?? assigneeId,
          dueDate: new Date(Date.now() + a.dueInDays * DAY),
        }),
        'Failed to run stage automation (create task)',
      );
    } else if (a.type === 'send_survey') {
      const contacts = await prisma.opportunityContact.findMany({ where: { tenantId, opportunityId: opportunity.id }, select: { contactId: true } });
      if (!contacts.length) continue;
      // Loaded lazily: the forms module itself creates opportunities (lead forms).
      const { sendInvites } = await import('../forms/formInviteService.js');
      await bestEffort(
        sendInvites(tenantId, a.formId, { recipientIds: contacts.map((c) => c.contactId), trigger: 'stage_entered', createdById: actorId ?? null }),
        'Failed to run stage automation (send survey)',
      );
    }
  }
}
