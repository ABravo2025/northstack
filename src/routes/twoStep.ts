import type { Request, Response } from 'express';
import type { User } from '@prisma/client';
import { createAsyncRouter } from '../lib/asyncRouter.js';
import { authenticateUser, getClientIp, validateSession } from '../lib/httpAuth.js';
import { AUTH_RATE_LIMIT, isRateLimited } from '../lib/rateLimit.js';
import prisma from '../lib/prisma.js';
import { sendTwoStepNoticeEmail, type TwoStepNoticeKind } from '../lib/mailer.js';
import { createSession, sanitizeUser } from '../modules/auth/authService.js';
import { canManageUsers } from '../modules/auth/permissionService.js';
import { resolveRoleContextForUser } from '../modules/auth/roleService.js';
import {
  checkCode,
  confirmSetup,
  disable,
  endChallenge,
  forgetDevices,
  mfaStatus,
  regenerateRecoveryCodes,
  resetForUser,
  startSetup,
  trustDevice,
  useChallenge,
} from '../modules/auth/mfaService.js';

// Two-step verification (spec-2fa.md): the second login step, the person's own settings, and the
// reset by a tenant admin (manage_users). Staff reset it from the Admin (routes/platform.ts).
export const twoStepRouter = createAsyncRouter();

const INVALID_STEP = 'This sign-in took too long or had too many tries. Sign in again.';

async function notify(user: User, kind: TwoStepNoticeKind) {
  await sendTwoStepNoticeEmail({ to: user.email, locale: user.locale, firstName: user.firstName, kind });
}

async function limited(req: Request, res: Response): Promise<boolean> {
  if (await isRateLimited(`2fa:${getClientIp(req)}`, AUTH_RATE_LIMIT)) {
    res.status(429).json({ error: 'Too many attempts. Please try again later.' });
    return true;
  }
  return false;
}

// ---- login, second step ------------------------------------------------------------------------

// { mfaToken, code, rememberDevice } → the session (and a device token to keep, if asked).
twoStepRouter.post('/api/auth/login/2fa', async (req, res) => {
  if (await limited(req, res)) return;
  const challenge = await useChallenge(req.body?.mfaToken, 'verify');
  if (!challenge) return res.status(401).json({ error: INVALID_STEP, code: 'mfa_expired' });
  const used = await checkCode(challenge.user, req.body?.code);
  if (!used) return res.status(400).json({ error: 'That code isn’t right', code: 'bad_code' });
  await endChallenge(challenge.id);
  if (used === 'recovery') await notify(challenge.user, 'recoveryUsed');
  const session = await createSession(challenge.userId);
  const deviceToken = req.body?.rememberDevice === true ? await trustDevice(challenge.userId, req.get('user-agent') ?? null) : null;
  return res.json({ user: sanitizeUser(challenge.user), session, deviceToken, usedRecoveryCode: used === 'recovery' });
});

// Required but not set up yet: the secret to scan…
twoStepRouter.post('/api/auth/login/2fa/setup', async (req, res) => {
  if (await limited(req, res)) return;
  const challenge = await useChallenge(req.body?.mfaToken, 'enroll');
  if (!challenge) return res.status(401).json({ error: INVALID_STEP, code: 'mfa_expired' });
  const r = await startSetup(challenge.user);
  if (!r.success) return res.status(409).json({ error: r.error, code: r.code });
  return res.json(r.value);
});

// …then the first code: it's on, recovery codes (shown once) and the session.
twoStepRouter.post('/api/auth/login/2fa/confirm', async (req, res) => {
  if (await limited(req, res)) return;
  const challenge = await useChallenge(req.body?.mfaToken, 'enroll');
  if (!challenge) return res.status(401).json({ error: INVALID_STEP, code: 'mfa_expired' });
  const r = await confirmSetup(challenge.user, req.body?.code);
  if (!r.success) return res.status(400).json({ error: r.error, code: r.code });
  await endChallenge(challenge.id);
  await notify(challenge.user, 'enabled');
  const session = await createSession(challenge.userId);
  return res.json({ user: sanitizeUser(challenge.user), session, recoveryCodes: r.value.recoveryCodes });
});

// ---- the person's own settings (Settings → Profile) --------------------------------------------

async function me(req: Request, res: Response) {
  const user = await authenticateUser(req, res);
  if (!user) return null;
  if (user.support) {
    res.status(403).json({ error: 'Not available in a support session' });
    return null;
  }
  return user;
}

twoStepRouter.get('/api/users/me/2fa', async (req, res) => {
  const user = await me(req, res);
  if (!user) return;
  return res.json(await mfaStatus(user));
});

twoStepRouter.post('/api/users/me/2fa/setup', async (req, res) => {
  const user = await me(req, res);
  if (!user) return;
  const r = await startSetup(user);
  if (!r.success) return res.status(409).json({ error: r.error, code: r.code });
  return res.json(r.value);
});

twoStepRouter.post('/api/users/me/2fa/enable', async (req, res) => {
  const user = await me(req, res);
  if (!user) return;
  if (await limited(req, res)) return;
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const r = await confirmSetup(fresh, req.body?.code);
  if (!r.success) return res.status(400).json({ error: r.error, code: r.code });
  await notify(fresh, 'enabled');
  return res.json(r.value);
});

twoStepRouter.post('/api/users/me/2fa/disable', async (req, res) => {
  const user = await me(req, res);
  if (!user) return;
  if (await limited(req, res)) return;
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const r = await disable(fresh, req.body?.code);
  if (!r.success) return res.status(r.code === 'required' ? 409 : 400).json({ error: r.error, code: r.code });
  await notify(fresh, 'disabled');
  return res.json({ ok: true });
});

twoStepRouter.post('/api/users/me/2fa/recovery-codes', async (req, res) => {
  const user = await me(req, res);
  if (!user) return;
  if (await limited(req, res)) return;
  const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const r = await regenerateRecoveryCodes(fresh, req.body?.code);
  if (!r.success) return res.status(400).json({ error: r.error, code: r.code });
  await notify(fresh, 'recoveryRegenerated');
  return res.json(r.value);
});

twoStepRouter.delete('/api/users/me/2fa/devices', async (req, res) => {
  const user = await me(req, res);
  if (!user) return;
  await forgetDevices(user.id);
  return res.json({ ok: true });
});

// ---- reset by someone else ---------------------------------------------------------------------

// A tenant admin (manage_users) for someone in their company. The account owner's can only be
// reset by Northstack staff from the Admin (adminActionService.resetTwoStep, audited), so an admin
// can't take over the owner's account.
twoStepRouter.post('/api/tenants/users/:userId/2fa/reset', async (req, res) => {
  const actor = await validateSession(req, res);
  if (!actor) return;
  if (!canManageUsers(actor.roleContext)) return res.status(403).json({ error: 'Insufficient permissions' });
  const target = await prisma.user.findFirst({ where: { id: String(req.params.userId), tenantId: actor.tenantId! } });
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === actor.id) return res.status(400).json({ error: 'Use your own profile settings instead' });
  const targetRole = await resolveRoleContextForUser(target);
  if (targetRole.isOwner) return res.status(403).json({ error: 'Only Northstack support can reset the account owner’s two-step verification', code: 'owner' });
  await resetForUser(target, actor.id);
  await notify(target, 'reset');
  return res.json({ ok: true });
});
