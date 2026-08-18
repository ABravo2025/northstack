import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import prisma from '../../lib/prisma.js';
import type { TenantStatus, UserRole } from '@prisma/client';
import type { User, Session } from '@prisma/client';
import { sendPasswordResetEmail } from '../../lib/mailer.js';

export interface RegisterUserInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  role?: UserRole;
  acceptedTerms?: boolean;
}

export interface LoginUserInput {
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  session?: Session;
  error?: string;
  field?: string;
}

const SCRYPT_KEY_LENGTH = 64;
const PASSWORD_MIN_LENGTH = 8;
const PHONE_REGEX = /^\+?[0-9()\-\s]{7,20}$/;

// Sliding expiration: a session is valid for 30 days from its most recent
// use, not from creation — an active user is never force-logged-out, but an
// abandoned/stolen token stops working 30 days after its last use.
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function newSessionExpiry(): Date {
  return new Date(Date.now() + SESSION_DURATION_MS);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString('hex');
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) {
    return false;
  }

  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = scryptSync(password, salt, SCRYPT_KEY_LENGTH);

  if (keyBuffer.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(keyBuffer, derivedKey);
}

export function isPasswordValid(password: string): boolean {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return false;
  }
  if (!/[A-Z]/.test(password)) {
    return false;
  }
  if (!/[0-9]/.test(password)) {
    return false;
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return false;
  }
  return true;
}

export const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 8 characters and include 1 uppercase letter, 1 number, and 1 special character';

export const PHONE_POLICY_MESSAGE = 'Please enter a valid phone number';

export function isPhoneValid(phone: string): boolean {
  return PHONE_REGEX.test(phone.trim());
}

export async function registerUser(input: RegisterUserInput): Promise<AuthResult> {
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (existingUser) {
    return { success: false, error: 'Email already registered', field: 'email' };
  }

  if (!input.phone?.trim()) {
    return { success: false, error: 'Phone is required', field: 'phone' };
  }

  if (!isPhoneValid(input.phone)) {
    return { success: false, error: PHONE_POLICY_MESSAGE, field: 'phone' };
  }

  if (!isPasswordValid(input.password)) {
    return { success: false, error: PASSWORD_POLICY_MESSAGE, field: 'password' };
  }

  if (input.acceptedTerms !== true) {
    return { success: false, error: 'You must accept the Terms of Service and Privacy Policy', field: 'acceptedTerms' };
  }

  const user = await prisma.user.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone.trim(),
      email: input.email.toLowerCase(),
      passwordHash: hashPassword(input.password),
      role: input.role ?? 'member',
      acceptedTermsAt: new Date(),
    },
  });

  const session = await prisma.session.create({
    data: {
      token: crypto.randomUUID(),
      userId: user.id,
      expiresAt: newSessionExpiry(),
    },
  });

  return { success: true, user, session };
}

export async function loginUser(input: LoginUserInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    return { success: false, error: 'Invalid credentials' };
  }

  const session = await prisma.session.create({
    data: {
      token: crypto.randomUUID(),
      userId: user.id,
      expiresAt: newSessionExpiry(),
    },
  });

  return { success: true, user, session };
}

// Minimal tenant projection alongside the user — just enough for validateSession (httpAuth.ts)
// to gate mutations on a suspended workspace without a second round trip per request.
export type AuthenticatedUser = User & { tenant: { id: string; status: TenantStatus } | null };

export async function authenticateToken(token: string): Promise<AuthenticatedUser | null> {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { include: { tenant: { select: { id: true, status: true } } } } },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt < new Date()) {
    return null;
  }

  if (session.user.status !== 'active') {
    return null;
  }

  // Sliding expiration — extend on use instead of letting it count down from
  // creation, so an active user is never force-logged-out. Only write when
  // the extension is actually meaningful (more than a day's worth of the
  // window has already elapsed) — every authenticated request goes through
  // here, so unconditionally writing on each one would double the DB
  // round-trips of the entire app for no practical benefit over a
  // once-a-day refresh.
  const staleBy = SESSION_DURATION_MS - (24 * 60 * 60 * 1000);
  if (session.expiresAt.getTime() - Date.now() < staleBy) {
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: newSessionExpiry() },
    });
  }

  return session.user;
}

export async function logoutUser(token: string): Promise<boolean> {
  const deleted = await prisma.session.deleteMany({
    where: { token },
  });

  return deleted.count > 0;
}

export function sanitizeUser<T extends { passwordHash: string }>(user: T): Omit<T, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export interface UpdateProfileInput {
  firstName: string;
  lastName: string;
  phone: string;
}

export async function updateOwnProfile(userId: string, input: UpdateProfileInput): Promise<AuthResult> {
  if (!input.firstName?.trim()) {
    return { success: false, error: 'First name is required', field: 'firstName' };
  }

  if (!input.lastName?.trim()) {
    return { success: false, error: 'Last name is required', field: 'lastName' };
  }

  if (!input.phone?.trim()) {
    return { success: false, error: 'Phone is required', field: 'phone' };
  }

  if (!isPhoneValid(input.phone)) {
    return { success: false, error: PHONE_POLICY_MESSAGE, field: 'phone' };
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone.trim(),
    },
  });

  return { success: true, user };
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export async function changeOwnPassword(
  userId: string,
  input: ChangePasswordInput,
  currentToken: string,
): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  if (!input.currentPassword || !verifyPassword(input.currentPassword, user.passwordHash)) {
    return { success: false, error: 'Current password is incorrect', field: 'currentPassword' };
  }

  if (!isPasswordValid(input.newPassword)) {
    return { success: false, error: PASSWORD_POLICY_MESSAGE, field: 'newPassword' };
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(input.newPassword) },
  });

  // A stolen token shouldn't keep working after the account owner changes
  // their password — but keep the session making this request alive, so
  // whoever just changed it isn't immediately logged out themselves.
  await prisma.session.deleteMany({
    where: { userId, token: { not: currentToken } },
  });

  return { success: true, user: updated };
}

// 1 hour — much shorter than an invitation (7 days, INVITATION_EXPIRY_MS in
// invitationService.ts): a password reset link is meant to be used right
// away, a long-lived one sitting in an inbox is a bigger liability.
const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;

// Always resolves, never tells the caller whether the email matched a real
// account — the route always shows the same generic "if that email exists…"
// message either way, so a stranger probing random addresses can't use this
// to discover which emails have accounts (enumeration).
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) {
    return;
  }

  // Superseding any still-unused link from an earlier request — only the
  // most recent one a person asked for should actually work.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomUUID();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS) },
  });

  const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173';
  // Best-effort, same reasoning as invitationService.ts's invitation email:
  // the token already exists in the DB regardless of whether this send
  // succeeds, so a flaky SMTP call shouldn't fail the (already
  // information-free) response the caller is waiting on.
  sendPasswordResetEmail({
    to: user.email,
    resetUrl: `${appBaseUrl}/reset-password/${token}`,
  }).catch((error) => {
    console.error('Failed to send password reset email:', error);
  });
}

export interface ValidateResetTokenResult {
  valid: boolean;
  error?: string;
}

// Read-only check (no side effects) so the frontend can show "this link
// expired" before the person types a whole new password — same shape as
// getContractConfirmationDetails's pre-flight check in contractConfirmationService.ts.
export async function validatePasswordResetToken(token: string): Promise<ValidateResetTokenResult> {
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!resetToken) {
    return { valid: false, error: 'This reset link is invalid.' };
  }
  if (resetToken.usedAt) {
    return { valid: false, error: 'This reset link has already been used.' };
  }
  if (resetToken.expiresAt < new Date()) {
    return { valid: false, error: 'This reset link has expired.' };
  }
  return { valid: true };
}

export async function resetPassword(token: string, newPassword: string): Promise<AuthResult> {
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!resetToken) {
    return { success: false, error: 'This reset link is invalid.' };
  }
  if (resetToken.usedAt) {
    return { success: false, error: 'This reset link has already been used.' };
  }
  if (resetToken.expiresAt < new Date()) {
    return { success: false, error: 'This reset link has expired.' };
  }
  if (!isPasswordValid(newPassword)) {
    return { success: false, error: PASSWORD_POLICY_MESSAGE, field: 'password' };
  }

  const passwordHash = hashPassword(newPassword);
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
    await tx.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } });
    // Unlike changeOwnPassword (which keeps the requester's own session
    // alive), a reset has no "current session" to preserve — whoever had one
    // before either forgot their password legitimately or shouldn't still be
    // logged in, so every existing session is revoked before issuing the one
    // fresh session below.
    await tx.session.deleteMany({ where: { userId: resetToken.userId } });
    const session = await tx.session.create({
      data: { token: randomUUID(), userId: resetToken.userId, expiresAt: newSessionExpiry() },
    });
    return { user, session };
  });

  return { success: true, user: result.user, session: result.session };
}
