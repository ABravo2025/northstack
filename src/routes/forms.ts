import type express from 'express';
import type { FormKind, FormModule } from '@prisma/client';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { canManageCustomFields } from '../modules/auth/permissionService.js';
import { isFormsAllowed } from '../modules/tenant/planLimits.js';
import { isFormsEncryptionConfigured } from '../lib/formsEncryption.js';
import { FormError, createForm, deleteForm, getForm, getFormsMeta, listForms, updateForm } from '../modules/forms/formService.js';
import { getResponse, listResponses } from '../modules/forms/formResponseService.js';
import { listCandidates, listInvites, sendInvites } from '../modules/forms/formInviteService.js';
import { getFormsDashboard } from '../modules/forms/formDashboardService.js';

// Formularios y encuestas (spec-clientes-gastos-formularios.md, B2): the builder and the responses
// inbox. Same permission the public forms already used (manage_custom_fields), Growth-only, and the
// response routes answer 503 until FORMS_DATA_ENCRYPTION_KEY is set.
export const formsRouter = createAsyncRouter();

async function guard(req: express.Request, res: express.Response, opts: { needsKey?: boolean } = {}) {
  const user = await validateSession(req, res);
  if (!user) return null;
  if (!canManageCustomFields(user.roleContext)) {
    res.status(403).json({ error: 'You do not have permission to manage forms' });
    return null;
  }
  if (!isFormsAllowed(user.tenant)) {
    res.status(403).json({ error: 'Forms and surveys are part of the Growth plan', code: 'plan_required' });
    return null;
  }
  if (opts.needsKey && !isFormsEncryptionConfigured()) {
    res.status(503).json({ error: 'Forms are not configured on this server yet', code: 'forms_not_configured' });
    return null;
  }
  return user;
}

function fail(res: express.Response, error: unknown) {
  if (error instanceof FormError) return res.status(error.status).json({ error: error.message, code: error.code });
  throw error;
}

const KINDS: FormKind[] = ['form', 'survey'];
const MODULES: FormModule[] = ['leads', 'clients', 'employees', 'support', 'projects', 'none'];

formsRouter.get('/api/forms/meta', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  return res.json({ ...(await getFormsMeta(user.tenantId!)), encryptionConfigured: isFormsEncryptionConfigured() });
});

formsRouter.get('/api/forms', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const kind = KINDS.includes(req.query.kind as FormKind) ? (req.query.kind as FormKind) : undefined;
  const module = MODULES.includes(req.query.module as FormModule) ? (req.query.module as FormModule) : undefined;
  return res.json(await listForms(user.tenantId!, { kind, module }));
});

// Dashboards → Encuestas (B6). Registered before /api/forms/:id. Scores only, nothing decrypted.
formsRouter.get('/api/forms/dashboard', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const today = new Date().toISOString().slice(0, 10);
  const from = isDate(req.query.from) ? req.query.from : `${today.slice(0, 7)}-01`;
  const to = isDate(req.query.to) ? req.query.to : today;
  const departmentId = typeof req.query.departmentId === 'string' && req.query.departmentId ? req.query.departmentId : undefined;
  return res.json(await getFormsDashboard(user.tenantId!, { from, to, departmentId }));
});

formsRouter.get('/api/forms/responses', async (req, res) => {
  const user = await guard(req, res, { needsKey: true });
  if (!user) return;
  const formId = typeof req.query.formId === 'string' && req.query.formId ? req.query.formId : undefined;
  return res.json(await listResponses(user.tenantId!, { formId }));
});

formsRouter.get('/api/forms/responses/:id', async (req, res) => {
  const user = await guard(req, res, { needsKey: true });
  if (!user) return;
  try {
    return res.json(await getResponse(user.tenantId!, req.params.id));
  } catch (error) {
    return fail(res, error);
  }
});

formsRouter.get('/api/forms/:id', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  try {
    return res.json(await getForm(user.tenantId!, req.params.id));
  } catch (error) {
    return fail(res, error);
  }
});

formsRouter.post('/api/forms', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  try {
    return res.status(201).json(await createForm(user.tenantId!, req.body ?? {}));
  } catch (error) {
    return fail(res, error);
  }
});

formsRouter.patch('/api/forms/:id', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  try {
    return res.json(await updateForm(user.tenantId!, req.params.id, req.body ?? {}));
  } catch (error) {
    return fail(res, error);
  }
});

formsRouter.delete('/api/forms/:id', async (req, res) => {
  const user = await guard(req, res);
  if (!user) return;
  try {
    await deleteForm(user.tenantId!, req.params.id);
    return res.status(204).end();
  } catch (error) {
    return fail(res, error);
  }
});

// --- Personal links (B4) ---

formsRouter.get('/api/forms/:id/candidates', async (req, res) => {
  const user = await guard(req, res, { needsKey: true });
  if (!user) return;
  try {
    return res.json(await listCandidates(user.tenantId!, req.params.id, typeof req.query.q === 'string' ? req.query.q : undefined));
  } catch (error) {
    return fail(res, error);
  }
});

formsRouter.get('/api/forms/:id/invites', async (req, res) => {
  const user = await guard(req, res, { needsKey: true });
  if (!user) return;
  try {
    return res.json(await listInvites(user.tenantId!, req.params.id));
  } catch (error) {
    return fail(res, error);
  }
});

formsRouter.post('/api/forms/:id/invites', async (req, res) => {
  const user = await guard(req, res, { needsKey: true });
  if (!user) return;
  const ids = Array.isArray(req.body?.recipientIds) ? req.body.recipientIds.filter((v: unknown): v is string => typeof v === 'string') : [];
  if (!ids.length) return res.status(400).json({ error: 'Choose who to send it to', code: 'no_recipients' });
  try {
    return res.json(await sendInvites(user.tenantId!, req.params.id, { recipientIds: ids, createdById: user.id }));
  } catch (error) {
    return fail(res, error);
  }
});
