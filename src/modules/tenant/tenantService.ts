import { randomUUID } from 'crypto';
import prisma from '../../lib/prisma.js';
import type { Tenant, User, Session } from '@prisma/client';

type TenantOwnerInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export interface CreateTenantInput {
  name: string;
  slug?: string;
  owner: TenantOwnerInput;
}

export interface TenantCreationResult {
  success: boolean;
  tenant?: Tenant;
  user?: User;
  session?: Session;
  error?: string;
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
}

function hashPassword(password: string): string {
  return Buffer.from(password).toString('base64');
}

export async function createTenantWithOwner(input: CreateTenantInput): Promise<TenantCreationResult> {
  const slug = normalizeSlug(input.slug ?? input.name);

  const existingTenant = await prisma.tenant.findUnique({
    where: { slug },
  });

  if (existingTenant) {
    return { success: false, error: 'Tenant slug already registered' };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: input.owner.email.toLowerCase() },
  });

  if (existingUser) {
    return { success: false, error: 'Owner email already registered' };
  }

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.name,
        slug,
      },
    });

    const user = await tx.user.create({
      data: {
        firstName: input.owner.firstName,
        lastName: input.owner.lastName,
        email: input.owner.email.toLowerCase(),
        passwordHash: hashPassword(input.owner.password),
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

    return { tenant, user, session };
  });

  return {
    success: true,
    tenant: result.tenant,
    user: result.user,
    session: result.session,
  };
}
