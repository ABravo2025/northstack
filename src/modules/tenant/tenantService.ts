import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma.js';
import type { Invitation, Tenant, User, UserRole, Session } from '@prisma/client';

const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface TenantCreationResult {
  success: boolean;
  tenant?: Tenant;
  user?: User;
  session?: Session;
  error?: string;
}

export interface CreateTenantForUserInput {
  userId: string;
  name: string;
}

export interface CreateInvitationInput {
  tenantId: string;
  invitedByUserId: string;
  email: string;
  role?: UserRole;
}

export interface InvitationResult {
  success: boolean;
  invitation?: Invitation;
  error?: string;
}

export interface AcceptInvitationInput {
  token: string;
  userId: string;
}

export async function createTenantForUser(input: CreateTenantForUserInput): Promise<TenantCreationResult> {
  const slug = normalizeSlug(input.name);

  const existingTenant = await prisma.tenant.findUnique({
    where: { slug },
  });

  if (existingTenant) {
    return { success: false, error: 'Tenant slug already registered' };
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
  });

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  if (user.tenantId) {
    return { success: false, error: 'User already belongs to a tenant' };
  }

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.name,
        slug,
      },
    });

    const updatedUser = await tx.user.update({
      where: { id: input.userId },
      data: {
        tenantId: tenant.id,
        role: 'owner',
      },
    });

    return { tenant, user: updatedUser };
  });

  return {
    success: true,
    tenant: result.tenant,
    user: result.user,
  };
}

export async function createInvitation(input: CreateInvitationInput): Promise<InvitationResult> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
  });

  if (!tenant) {
    return { success: false, error: 'Tenant not found' };
  }

  const normalizedEmail = input.email.toLowerCase().trim();

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser?.tenantId) {
    return { success: false, error: 'User already belongs to a tenant' };
  }

  const invitation = await prisma.invitation.create({
    data: {
      tenantId: input.tenantId,
      invitedByUserId: input.invitedByUserId,
      email: normalizedEmail,
      role: input.role ?? 'member',
      token: randomUUID(),
      expiresAt: new Date(Date.now() + INVITATION_EXPIRY_MS),
    },
  });

  return { success: true, invitation };
}

export async function acceptInvitation(input: AcceptInvitationInput): Promise<TenantCreationResult> {
  const invitation = await prisma.invitation.findUnique({
    where: { token: input.token },
  });

  if (!invitation) {
    return { success: false, error: 'Invitation not found' };
  }

  if (invitation.status !== 'pending') {
    return { success: false, error: 'Invitation is no longer valid' };
  }

  if (invitation.expiresAt < new Date()) {
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'expired' },
    });
    return { success: false, error: 'Invitation has expired' };
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
  });

  if (!user) {
    return { success: false, error: 'User not found' };
  }

  if (user.tenantId) {
    return { success: false, error: 'User already belongs to a tenant' };
  }

  if (user.email.toLowerCase() !== invitation.email) {
    return { success: false, error: 'Invitation was issued for a different email' };
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: input.userId },
      data: {
        tenantId: invitation.tenantId,
        role: invitation.role,
      },
    });

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: 'accepted' },
    });

    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: invitation.tenantId },
    });

    return { tenant, user: updatedUser };
  });

  return {
    success: true,
    tenant: result.tenant,
    user: result.user,
  };
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
}

