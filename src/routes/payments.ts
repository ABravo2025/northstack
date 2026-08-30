import { createAsyncRouter } from '../lib/asyncRouter.js';
import { validateSession } from '../lib/httpAuth.js';
import { requirePaymentsAccess as requirePaymentsAccessBase, type SessionUser } from '../lib/paymentsAccess.js';
import { findCompanyById } from '../modules/crm/companyService.js';
import {
  getCompanyPaymentEvents,
  getCompanyPaymentSummary,
  getPaymentsOverview,
  linkCompanyToStripeCustomer,
  searchStripeCustomersForCompany,
  StripeCustomerConflictError,
} from '../modules/integrations/stripePaymentsService.js';

export const paymentsRouter = createAsyncRouter();

function requirePaymentsAccess(user: SessionUser, res: import('express').Response): boolean {
  return requirePaymentsAccessBase(user, res, 'Only the workspace owner can view payments.');
}

// Same ownership pattern as routes/companies.ts — 404 (not 403) on a tenant mismatch, so a
// request for another tenant's Company id doesn't confirm it exists.
async function loadOwnedCompany(companyId: string, tenantId: string) {
  const company = await findCompanyById(companyId);
  if (!company || company.tenantId !== tenantId) {
    return null;
  }
  return company;
}

paymentsRouter.post('/api/payments/companies/:companyId/stripe-lookup', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requirePaymentsAccess(user, res)) return;

  const company = await loadOwnedCompany(req.params.companyId, user.tenantId!);
  if (!company) {
    return res.status(404).json({ error: 'Company not found' });
  }

  try {
    const matches = await searchStripeCustomersForCompany(user.tenantId!, company.id);
    return res.json({ matches });
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

paymentsRouter.post('/api/payments/companies/:companyId/stripe-link', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requirePaymentsAccess(user, res)) return;

  const company = await loadOwnedCompany(req.params.companyId, user.tenantId!);
  if (!company) {
    return res.status(404).json({ error: 'Company not found' });
  }

  const stripeCustomerId = typeof req.body?.stripeCustomerId === 'string' ? req.body.stripeCustomerId.trim() : '';
  const matchedViaEmail = typeof req.body?.matchedViaEmail === 'string' ? req.body.matchedViaEmail.trim() : '';
  if (!stripeCustomerId || !matchedViaEmail) {
    return res.status(400).json({ error: 'stripeCustomerId and matchedViaEmail are required' });
  }

  // Pedir confirmación explícita antes de sobreescribir un vínculo existente (spec Unit 2) —
  // 409 en vez de aplicar el cambio, el frontend reintenta con confirmOverwrite: true.
  if (company.stripeCustomerId && company.stripeCustomerId !== stripeCustomerId && req.body?.confirmOverwrite !== true) {
    return res.status(409).json({ error: 'already_linked', currentStripeCustomerId: company.stripeCustomerId });
  }

  try {
    const updated = await linkCompanyToStripeCustomer({
      tenantId: user.tenantId!,
      companyId: company.id,
      stripeCustomerId,
      matchedViaEmail,
    });
    return res.json({
      id: updated.id,
      stripeCustomerId: updated.stripeCustomerId,
      stripeCustomerMatchedVia: updated.stripeCustomerMatchedVia,
    });
  } catch (error) {
    if (error instanceof StripeCustomerConflictError) {
      return res.status(409).json({ error: 'customer_already_linked_elsewhere', message: error.message });
    }
    return res.status(400).json({ error: (error as Error).message });
  }
});

paymentsRouter.get('/api/payments/companies/:companyId/summary', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requirePaymentsAccess(user, res)) return;

  const company = await loadOwnedCompany(req.params.companyId, user.tenantId!);
  if (!company) {
    return res.status(404).json({ error: 'Company not found' });
  }

  try {
    const summary = await getCompanyPaymentSummary(user.tenantId!, company);
    return res.json(summary);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

paymentsRouter.get('/api/payments/companies/:companyId/events', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requirePaymentsAccess(user, res)) return;

  const company = await loadOwnedCompany(req.params.companyId, user.tenantId!);
  if (!company) {
    return res.status(404).json({ error: 'Company not found' });
  }

  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  try {
    const page = await getCompanyPaymentEvents(user.tenantId!, company, cursor);
    return res.json(page);
  } catch (error) {
    return res.status(400).json({ error: (error as Error).message });
  }
});

paymentsRouter.get('/api/payments/overview', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) return;
  if (!requirePaymentsAccess(user, res)) return;

  const overview = await getPaymentsOverview(user.tenantId!);
  return res.json(overview);
});
