import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import prisma from '../../lib/prisma.js';
import type { UserRole } from '@prisma/client';
import type { User, Session } from '@prisma/client';

export interface RegisterUserInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  role?: UserRole;
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

  const user = await prisma.user.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone.trim(),
      email: input.email.toLowerCase(),
      passwordHash: hashPassword(input.password),
      role: input.role ?? 'member',
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

export async function authenticateToken(token: string): Promise<User | null> {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
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
