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
import { getClientsDashboard, getSalesExtras } from '../modules/crm/clientsDashboardService.js';
import { getProfitability, type Money } from '../modules/crm/profitabilityService.js';
import { canManageExpenses, canManagePayments, canManagePayroll } from '../modules/auth/permissionService.js';
import { isExpensesAllowed, isPaymentsAllowed, isPayrollAllowed } from '../modules/tenant/planLimits.js';
import { isExpenseEncryptionConfigured } from '../lib/expenseEncryption.js';
import { getCompanyPaymentSummary } from '../modules/integrations/stripePaymentsService.js';
import prisma from '../lib/prisma.js';
import type { AuthenticatedUser } from '../modules/auth/authService.js';

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

// Clientes C9: Dashboards → Clientes, and the Sales additions (won by purpose, leads funnel).
// Shared Dashboards period + department of the owner.
function dashboardFilter(req: express.Request) {
  const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const today = new Date().toISOString().slice(0, 10);
  return {
    from: isDate(req.query.from) ? req.query.from : `${today.slice(0, 7)}-01`,
    to: isDate(req.query.to) ? req.query.to : today,
    departmentId: typeof req.query.departmentId === 'string' && req.query.departmentId ? req.query.departmentId : undefined,
  };
}

productsRouter.get('/api/dashboards/clients', async (req, res) => {
  const user = await guard(req, res, 'viewCompany');
  if (!user) return;
  return res.json(await getClientsDashboard(user.tenantId!, dashboardFilter(req)));
});

productsRouter.get('/api/dashboards/sales-extras', async (req, res) => {
  const user = await guard(req, res, 'viewCompany');
  if (!user) return;
  if (!canViewOpportunity(user.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  return res.json(await getSalesExtras(user.tenantId!, dashboardFilter(req)));
});

// Cruces D1: profitability per client. Each part only for whoever may see it — labor needs payroll,
// expenses need Gastos, Stripe revenue needs Payments (otherwise revenue is estimated from products).
function profitabilityAccess(user: AuthenticatedUser) {
  return {
    canSeeLabor: canManagePayroll(user.roleContext) && isPayrollAllowed(user.tenant),
    canSeeExpenses: canManageExpenses(user.roleContext) && isExpensesAllowed(user.tenant) && isExpenseEncryptionConfigured(),
    canSeePayments: canManagePayments(user.roleContext) && isPaymentsAllowed(user.tenant),
  };
}

function periodOf(req: express.Request) {
  const f = dashboardFilter(req);
  return { from: new Date(`${f.from}T00:00:00Z`), to: new Date(`${f.to}T23:59:59Z`), departmentId: f.departmentId };
}

productsRouter.get('/api/companies/:companyId/profitability', async (req, res) => {
  const user = await guard(req, res, 'viewCompany');
  if (!user) return;
  const company = await prisma.company.findFirst({ where: { id: req.params.companyId, tenantId: user.tenantId! }, select: { id: true, stripeCustomerId: true } });
  if (!company) return res.status(404).json({ error: 'Company not found' });
  const access = profitabilityAccess(user);
  const period = periodOf(req);
  let stripeRevenue: Map<string, Money> | undefined;
  if (access.canSeePayments && company.stripeCustomerId) {
    try {
      const summary = await getCompanyPaymentSummary(user.tenantId!, company, { since: period.from, until: period.to });
      if (summary.currency && summary.paymentsAmountCents) {
        stripeRevenue = new Map([[company.id, [{ currency: summary.currency.toUpperCase(), cents: summary.paymentsAmountCents - summary.refundsAmountCents }]]]);
      }
    } catch {
      // No Stripe connection, or it failed: fall back to the products estimate.
    }
  }
  const result = await getProfitability(user.tenantId!, [company.id], period, { ...access, stripeRevenue });
  return res.json({ ...result.get(company.id), access });
});

// The Clients dashboard's table: every client, revenue estimated from products (no Stripe call per
// company), by the account owner's department.
productsRouter.get('/api/dashboards/profitability', async (req, res) => {
  const user = await guard(req, res, 'viewCompany');
  if (!user) return;
  const access = profitabilityAccess(user);
  const period = periodOf(req);
  const [lines, won] = await Promise.all([
    prisma.companyProduct.findMany({ where: { tenantId: user.tenantId!, cancelledAt: null }, select: { companyId: true } }),
    prisma.opportunity.findMany({ where: { tenantId: user.tenantId!, isActive: true, stage: { outcome: 'won' } }, select: { companyId: true } }),
  ]);
  const ids = [...new Set([...lines.map((l) => l.companyId), ...won.map((w) => w.companyId)])];
  const companies = await prisma.company.findMany({ where: { tenantId: user.tenantId!, id: { in: ids } }, select: { id: true, name: true, accountOwnerId: true } });
  let scoped = companies;
  if (period.departmentId) {
    const employees = await prisma.employee.findMany({ where: { tenantId: user.tenantId!, userId: { not: null } }, select: { userId: true, departmentId: true } });
    const deptOf = new Map(employees.map((e) => [e.userId!, e.departmentId]));
    scoped = companies.filter((c) => (period.departmentId === 'none' ? !c.accountOwnerId || !deptOf.get(c.accountOwnerId) : c.accountOwnerId && deptOf.get(c.accountOwnerId) === period.departmentId));
  }
  const result = await getProfitability(user.tenantId!, scoped.map((c) => c.id), period, access);
  return res.json({
    access,
    rows: scoped.map((c) => ({ companyId: c.id, companyName: c.name, ...result.get(c.id)! })),
  });
});
