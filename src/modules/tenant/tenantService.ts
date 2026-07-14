import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma.js';
import {
  hashPassword,
  isPasswordValid,
  isPhoneValid,
  PASSWORD_POLICY_MESSAGE,
  PHONE_POLICY_MESSAGE,
} from '../auth/authService.js';
import type { Invitation, Tenant, User, UserRole, UserStatus, Session } from '@prisma/client';
import { sendInvitationEmail } from '../../lib/mailer.js';
import { seedDefaultStatusDefinitions } from '../hr/statusService.js';

const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface TenantCreationResult {
  success: boolean;
  tenant?: Tenant;
  user?: User;
  session?: Session;
  error?: string;
  field?: string;
}

export interface CreateTenantForUserInput {
  userId: string;
  name: string;
}

export interface RegisterTenantWithOwnerInput {
  tenantName: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerPhone: string;
}

export interface CreateInvitationInput {
  tenantId: string;
  invitedByUserId: string;
  email: string;
  role?: UserRole;
  employeeId?: string;
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

    await seedDefaultStatusDefinitions(tx, tenant.id);

    const updatedUser = await tx.user.update({
      where: { id: input.userId },
      data: {
        tenantId: tenant.id,
        role: 'owner',
      },
    });

    const ownerDefaultStatus = await tx.statusDefinition.findFirstOrThrow({
      where: { tenantId: tenant.id, entityType: 'employee', isDefault: true },
    });

    await tx.employee.create({
      data: {
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        department: 'Leadership',
        statusId: ownerDefaultStatus.id,
        tenantId: tenant.id,
        userId: updatedUser.id,
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

export async function registerTenantWithOwner(input: RegisterTenantWithOwnerInput): Promise<TenantCreationResult> {
  const slug = normalizeSlug(input.tenantName);
  const normalizedEmail = input.ownerEmail.toLowerCase().trim();

  if (!input.ownerPhone?.trim()) {
    return { success: false, error: 'Phone is required', field: 'ownerPhone' };
  }

  if (!isPhoneValid(input.ownerPhone)) {
    return { success: false, error: PHONE_POLICY_MESSAGE, field: 'ownerPhone' };
  }

  if (!isPasswordValid(input.ownerPassword)) {
    return { success: false, error: PASSWORD_POLICY_MESSAGE, field: 'ownerPassword' };
  }

  const existingTenant = await prisma.tenant.findUnique({
    where: { slug },
  });

  if (existingTenant) {
    return { success: false, error: 'Tenant name already registered', field: 'tenantName' };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    return { success: false, error: 'Email already registered', field: 'ownerEmail' };
  }

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.tenantName,
        slug,
      },
    });

    await seedDefaultStatusDefinitions(tx, tenant.id);

    const user = await tx.user.create({
      data: {
        firstName: input.ownerFirstName,
        lastName: input.ownerLastName,
        phone: input.ownerPhone.trim(),
        email: normalizedEmail,
        passwordHash: hashPassword(input.ownerPassword),
        role: 'owner',
        tenantId: tenant.id,
      },
    });

    const session = await tx.session.create({
      data: {
        token: randomUUID(),
        userId: user.id,
      },
    });

    const ownerDefaultStatus = await tx.statusDefinition.findFirstOrThrow({
      where: { tenantId: tenant.id, entityType: 'employee', isDefault: true },
    });

    await tx.employee.create({
      data: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        department: 'Leadership',
        statusId: ownerDefaultStatus.id,
        tenantId: tenant.id,
        userId: user.id,
      },
    });

    return { tenant, user, session };
  });

  return {
    success: true,
    tenant: result.tenant,
    user: result.user,
    session: result.session,
  };
}

export async function findInvitationByToken(token: string) {
  return prisma.invitation.findUnique({
    where: { token },
    select: {
      email: true,
      role: true,
      status: true,
      expiresAt: true,
    },
  });
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
      employeeId: input.employeeId,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + INVITATION_EXPIRY_MS),
    },
  });

  const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173';
  sendInvitationEmail({
    to: invitation.email,
    tenantName: tenant.name,
    role: invitation.role,
    acceptUrl: `${appBaseUrl}/accept-invite/${invitation.token}`,
  }).catch((error) => {
    // Best-effort: the invitation itself (and its copyable link in the UI)
    // already exists, so a failed email shouldn't fail the whole request.
    console.error('Failed to send invitation email:', error);
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

    if (invitation.employeeId) {
      await tx.employee.update({
        where: { id: invitation.employeeId },
        data: { userId: updatedUser.id },
      });
    }

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

export async function listTenantUsers(tenantId: string) {
  return prisma.user.findMany({
    where: { tenantId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      role: true,
      status: true,
    },
    orderBy: { firstName: 'asc' },
  });
}

export async function listTenantInvitations(tenantId: string) {
  return prisma.invitation.findMany({
    where: { tenantId, status: 'pending' },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      token: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export interface UpdateTenantUserInput {
  role?: UserRole;
  status?: UserStatus;
}

export interface TenantUserUpdateResult {
  success: boolean;
  user?: User;
  error?: string;
}

export async function updateTenantUser(
  tenantId: string,
  targetUserId: string,
  actingUser: User,
  input: UpdateTenantUserInput,
): Promise<TenantUserUpdateResult> {
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target || target.tenantId !== tenantId) {
    return { success: false, error: 'User not found' };
  }

  if (target.id === actingUser.id) {
    return { success: false, error: 'Use your profile page to change your own account' };
  }

  if ((input.role === 'owner' || target.role === 'owner') && actingUser.role !== 'owner') {
    return { success: false, error: 'Only an owner can manage owner access' };
  }

  if (input.role === 'owner') {
    // A tenant can only ever have one owner. Promoting someone to owner is a
    // transfer: the acting owner is demoted to admin in the same transaction,
    // so the tenant never has zero or two owners at once.
    const targetData: { role: UserRole; status?: UserStatus } = { role: 'owner' };
    if (input.status) {
      targetData.status = input.status;
    }

    const [updatedTarget] = await prisma.$transaction([
      prisma.user.update({ where: { id: targetUserId }, data: targetData }),
      prisma.user.update({ where: { id: actingUser.id }, data: { role: 'admin' } }),
    ]);

    return { success: true, user: updatedTarget };
  }

  const data: { role?: UserRole; status?: UserStatus } = {};
  if (input.role) {
    data.role = input.role;
  }
  if (input.status) {
    data.status = input.status;
  }

  const updated = await prisma.user.update({ where: { id: targetUserId }, data });
  return { success: true, user: updated };
}

export interface CancelInvitationResult {
  success: boolean;
  error?: string;
}

export async function cancelInvitation(tenantId: string, invitationId: string): Promise<CancelInvitationResult> {
  const invitation = await prisma.invitation.findUnique({ where: { id: invitationId } });
  if (!invitation || invitation.tenantId !== tenantId) {
    return { success: false, error: 'Invitation not found' };
  }

  if (invitation.status !== 'pending') {
    return { success: false, error: 'Invitation is no longer pending' };
  }

  await prisma.invitation.update({ where: { id: invitationId }, data: { status: 'revoked' } });
  return { success: true };
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
}

