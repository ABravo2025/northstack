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
}

export function hashPassword(password: string): string {
  return Buffer.from(password).toString('base64');
}

export async function registerUser(input: RegisterUserInput): Promise<AuthResult> {
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  if (existingUser) {
    return { success: false, error: 'Email already registered' };
  }

  if (!input.phone?.trim()) {
    return { success: false, error: 'Phone is required' };
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

  if (!user || user.passwordHash !== hashPassword(input.password)) {
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
