import { sanitizeUser } from '../modules/auth/authService.js';
import { canInviteUsers, canManageUsers } from '../modules/auth/permissionService.js';
import {
  acceptInvitation,
  cancelInvitation,
  createInvitation,
  createTenantForUser,
  findInvitationByToken,
  getTenantById,
  listTenantInvitations,
  listTenantUsers,
  registerTenantWithOwner,
  updateTenantCurrency,
  updateTenantUser,
} from '../modules/tenant/tenantService.js';
import { AUTH_RATE_LIMIT, isRateLimited } from '../lib/rateLimit.js';
import { authenticateUser, getClientIp, validateSession } from '../lib/httpAuth.js';
import { createAsyncRouter } from '../lib/asyncRouter.js';

const VALID_ACQUISITION_CHANNELS = ['organic', 'paid_ads', 'referral', 'content', 'outbound_sales', 'partnership', 'other'];

export const tenantsRouter = createAsyncRouter();

tenantsRouter.post('/api/tenants/register', async (req, res) => {
  if (isRateLimited(`tenant-register:${getClientIp(req)}`, AUTH_RATE_LIMIT)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

  if (req.body.acquisitionChannel !== undefined && !VALID_ACQUISITION_CHANNELS.includes(req.body.acquisitionChannel)) {
    return res.status(400).json({ error: 'Invalid acquisition channel', field: 'acquisitionChannel' });
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
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error, field: result.field });
  }

  return res
    .status(201)
    .json({ tenant: result.tenant, user: sanitizeUser(result.user!), session: result.session });
});

tenantsRouter.post('/api/tenants', async (req, res) => {
  const user = await authenticateUser(req, res);
  if (!user) {
    return;
  }

  const name = req.body.name as string;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Tenant name is required' });
  }

  const result = await createTenantForUser({
    userId: user.id,
    name: name.trim(),
  });

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(201).json({ tenant: result.tenant, user: sanitizeUser(result.user!) });
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

  if (user.role !== 'owner' && user.role !== 'admin') {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  if (typeof req.body.currency !== 'string') {
    return res.status(400).json({ error: 'currency is required' });
  }

  const result = await updateTenantCurrency(user.tenantId!, req.body.currency);
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

  if (!canManageUsers(user.role)) {
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

  if (!canManageUsers(user.role)) {
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

  if (!canManageUsers(user.role)) {
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

  if (!canManageUsers(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const result = await cancelInvitation(user.tenantId!, req.params.invitationId);
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

  if (!canInviteUsers(user.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const email = req.body.email as string;
  if (!email || !email.trim()) {
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
