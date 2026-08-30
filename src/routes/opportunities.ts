import { canCreateHr, canViewHr } from '../modules/auth/permissionService.js';
import { findCompanyById } from '../modules/crm/companyService.js';
import { findContactById } from '../modules/crm/contactService.js';
import {
  addOpportunityContact,
  createOpportunity,
  deleteOpportunity,
  findOpportunityById,
  listOpportunities,
  listOpportunityStageHistory,
  removeOpportunityContact,
  updateOpportunity,
} from '../modules/crm/opportunityService.js';
import { findFirstActiveStage, findPipelineById, findPipelineStageById } from '../modules/crm/pipelineService.js';
import { findFieldCatalogDefinitionById } from '../modules/hr/fieldCatalogService.js';
import { findUserById } from '../modules/tenant/tenantService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import type { PipelineStageOutcome } from '@prisma/client';

export const opportunitiesRouter = createAsyncRouter();

// Shared validation for create/update: every FK referenced in the body has to
// belong to this tenant (directive: validate any id referenced in the body,
// not just the URL param), the pipeline has to be active (archived pipelines
// are read-only — "no editables hasta desarchivar"), the stage has to belong
// to that pipeline, and a `lost`-outcome stage requires a lossReasonId (a
// `won`-outcome stage requires a winReasonId, symmetric — spec §3.7).
async function validateOpportunityRefs(
  tenantId: string,
  body: any,
  pipelineId: string,
  existingLossReasonId?: string | null,
  existingCompanyId?: string,
  existingWinReasonId?: string | null,
  // undefined on create (there's no "existing" pipeline yet). On update, passing the
  // Opportunity's current pipelineId lets this function tell "pipeline is changing" apart from
  // "pipeline is unchanged" — see the effective-stage resolution below.
  existingPipelineId?: string,
): Promise<{ error: string } | null> {
  const pipeline = await findPipelineById(pipelineId);
  if (!pipeline || pipeline.tenantId !== tenantId) {
    return { error: 'Pipeline not found' };
  }
  if (!pipeline.isActive) {
    return { error: 'Cannot create or edit an Opportunity in an archived pipeline' };
  }

  // Re-check on either a companyId change OR a pipelineId change — moving an
  // Opportunity into an `account` pipeline is just as much a gate violation as
  // assigning a placeholder Company to one, and the caller passes the
  // *effective* pipelineId here (target pipeline when body.pipelineId is
  // present, else the existing one), so `pipeline` above already reflects the
  // pipeline this Opportunity would end up in.
  const companyChanging = body.companyId !== undefined;
  const pipelineChanging = body.pipelineId !== undefined;
  if (companyChanging || pipelineChanging) {
    const effectiveCompanyId = companyChanging ? body.companyId : existingCompanyId;
    if (effectiveCompanyId) {
      const company = await findCompanyById(effectiveCompanyId);
      if (!company || company.tenantId !== tenantId) {
        return { error: 'Company not found' };
      }
      // Backend half of the gate ContactDetailModal.tsx already enforces
      // client-side (docs/tareas/specredisenosalesv2.md §3.2/§3.6) — an
      // `account` pipeline manages an already-identified company, never a
      // placeholder created ad hoc off a `lead` pipeline. Hitting the API
      // directly used to bypass this entirely.
      if (pipeline.type === 'account' && company.isPlaceholder) {
        return { error: 'This pipeline requires an already-identified company — this one is still a placeholder.' };
      }
    }
  }

  // undefined = "let assignment automation decide" (create) or "leave as-is"
  // (update); null = an intentional, explicit clear (Opportunity gets no
  // owner) — docs/tareas/specredisenosalesv2.md §3.8. Neither goes through
  // the owner-exists lookup below.
  if (body.ownerId !== undefined && body.ownerId !== null) {
    const owner = await findUserById(body.ownerId);
    if (!owner || owner.tenantId !== tenantId) {
      return { error: 'Owner not found' };
    }
  }

  const resolvedLossReasonId = body.lossReasonId !== undefined ? body.lossReasonId : existingLossReasonId;
  const resolvedWinReasonId = body.winReasonId !== undefined ? body.winReasonId : existingWinReasonId;

  // The stage this Opportunity will actually end up on. An explicit stageId always wins; absent
  // that, a pipeline change (create, or an update whose pipelineId differs from the existing one)
  // makes opportunityService.ts silently resolve the target pipeline's first active stage — that
  // resolved stage needs the same won/lost-reason check an explicit stageId would get, or
  // reordering a pipeline's stages (e.g. via the drag-and-drop editor) so a Won/Lost stage is
  // first lets an Opportunity land there with no reason ever required.
  let effectiveStage: { outcome: PipelineStageOutcome } | null = null;
  if (body.stageId !== undefined) {
    const stage = await findPipelineStageById(body.stageId);
    if (!stage || stage.tenantId !== tenantId || stage.pipelineId !== pipelineId) {
      return { error: 'Stage not found' };
    }
    effectiveStage = stage;
  } else if (existingPipelineId === undefined || pipelineId !== existingPipelineId) {
    effectiveStage = await findFirstActiveStage(pipelineId);
  }

  if (effectiveStage) {
    if (effectiveStage.outcome === 'lost' && !resolvedLossReasonId) {
      return { error: 'A loss reason is required when moving an Opportunity to a Lost stage' };
    }
    if (effectiveStage.outcome === 'won' && !resolvedWinReasonId) {
      return { error: 'A win reason is required when moving an Opportunity to a Won stage' };
    }
  }

  if (body.lossReasonId) {
    const lossReason = await findFieldCatalogDefinitionById(body.lossReasonId);
    if (!lossReason || lossReason.tenantId !== tenantId || lossReason.kind !== 'lossReason') {
      return { error: 'Loss reason not found' };
    }
  }

  if (body.winReasonId) {
    const winReason = await findFieldCatalogDefinitionById(body.winReasonId);
    if (!winReason || winReason.tenantId !== tenantId || winReason.kind !== 'winReason') {
      return { error: 'Win reason not found' };
    }
  }

  return null;
}

opportunitiesRouter.get('/api/opportunities', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const opportunities = await listOpportunities(user.tenantId!);
  return res.json(opportunities);
});

opportunitiesRouter.post('/api/opportunities', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (!req.body.name || !req.body.companyId || !req.body.pipelineId) {
    return res.status(400).json({ error: 'name, companyId, and pipelineId are required' });
  }
  if (typeof req.body.amountCents !== 'number' || req.body.amountCents < 0) {
    return res.status(400).json({ error: 'amountCents must be a non-negative number' });
  }
  if (!req.body.currency || typeof req.body.currency !== 'string') {
    return res.status(400).json({ error: 'currency is required' });
  }

  // Blank means "let assignment automation decide" — only a real value goes
  // through the owner-exists check inside validateOpportunityRefs.
  if (!req.body.ownerId) {
    req.body.ownerId = undefined;
  }

  const targetPipeline = await findPipelineById(req.body.pipelineId);
  if (!targetPipeline || targetPipeline.tenantId !== user.tenantId) {
    return res.status(400).json({ error: 'Pipeline not found' });
  }
  // ownerId is required only when this pipeline has no assignment automation
  // to fall back on (docs/tareas/specredisenosalesv2.md §3.8).
  if (!req.body.ownerId && !targetPipeline.assignmentMode) {
    return res.status(400).json({ error: 'ownerId is required' });
  }

  const refError = await validateOpportunityRefs(user.tenantId!, req.body, req.body.pipelineId);
  if (refError) {
    return res.status(400).json(refError);
  }

  const opportunity = await createOpportunity({ ...req.body, tenantId: user.tenantId! }, user.id);
  const full = await findOpportunityById(opportunity.id);
  return res.status(201).json(full);
});

opportunitiesRouter.get('/api/opportunities/:opportunityId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canViewHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const opportunity = await findOpportunityById(req.params.opportunityId);
  if (!opportunity || opportunity.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Opportunity not found' });
  }

  return res.json(opportunity);
});

opportunitiesRouter.patch('/api/opportunities/:opportunityId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const opportunity = await findOpportunityById(req.params.opportunityId);
  if (!opportunity || opportunity.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Opportunity not found' });
  }

  // A stray '' (vs. an intentional `null` to clear the owner) shouldn't be
  // treated as an explicit value.
  if (req.body.ownerId === '') {
    req.body.ownerId = undefined;
  }

  const refError = await validateOpportunityRefs(
    user.tenantId!,
    req.body,
    req.body.pipelineId || opportunity.pipelineId,
    opportunity.lossReasonId,
    opportunity.companyId,
    opportunity.winReasonId,
    opportunity.pipelineId,
  );
  if (refError) {
    return res.status(400).json(refError);
  }

  const updated = await updateOpportunity(req.params.opportunityId, user.tenantId!, {
    ...req.body,
    changedByUserId: user.id,
  });
  const full = await findOpportunityById(updated.id);
  return res.json(full);
});

opportunitiesRouter.delete('/api/opportunities/:opportunityId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const opportunity = await findOpportunityById(req.params.opportunityId);
  if (!opportunity || opportunity.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Opportunity not found' });
  }

  await deleteOpportunity(req.params.opportunityId, user.id);
  return res.status(204).end();
});

opportunitiesRouter.post('/api/opportunities/:opportunityId/contacts', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const opportunity = await findOpportunityById(req.params.opportunityId);
  if (!opportunity || opportunity.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Opportunity not found' });
  }

  const contact = await findContactById(req.body.contactId);
  if (!contact || contact.tenantId !== user.tenantId) {
    return res.status(400).json({ error: 'Contact not found' });
  }
  if (!contact.isActive) {
    return res.status(400).json({ error: 'Cannot link a deactivated contact' });
  }

  const link = await addOpportunityContact(user.tenantId!, req.params.opportunityId, req.body.contactId, req.body.role);
  return res.status(201).json(link);
});

opportunitiesRouter.delete('/api/opportunities/:opportunityId/contacts/:contactId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canCreateHr(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const opportunity = await findOpportunityById(req.params.opportunityId);
  if (!opportunity || opportunity.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Opportunity not found' });
  }

  await removeOpportunityContact(req.params.opportunityId, req.params.contactId);
  return res.status(204).end();
});

opportunitiesRouter.get('/api/opportunities/:opportunityId/stage-history', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const opportunity = await findOpportunityById(req.params.opportunityId);
  if (!opportunity || opportunity.tenantId !== user.tenantId) {
    return res.status(404).json({ error: 'Opportunity not found' });
  }

  const history = await listOpportunityStageHistory(user.tenantId!, req.params.opportunityId);
  return res.json(history);
});
