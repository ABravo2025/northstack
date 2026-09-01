import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma.js';
import type { Invitation, UserRole } from '@prisma/client';
import { sendInvitationEmail } from '../../lib/mailer.js';
import type { TenantCreationResult } from './tenantService.js';
import { recordActivity } from '../activity/activityLogService.js';
import { invitationActivityFieldConfig } from '../activity/fieldConfigs/invitationFieldConfig.js';
import { findSeedRoleId } from '../auth/roleService.js';

const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CreateInvitationInput {
  tenantId: string;
  invitedByUserId: string;
  email: string;
  role?: UserRole;
  employeeId?: string;
  // Where the emailed link sends the invitee — defaults to the generic
  // accept-invite screen. Payroll's contract-confirmation flow (Unidad 6)
  // overrides this to '/confirm-contract' so a Contractor/Employee's first
  // invitation lands on their contract instead of the generic accept screen.
  acceptPath?: string;
  // The draft contract PDF (Payroll, contractPdfService.ts) — attached as-is
  // when this invitation is for a first-ever contract, so the invitee has a
  // copy to read even before opening the link.
  attachments?: { filename: string; content: Buffer }[];
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

export async function findInvitationByToken(token: string) {
  return prisma.invitation.findUnique({
    where: { token },
    select: {
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      employeeId: true,
      tenantId: true,
    },
  });
}

export async function createInvitation(input: CreateInvitationInput): Promise<InvitationResult> {
  // Fase B (Custom Roles) gap closed: ownership was never enforceable here before — an admin
  // could set role:'owner' on an invitation and, once accepted, the tenant would end up with two
  // owners (the transfer-safety-and-demotion logic only lives in tenantUserService.ts's
  // updateTenantUser, which this bypassed entirely). Ownership can only ever move between two
  // EXISTING users via that atomic transfer — never granted to someone who doesn't have an
  // account yet — so it's rejected unconditionally here, regardless of who's inviting.
  if (input.role === 'owner') {
    return { success: false, error: 'Ownership can only be transferred to an existing user, not granted by invitation' };
  }

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

  const role = input.role ?? 'member';
  const invitation = await prisma.invitation.create({
    data: {
      tenantId: input.tenantId,
      invitedByUserId: input.invitedByUserId,
      email: normalizedEmail,
      role,
      roleId: await findSeedRoleId(input.tenantId, role),
      employeeId: input.employeeId,
      token: randomUUID(),
      expiresAt: new Date(Date.now() + INVITATION_EXPIRY_MS),
    },
  });

  const appBaseUrl = process.env.APP_BASE_URL ?? 'http://localhost:5173';
  const acceptPath = input.acceptPath ?? '/accept-invite';
  sendInvitationEmail({
    to: invitation.email,
    tenantName: tenant.name,
    role: invitation.role,
    acceptUrl: `${appBaseUrl}${acceptPath}/${invitation.token}`,
    attachments: input.attachments,
  }).catch((error) => {
    // Best-effort: the invitation itself (and its copyable link in the UI)
    // already exists, so a failed email shouldn't fail the whole request.
    console.error('Failed to send invitation email:', error);
  });

  await recordActivity({
    tenantId: input.tenantId,
    entityType: 'invitation',
    entityId: invitation.id,
    entityLabel: invitation.email,
    action: 'create',
    changedByUserId: input.invitedByUserId,
    after: invitation,
    fieldConfig: invitationActivityFieldConfig,
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
        roleId: invitation.roleId,
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
  }, { timeout: 15000 }); // default 5000ms is tight once seeding (statuses + pipelines) adds several round trips over Neon's network latency

  await recordActivity({
    tenantId: invitation.tenantId,
    entityType: 'invitation',
    entityId: invitation.id,
    entityLabel: invitation.email,
    action: 'update',
    changedByUserId: input.userId,
    before: invitation,
    after: { ...invitation, status: 'accepted' },
    fieldConfig: invitationActivityFieldConfig,
  });

  return {
    success: true,
    tenant: result.tenant,
    user: result.user,
  };
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

export interface CancelInvitationResult {
  success: boolean;
  error?: string;
}

export async function cancelInvitation(
  tenantId: string,
  invitationId: string,
  changedByUserId: string,
): Promise<CancelInvitationResult> {
  const invitation = await prisma.invitation.findUnique({ where: { id: invitationId } });
  if (!invitation || invitation.tenantId !== tenantId) {
    return { success: false, error: 'Invitation not found' };
  }

  if (invitation.status !== 'pending') {
    return { success: false, error: 'Invitation is no longer pending' };
  }

  const updated = await prisma.invitation.update({ where: { id: invitationId }, data: { status: 'revoked' } });

  await recordActivity({
    tenantId,
    entityType: 'invitation',
    entityId: invitationId,
    entityLabel: invitation.email,
    action: 'update',
    changedByUserId,
    before: invitation,
    after: updated,
    fieldConfig: invitationActivityFieldConfig,
  });

  return { success: true };
}
