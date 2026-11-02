import type express from 'express';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { canManageContact, canViewContact } from '../modules/auth/permissionService.js';
import { isClientsAllowed } from '../modules/tenant/planLimits.js';
import {
  LeadError,
  addTouch,
  convertLead,
  createLead,
  disqualifyLead,
  getLead,
  listLeads,
  reopenLead,
  updateLead,
} from '../modules/crm/leadService.js';

// Clientes C2 (spec-clientes-gastos-formularios.md): the Leads inbox. Contacts' permissions
// (view_contact / manage_contact) and the Growth plan (clientsEnabled).
export const leadsRouter = createAsyncRouter();

async function guard(req: express.Request, res: express.Response, write: boolean) {
  const user = await validateSession(req, res);
  if (!user) return null;
  if (!(write ? canManageContact(user.roleContext) : canViewContact(user.roleContext))) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return null;
  }
  if (!isClientsAllowed(user.tenant)) {
    res.status(403).json({ error: 'The Leads inbox is part of the Growth plan', code: 'plan_required' });
    return null;
  }
  return user;
}

function fail(res: express.Response, error: unknown) {
  if (error instanceof LeadError) return res.status(error.status).json({ error: error.message, code: error.code });
  throw error;
}

leadsRouter.get('/api/leads', async (req, res) => {
  const user = await guard(req, res, false);
  if (!user) return;
  const view = req.query.view === 'converted' || req.query.view === 'disqualified' ? req.query.view : 'open';
  const ownerId = typeof req.query.ownerId === 'string' && req.query.ownerId ? req.query.ownerId : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  return res.json(await listLeads(user.tenantId!, { view, ownerId, q }));
});

leadsRouter.get('/api/leads/:id', async (req, res) => {
  const user = await guard(req, res, false);
  if (!user) return;
  try {
    return res.json(await getLead(user.tenantId!, req.params.id));
  } catch (error) {
    return fail(res, error);
  }
});

leadsRouter.post('/api/leads', async (req, res) => {
  const user = await guard(req, res, true);
  if (!user) return;
  try {
    return res.status(201).json(await createLead(user.tenantId!, user.id, req.body ?? {}));
  } catch (error) {
    return fail(res, error);
  }
});

leadsRouter.patch('/api/leads/:id', async (req, res) => {
  const user = await guard(req, res, true);
  if (!user) return;
  try {
    return res.json(await updateLead(user.tenantId!, req.params.id, req.body ?? {}));
  } catch (error) {
    return fail(res, error);
  }
});

leadsRouter.post('/api/leads/:id/touches', async (req, res) => {
  const user = await guard(req, res, true);
  if (!user) return;
  try {
    return res.status(201).json(
      await addTouch(user.tenantId!, user.id, req.params.id, {
        channel: String(req.body?.channel ?? ''),
        outcome: String(req.body?.outcome ?? ''),
        note: typeof req.body?.note === 'string' ? req.body.note : null,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
});

leadsRouter.post('/api/leads/:id/disqualify', async (req, res) => {
  const user = await guard(req, res, true);
  if (!user) return;
  try {
    return res.json(await disqualifyLead(user.tenantId!, req.params.id, typeof req.body?.reason === 'string' ? req.body.reason : ''));
  } catch (error) {
    return fail(res, error);
  }
});

leadsRouter.post('/api/leads/:id/reopen', async (req, res) => {
  const user = await guard(req, res, true);
  if (!user) return;
  try {
    return res.json(await reopenLead(user.tenantId!, req.params.id));
  } catch (error) {
    return fail(res, error);
  }
});

leadsRouter.post('/api/leads/:id/convert', async (req, res) => {
  const user = await guard(req, res, true);
  if (!user) return;
  const b = req.body ?? {};
  if (typeof b.pipelineId !== 'string' || !b.pipelineId) return res.status(400).json({ error: 'Choose a pipeline', code: 'pipeline_required' });
  try {
    return res.json(
      await convertLead(user.tenantId!, user.id, req.params.id, {
        companyId: typeof b.companyId === 'string' && b.companyId ? b.companyId : null,
        companyName: typeof b.companyName === 'string' ? b.companyName : null,
        pipelineId: b.pipelineId,
        stageId: typeof b.stageId === 'string' && b.stageId ? b.stageId : null,
        opportunityName: typeof b.opportunityName === 'string' ? b.opportunityName : null,
        amountCents: typeof b.amountCents === 'number' ? b.amountCents : null,
        ownerId: typeof b.ownerId === 'string' && b.ownerId ? b.ownerId : null,
      }),
    );
  } catch (error) {
    return fail(res, error);
  }
});
