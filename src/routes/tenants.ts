import { sanitizeUser } from '../modules/auth/authService.js';
import { canInviteUsers, canManageBilling, canManageTenantSettings, canManageUsers } from '../modules/auth/permissionService.js';
import { getTenantById, registerTenantWithOwner, updateTenantCurrency } from '../modules/tenant/tenantService.js';
import { startSignupVerification, verifySignupToken } from '../modules/tenant/emailVerificationService.js';
import { CURRENT_PLAN_PRICES_CENTS, updateTenantPlan } from '../modules/tenant/planService.js';
import {
  acceptInvitation,
  cancelInvitation,
  createInvitation,
  findInvitationByToken,
  listTenantInvitations,
} from '../modules/tenant/invitationService.js';
import { listTenantUsers, updateTenantUser } from '../modules/tenant/tenantUserService.js';
import { AUTH_RATE_LIMIT, isRateLimited } from '../lib/rateLimit.js';
import { authenticateUser, getClientIp, validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import type { PlanTier } from '@prisma/client';
import type express from 'express';

const VALID_ACQUISITION_CHANNELS = ['organic', 'paid_ads', 'referral', 'content', 'outbound_sales', 'partnership', 'other'];
const VALID_JOB_FUNCTIONS = ['founder_ceo', 'hr', 'ops_finance', 'sales', 'other'];

export const tenantsRouter = createAsyncRouter();

// Tenant Signup — email verification (spec-tenant-signup.md). /start and /resend are
// functionally identical (same validation, same "invalidate the old link, send a new one"
// behavior in startSignupVerification) — kept as separate routes, each with its own rate-limit
// bucket, only so the frontend's cooldown timer and analytics can distinguish "first attempt"
// from "resend". One handler, parameterized by bucket, instead of two copies that could diverge.
const handleSignupEmailRequest = (bucketPrefix: string) => async (req: express.Request, res: express.Response) => {
  if (isRateLimited(`${bucketPrefix}:${getClientIp(req)}`, AUTH_RATE_LIMIT)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

  const email = req.body.email;
  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required', field: 'email' });
  }

  const result = await startSignupVerification(email);
  if (!result.success) {
    return res.status(400).json({ error: result.error, field: result.field });
  }

  return res.json({ message: 'Verification email sent.' });
};

tenantsRouter.post('/api/tenants/signup/start', handleSignupEmailRequest('signup-start'));
tenantsRouter.post('/api/tenants/signup/resend', handleSignupEmailRequest('signup-resend'));

tenantsRouter.get('/api/tenants/signup/verify/:token', async (req, res) => {
  const result = await verifySignupToken(req.params.token);
  if (!result.success) {
    return res.status(result.status ?? 400).json({ error: result.error });
  }
  return res.json({ email: result.email });
});

tenantsRouter.post('/api/tenants/register', async (req, res) => {
  if (isRateLimited(`tenant-register:${getClientIp(req)}`, AUTH_RATE_LIMIT)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

  if (req.body.acquisitionChannel !== undefined && !VALID_ACQUISITION_CHANNELS.includes(req.body.acquisitionChannel)) {
    return res.status(400).json({ error: 'Invalid acquisition channel', field: 'acquisitionChannel' });
  }

  if (req.body.jobFunction !== undefined && req.body.jobFunction !== null && !VALID_JOB_FUNCTIONS.includes(req.body.jobFunction)) {
    return res.status(400).json({ error: 'Invalid job function', field: 'jobFunction' });
  }

  if (typeof req.body.verificationToken !== 'string' || !req.body.verificationToken.trim()) {
    return res.status(400).json({ error: 'Email verification is required', field: 'verificationToken' });
  }

  const result = await registerTenantWithOwner({
    tenantName: req.body.tenantName,
    ownerFirstName: req.body.ownerFirstName,
    ownerLastName: req.body.ownerLastName,
    ownerEmail: req.body.ownerEmail,
    ownerPassword: req.body.ownerPassword,
    ownerPhone: req.body.ownerPhone,
    acceptedTerms: req.body.acceptedTerms,
    companySize: req.body.companySize,
    industry: req.body.industry,
    country: req.body.country,
    acquisitionChannel: req.body.acquisitionChannel,
    jobFunction: req.body.jobFunction || undefined,
    verificationToken: req.body.verificationToken,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error, field: result.field });
  }

  return res
    .status(201)
    .json({ tenant: result.tenant, user: sanitizeUser(result.user!), session: result.session });
});

// Public — just the current launch prices, so PlansModal.tsx (frontend) doesn't hardcode a
// second copy of the number planService.ts already calls authoritative ("when it's time to
// raise to the regular price, edit the numbers here"). No auth needed: not tenant-specific,
// and the modal renders before there's necessarily anything else useful to gate it behind.
tenantsRouter.get('/api/plans/prices', async (_req, res) => {
  return res.json({ prices: CURRENT_PLAN_PRICES_CENTS });
});

// Subscription Plans (spec-subscription-plans.md) — owner-only, same bar as Payroll's
// manage_payroll. Only starter/growth are selectable here; Scale has no self-serve checkout.
tenantsRouter.patch('/api/tenants/me/plan', async (req, res) => {
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

  const result = await updateTenantPlan(user.tenantId!, plan, user.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error, field: 'plan' });
  }

  return res.json({ tenant: result.tenant });
});

tenantsRouter.get('/api/tenants/current', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  const tenant = await getTenantById(user.tenantId!);
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  return res.json({ tenant });
});

tenantsRouter.patch('/api/tenants/current', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageTenantSettings(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (typeof req.body.currency !== 'string') {
    return res.status(400).json({ error: 'currency is required' });
  }

  const result = await updateTenantCurrency(user.tenantId!, req.body.currency, user.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({ tenant: result.tenant });
});

tenantsRouter.get('/api/tenants/users', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageUsers(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const users = await listTenantUsers(user.tenantId!);
  return res.json(users);
});

tenantsRouter.patch('/api/tenants/users/:userId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageUsers(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await updateTenantUser(user.tenantId!, req.params.userId, user, {
    role: req.body.role,
    status: req.body.status,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.json({ user: sanitizeUser(result.user!) });
});

tenantsRouter.get('/api/tenants/invitations', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageUsers(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const invitations = await listTenantInvitations(user.tenantId!);
  return res.json(invitations);
});

tenantsRouter.delete('/api/tenants/invitations/:invitationId', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canManageUsers(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await cancelInvitation(user.tenantId!, req.params.invitationId, user.id);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(204).end();
});

tenantsRouter.post('/api/tenants/invitations', async (req, res) => {
  const user = await validateSession(req, res);
  if (!user) {
    return;
  }

  if (!canInviteUsers(user.roleContext)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const email = req.body.email;
  if (typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const result = await createInvitation({
    tenantId: user.tenantId!,
    invitedByUserId: user.id,
    email: email.trim(),
    role: req.body.role,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json({ invitation: result.invitation });
});

tenantsRouter.get('/api/invitations/:token', async (req, res) => {
  const invitation = await findInvitationByToken(req.params.token);
  if (!invitation) {
    return res.status(404).json({ error: 'Invitation not found' });
  }

  return res.json(invitation);
});

tenantsRouter.post('/api/invitations/:token/accept', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) {
    return;
  }

  const result = await acceptInvitation({
    token: req.params.token,
    userId: user.id,
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(200).json({ tenant: result.tenant, user: sanitizeUser(result.user!) });
});
