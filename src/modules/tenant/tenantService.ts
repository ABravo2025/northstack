import prisma from '../../lib/prisma.js';
import type { Tenant, User, Session } from '@prisma/client';

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

export interface JoinTenantForUserInput {
  userId: string;
  tenantId: string;
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

export async function joinTenantForUser(input: JoinTenantForUserInput): Promise<TenantCreationResult> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
  });

  if (!tenant) {
    return { success: false, error: 'Tenant not found' };
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

  const updatedUser = await prisma.user.update({
    where: { id: input.userId },
    data: {
      tenantId: tenant.id,
    },
  });

  return {
    success: true,
    tenant,
    user: updatedUser,
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

