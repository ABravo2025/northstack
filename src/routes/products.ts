import type express from 'express';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { canManageCompany, canManageCustomFields, canViewCompany } from '../modules/auth/permissionService.js';
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

// Clientes C4: the product catalog (Settings, same permission as pipelines) and each company's
// products (company permissions). Growth (clientsEnabled).
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
