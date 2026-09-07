import prisma from '../lib/prisma.js';
import { validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { canManageBilling } from '../modules/auth/permissionService.js';
import { startCheckout } from '../modules/tenant/checkoutService.js';
import { getBillingSummary, getInvoiceDocumentUrl } from '../modules/tenant/subscriptionService.js';
import { changePlan, requestCancellation, resumeSubscription } from '../modules/tenant/subscriptionSelfServeService.js';
import type { PlanTier } from '@prisma/client';

export const subscriptionsRouter = createAsyncRouter();

// Read-only — any authenticated tenant member, same bar as GET /api/tenants/current. BillingPage
// (Etapa E) reads from this; not in the original task-breakdown (units 1-15 are all writes).
subscriptionsRouter.get('/api/subscriptions/me', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const subscription = await getBillingSummary(user.tenantId!);
  if (!subscription) {
    return res.status(404).json({ error: 'No subscription found for this tenant' });
  }

  return res.json({ subscription });
});

// Read-only, same bar as GET /api/subscriptions/me above — the actual PDF document Paddle
// generates for an Invoice row (per Alejandro's request, 2026-08-19). Paddle-only.
subscriptionsRouter.get('/api/subscriptions/me/invoices/:invoiceId/document', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
  const result = await getInvoiceDocumentUrl(user.tenantId!, req.params.invoiceId, disposition);
  if (!result.success) {
    return res.status(404).json({ error: result.error });
  }

  return res.json({ url: result.url });
});

// Owner-only, same bar as PATCH /api/tenants/me/plan and the self-serve endpoints in Etapa D
// (change-plan/cancel/resume) — adding a payment method is at least as sensitive as those.
subscriptionsRouter.post('/api/subscriptions/me/checkout', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageBilling(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId! },
    select: { id: true, country: true, trialEndsAt: true },
  });
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  const result = await startCheckout(tenant, { id: user.id, email: user.email });
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({
    provider: result.provider,
    initPoint: result.initPoint,
    paddleTransactionId: result.paddleTransactionId,
  });
});

// Self-serve (task-breakdown Unidad 13-15) — all three owner-only, same bar as the checkout
// endpoint above and PATCH /api/tenants/me/plan.
subscriptionsRouter.post('/api/subscriptions/me/change-plan', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManageBilling(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const plan = req.body.plan as PlanTier | undefined;
  if (!plan) {
    return res.status(400).json({ error: 'plan is required', field: 'plan' });
  }

  const result = await changePlan(user.tenantId!, plan, user.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({ success: true });
});

subscriptionsRouter.post('/api/subscriptions/me/cancel', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManageBilling(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const reason = typeof req.body.reason === 'string' ? req.body.reason : undefined;
  const result = await requestCancellation(user.tenantId!, reason, user.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({ success: true });
});

subscriptionsRouter.post('/api/subscriptions/me/resume', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }
  if (!canManageBilling(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await resumeSubscription(user.tenantId!, user.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({ success: true });
});
