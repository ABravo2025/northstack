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
import { findPipelineById, findPipelineStageById } from '../modules/crm/pipelineService.js';
import { findFieldCatalogDefinitionById } from '../modules/hr/fieldCatalogService.js';
import { findUserById } from '../modules/tenant/tenantService.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

export const opportunitiesRouter = createAsyncRouter();

// Shared validation for create/update: every FK referenced in the body has to
// belong to this tenant (directive: validate any id referenced in the body,
// not just the URL param), the pipeline has to be active (archived pipelines
// are read-only — "no editables hasta desarchivar"), the stage has to belong
// to that pipeline, and a `lost`-outcome stage requires a lossReasonId.
async function validateOpportunityRefs(
  tenantId: string,
  body: any,
  pipelineId: string,
  existingLossReasonId?: string | null,
): Promise<{ error: string } | null> {
  const pipeline = await findPipelineById(pipelineId);
  if (!pipeline || pipeline.tenantId !== tenantId) {
    return { error: 'Pipeline not found' };
  }
  if (!pipeline.isActive) {
    return { error: 'Cannot create or edit an Opportunity in an archived pipeline' };
  }

  if (body.companyId !== undefined) {
    const company = await findCompanyById(body.companyId);
    if (!company || company.tenantId !== tenantId) {
      return { error: 'Company not found' };
    }
  }

  if (body.ownerId !== undefined) {
    const owner = await findUserById(body.ownerId);
    if (!owner || owner.tenantId !== tenantId) {
      return { error: 'Owner not found' };
    }
  }

  let resolvedLossReasonId = body.lossReasonId !== undefined ? body.lossReasonId : existingLossReasonId;

  if (body.stageId !== undefined) {
    const stage = await findPipelineStageById(body.stageId);
    if (!stage || stage.tenantId !== tenantId || stage.pipelineId !== pipelineId) {
      return { error: 'Stage not found' };
    }
    if (stage.outcome === 'lost' && !resolvedLossReasonId) {
      return { error: 'A loss reason is required when moving an Opportunity to a Lost stage' };
    }
  }

  if (body.lossReasonId) {
    const lossReason = await findFieldCatalogDefinitionById(body.lossReasonId);
    if (!lossReason || lossReason.tenantId !== tenantId || lossReason.kind !== 'lossReason') {
      return { error: 'Loss reason not found' };
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

  if (!req.body.name || !req.body.companyId || !req.body.pipelineId || !req.body.ownerId) {
    return res.status(400).json({ error: 'name, companyId, pipelineId, and ownerId are required' });
  }
  if (typeof req.body.amountCents !== 'number' || req.body.amountCents < 0) {
    return res.status(400).json({ error: 'amountCents must be a non-negative number' });
  }
  if (!req.body.currency || typeof req.body.currency !== 'string') {
    return res.status(400).json({ error: 'currency is required' });
  }

  const refError = await validateOpportunityRefs(user.tenantId!, req.body, req.body.pipelineId);
  if (refError) {
    return res.status(400).json(refError);
  }

  const opportunity = await createOpportunity({ ...req.body, tenantId: user.tenantId! });
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

  const refError = await validateOpportunityRefs(user.tenantId!, req.body, opportunity.pipelineId, opportunity.lossReasonId);
  if (refError) {
    return res.status(400).json(refError);
  }

  const updated = await updateOpportunity(req.params.opportunityId, user.tenantId!, req.body);
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

  await deleteOpportunity(req.params.opportunityId);
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
