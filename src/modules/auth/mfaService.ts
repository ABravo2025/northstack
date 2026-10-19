import { randomBytes } from 'node:crypto';
import type { User } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { decryptMfaSecret, encryptMfaSecret, isMfaEncryptionConfigured } from '../../lib/mfaEncryption.js';
import { recordActivity } from '../activity/activityLogService.js';
import { userActivityFieldConfig, userDisplayName } from '../activity/fieldConfigs/userFieldConfig.js';
import { resolveRoleContextForUser, type RoleContext } from './roleService.js';
import { generateRecoveryCodes, generateSecret, hashToken, normalizeRecoveryCode, otpauthUrl, verifyTotp } from './totp.js';

// Two-step verification (spec-2fa.md). Authenticator-app codes + one-time recovery codes.
// Required (§0.1) for the account owner, anyone with manage_billing or manage_payments, and
// Northstack staff; optional for everyone else.

const CHALLENGE_MINUTES = 5;
const CHALLENGE_MAX_ATTEMPTS = 5;
const TRUSTED_DEVICE_DAYS = 30;

type Result<T> = { success: true; value: T } | { success: false; error: string; code?: string };

export function mfaRequiredFor(user: { platformRole: string | null }, role: Pick<RoleContext, 'isOwner' | 'permissions'> | null): boolean {
  if (user.platformRole) return true;
  if (!role) return false;
  return role.isOwner || role.permissions.has('manage_billing') || role.permissions.has('manage_payments');
}

// Without MFA_ENCRYPTION_KEY nobody can set it up, so nobody can be required to: logins keep
// working on an environment that doesn't have the key yet instead of locking owners out.
export async function isMfaRequired(user: Pick<User, 'platformRole' | 'roleId' | 'role' | 'tenantId'>): Promise<boolean> {
  if (!isMfaEncryptionConfigured()) return false;
  if (user.platformRole) return true;
  if (!user.tenantId) return false;
  return mfaRequiredFor(user, await resolveRoleContextForUser(user));
}

export const mfaEnabled = (user: Pick<User, 'totpEnabledAt'>) => !!user.totpEnabledAt;

async function logChange(user: User, actorUserId: string, from: string, to: string) {
  if (!user.tenantId) return;
  await recordActivity({
    tenantId: user.tenantId,
    entityType: 'user',
    entityId: user.id,
    entityLabel: userDisplayName(user),
    action: 'update',
    changedByUserId: actorUserId,
    before: { twoStep: from },
    after: { twoStep: to },
    fieldConfig: userActivityFieldConfig,
  }).catch(() => undefined);
}

// ---- codes -------------------------------------------------------------------------------------

// A 6-digit authenticator code, or a recovery code (used up on success).
export async function checkCode(user: User, code: unknown): Promise<'totp' | 'recovery' | null> {
  if (typeof code !== 'string' || !user.totpSecretEnc || !user.totpEnabledAt) return null;
  const secret = decryptMfaSecret(user.totpSecretEnc);
  const step = verifyTotp(secret, code, new Date(), user.totpLastStep);
  if (step !== null) {
    // Conditional update: two requests racing with the same code can't both win.
    const r = await prisma.user.updateMany({ where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } });
    return r.count === 1 ? 'totp' : null;
  }
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length !== 8) return null;
  const used = await prisma.mfaRecoveryCode.updateMany({
    where: { userId: user.id, codeHash: hashToken(normalized), usedAt: null },
    data: { usedAt: new Date() },
  });
  return used.count === 1 ? 'recovery' : null;
}

async function newRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await prisma.$transaction([
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.mfaRecoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashToken(normalizeRecoveryCode(c)) })) }),
  ]);
  return codes;
}

// ---- setup -------------------------------------------------------------------------------------

// Starts (or restarts) a setup: a fresh secret, stored encrypted but not enabled yet.
export async function startSetup(user: User): Promise<Result<{ secret: string; otpauthUrl: string }>> {
  if (user.totpEnabledAt) return { success: false, error: 'Two-step verification is already on', code: 'already_enabled' };
  if (!isMfaEncryptionConfigured()) return { success: false, error: 'Two-step verification isn’t available right now', code: 'unavailable' };
  const secret = generateSecret();
  await prisma.user.update({ where: { id: user.id }, data: { totpSecretEnc: encryptMfaSecret(secret), totpLastStep: null } });
  return { success: true, value: { secret, otpauthUrl: otpauthUrl(secret, user.email) } };
}

// Confirms the setup with a code from the app; returns the recovery codes (shown once).
export async function confirmSetup(user: User, code: unknown): Promise<Result<{ recoveryCodes: string[] }>> {
  if (user.totpEnabledAt) return { success: false, error: 'Two-step verification is already on', code: 'already_enabled' };
  if (!user.totpSecretEnc || typeof code !== 'string') return { success: false, error: 'Start the setup again', code: 'no_setup' };
  const step = verifyTotp(decryptMfaSecret(user.totpSecretEnc), code, new Date(), null);
  if (step === null) return { success: false, error: 'That code isn’t right. Check the time on your phone and try the newest code.', code: 'bad_code' };
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date(), totpLastStep: step } });
  const recoveryCodes = await newRecoveryCodes(user.id);
  await logChange(user, user.id, 'off', 'on');
  return { success: true, value: { recoveryCodes } };
}

export async function regenerateRecoveryCodes(user: User, code: unknown): Promise<Result<{ recoveryCodes: string[] }>> {
  if (!(await checkCode(user, code))) return { success: false, error: 'That code isn’t right', code: 'bad_code' };
  return { success: true, value: { recoveryCodes: await newRecoveryCodes(user.id) } };
}

async function turnOff(userId: string) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null } }),
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.mfaTrustedDevice.deleteMany({ where: { userId } }),
    prisma.mfaChallenge.deleteMany({ where: { userId } }),
  ]);
}

// The person turning it off themselves: only when it isn't required, and with a current code.
export async function disable(user: User, code: unknown): Promise<Result<null>> {
  if (!user.totpEnabledAt) return { success: true, value: null };
  if (await isMfaRequired(user)) return { success: false, error: 'Your role requires two-step verification', code: 'required' };
  if (!(await checkCode(user, code))) return { success: false, error: 'That code isn’t right', code: 'bad_code' };
  await turnOff(user.id);
  await logChange(user, user.id, 'on', 'off');
  return { success: true, value: null };
}

// Someone else resetting it (a tenant admin with manage_users, or Northstack staff): the person
// sets it up again at their next login. Their sessions end so nobody stays in on the old setup.
export async function resetForUser(target: User, actorUserId: string): Promise<void> {
  await turnOff(target.id);
  await prisma.session.deleteMany({ where: { userId: target.id, supportAccessRequestId: null } });
  await logChange(target, actorUserId, 'on', 'reset');
}

export async function forgetDevices(userId: string): Promise<void> {
  await prisma.mfaTrustedDevice.deleteMany({ where: { userId } });
}

export async function mfaStatus(user: User) {
  const [required, codesLeft, devices] = await Promise.all([
    isMfaRequired(user),
    prisma.mfaRecoveryCode.count({ where: { userId: user.id, usedAt: null } }),
    prisma.mfaTrustedDevice.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
  ]);
  return { enabled: !!user.totpEnabledAt, enabledAt: user.totpEnabledAt, required, recoveryCodesLeft: user.totpEnabledAt ? codesLeft : 0, trustedDevices: devices };
}

// ---- login -------------------------------------------------------------------------------------

export type MfaPurpose = 'verify' | 'enroll';

export async function createChallenge(userId: string, purpose: MfaPurpose): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.mfaChallenge.deleteMany({ where: { userId, OR: [{ expiresAt: { lt: new Date() } }, { purpose }] } });
  await prisma.mfaChallenge.create({ data: { userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + CHALLENGE_MINUTES * 60_000) } });
  return token;
}

// The challenge and its user, counting the attempt. Expired, used up or unknown → null.
export async function useChallenge(token: unknown, purpose: MfaPurpose) {
  if (typeof token !== 'string' || token.length > 100) return null;
  const challenge = await prisma.mfaChallenge.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!challenge || challenge.purpose !== purpose || challenge.expiresAt <= new Date() || challenge.attempts >= CHALLENGE_MAX_ATTEMPTS) return null;
  await prisma.mfaChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
  return challenge;
}

export async function endChallenge(id: string) {
  await prisma.mfaChallenge.delete({ where: { id } }).catch(() => undefined);
}

export async function trustDevice(userId: string, userAgent: string | null): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await prisma.mfaTrustedDevice.create({
    data: { userId, tokenHash: hashToken(token), userAgent: userAgent?.slice(0, 300) ?? null, expiresAt: new Date(Date.now() + TRUSTED_DEVICE_DAYS * 86_400_000) },
  });
  return token;
}

export async function isTrustedDevice(userId: string, token: unknown): Promise<boolean> {
  if (typeof token !== 'string' || !token || token.length > 100) return false;
  const device = await prisma.mfaTrustedDevice.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!device || device.userId !== userId || device.expiresAt <= new Date()) return false;
  await prisma.mfaTrustedDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
  return true;
}
