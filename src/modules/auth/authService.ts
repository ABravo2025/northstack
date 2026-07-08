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
    },
  });

  return { success: true, user, session };
}

export async function authenticateToken(token: string): Promise<User | null> {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  return session?.user ?? null;
}

export async function logoutUser(token: string): Promise<boolean> {
  const deleted = await prisma.session.deleteMany({
    where: { token },
  });

  return deleted.count > 0;
}
