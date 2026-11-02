import type express from 'express';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { canManageCompany, canManageCustomFields, canManageOpportunity, canViewCompany, canViewOpportunity } from '../modules/auth/permissionService.js';
import { isClientsAllowed } from '../modules/tenant/planLimits.js';
import {
  ProductError,
  addCompanyProduct,
  createProduct,
  getCompanyProducts,
  listProducts,
  updateCompanyProduct,
  updateProduct,
} from '../modules/crm/productService.js';
import { getCompanyOnboarding, getCompanyTimeline } from '../modules/crm/company360Service.js';
import { addCheckIn, getCompanyHealth } from '../modules/crm/healthService.js';
import { SignalError, createSignalOpportunity, getSignals } from '../modules/crm/signalService.js';

// Clientes C4/C5: the product catalog (Settings, same permission as pipelines), each company's
// products and its 360 view (company permissions). Growth (clientsEnabled).
export const productsRouter = createAsyncRouter();

type Need = 'catalog' | 'viewCompany' | 'manageCompany';

async function guard(req: express.Request, res: express.Response, need: Need) {
  const user = await validateSession(req, res);
  if (!user) return null;
  const ok =
    need === 'catalog' ? canManageCustomFields(user.roleContext) : need === 'viewCompany' ? canViewCompany(user.roleContext) : canManageCompany(user.roleContext);
  if (!ok) {
    res.status(403).json({ error: 'Insufficient permissions' });
    return null;
  }
  if (!isClientsAllowed(user.tenant)) {
    res.status(403).json({ error: 'The product catalog is part of the Growth plan', code: 'plan_required' });
    return null;
  }
  return user;
}

function fail(res: express.Response, error: unknown) {
  if (error instanceof ProductError) return res.status(error.status).json({ error: error.message, code: error.code });
  throw error;
}

// Anyone who can see companies can read the catalog (to pick products); editing it is Settings.
productsRouter.get('/api/products', async (req, res) => {
  const user = await guard(req, res, 'viewCompany');
  if (!user) return;
  return res.json(await listProducts(user.tenantId!));
});

productsRouter.post('/api/products', async (req, res) => {
  const user = await guard(req, res, 'catalog');
  if (!user) return;
  try {
    return res.status(201).json(await createProduct(user.tenantId!, req.body ?? {}));
  } catch (error) {
    return fail(res, error);
  }
});

productsRouter.patch('/api/products/:id', async (req, res) => {
  const user = await guard(req, res, 'catalog');
  if (!user) return;
  try {
    return res.json(await updateProduct(user.tenantId!, req.params.id, req.body ?? {}));
  } catch (error) {
    return fail(res, error);
  }
});

productsRouter.get('/api/companies/:companyId/products', async (req, res) => {
  const user = await guard(req, res, 'viewCompany');
  if (!user) return;
  try {
    return res.json(await getCompanyProducts(user.tenantId!, req.params.companyId));
  } catch (error) {
    return fail(res, error);
  }
});

productsRouter.post('/api/companies/:companyId/products', async (req, res) => {
  const user = await guard(req, res, 'manageCompany');
  if (!user) return;
  try {
    return res.status(201).json(await addCompanyProduct(user.tenantId!, req.params.companyId, req.body ?? {}));
  } catch (error) {
    return fail(res, error);
  }
});

productsRouter.patch('/api/companies/:companyId/products/:lineId', async (req, res) => {
  const user = await guard(req, res, 'manageCompany');
  if (!user) return;
  try {
    return res.json(await updateCompanyProduct(user.tenantId!, req.params.companyId, req.params.lineId, req.body ?? {}));
  } catch (error) {
    return fail(res, error);
  }
});

// Clientes C5: the company 360 view — timeline and onboarding.
productsRouter.get('/api/companies/:companyId/timeline', async (req, res) => {
  const user = await guard(req, res, 'viewCompany');
  if (!user) return;
  const events = await getCompanyTimeline(user.tenantId!, req.params.companyId, { canViewOpportunities: canViewOpportunity(user.roleContext) });
  if (!events) return res.status(404).json({ error: 'Company not found' });
  return res.json(events);
});

productsRouter.get('/api/companies/:companyId/onboarding', async (req, res) => {
  const user = await guard(req, res, 'viewCompany');
  if (!user) return;
  const projects = await getCompanyOnboarding(user.tenantId!, req.params.companyId);
  if (!projects) return res.status(404).json({ error: 'Company not found' });
  return res.json(projects);
});

// Clientes C6: health score with its breakdown, and check-ins.
productsRouter.get('/api/companies/:companyId/health', async (req, res) => {
  const user = await guard(req, res, 'viewCompany');
  if (!user) return;
  const health = await getCompanyHealth(user.tenantId!, req.params.companyId);
  if (!health) return res.status(404).json({ error: 'Company not found' });
  return res.json(health);
});

productsRouter.post('/api/companies/:companyId/check-ins', async (req, res) => {
  const user = await guard(req, res, 'manageCompany');
  if (!user) return;
  const result = await addCheckIn(user.tenantId!, user.id, req.params.companyId, {
    sentiment: String(req.body?.sentiment ?? ''),
    note: typeof req.body?.note === 'string' ? req.body.note : null,
    nextCheckInAt: typeof req.body?.nextCheckInAt === 'string' ? req.body.nextCheckInAt : null,
  });
  if ('error' in result) return res.status(result.status ?? 400).json({ error: result.error });
  return res.status(201).json(result.checkIn);
});

// Clientes C8: upsell / renewal / risk signals across clients, and the opportunity from one.
productsRouter.get('/api/client-signals', async (req, res) => {
  const user = await guard(req, res, 'viewCompany');
  if (!user) return;
  return res.json(await getSignals(user.tenantId!));
});

productsRouter.post('/api/client-signals/opportunity', async (req, res) => {
  const user = await guard(req, res, 'viewCompany');
  if (!user) return;
  if (!canManageOpportunity(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const b = req.body ?? {};
  if (typeof b.companyId !== 'string' || (b.kind !== 'expansion' && b.kind !== 'renewal')) {
    return res.status(400).json({ error: 'companyId and kind (expansion | renewal) are required' });
  }
  try {
    const productIds = Array.isArray(b.productIds) ? b.productIds.filter((x: unknown): x is string => typeof x === 'string').slice(0, 20) : [];
    return res.status(201).json(await createSignalOpportunity(user.tenantId!, user.id, { companyId: b.companyId, kind: b.kind, productIds }));
  } catch (error) {
    if (error instanceof SignalError) return res.status(error.status).json({ error: error.message, code: error.code });
    throw error;
  }
});
