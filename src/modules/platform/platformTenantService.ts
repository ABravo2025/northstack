import prisma from '../../lib/prisma.js';
import type { TenantStatus } from '@prisma/client';

export type TenantSortField = 'name' | 'country' | 'createdAt' | 'userCount';
export type SortOrder = 'asc' | 'desc';

export interface ListTenantsInput {
  status: TenantStatus;
  sortBy: TenantSortField;
  sortOrder: SortOrder;
  search?: string;
}

export interface TenantListItem {
  id: string;
  name: string;
  country: string | null;
  createdAt: Date;
  userCount: number;
}

// Internal admin tool, one row per tenant across the whole platform -- a
// single findMany + in-process sort is simpler than mixing Prisma orderBy
// (fine for name/country/createdAt) with a separate path for userCount
// (an aggregate, not a real column), and this dataset isn't large enough
// for that split to matter.
export async function listTenants(input: ListTenantsInput): Promise<TenantListItem[]> {
  const tenants = await prisma.tenant.findMany({
    where: {
      status: input.status,
      ...(input.search
        ? {
            OR: [
              { name: { contains: input.search, mode: 'insensitive' } },
              { country: { contains: input.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      country: true,
      createdAt: true,
      _count: { select: { users: true } },
    },
  });

  const mapped: TenantListItem[] = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    country: t.country,
    createdAt: t.createdAt,
    userCount: t._count.users,
  }));

  const direction = input.sortOrder === 'desc' ? -1 : 1;
  mapped.sort((a, b) => {
    switch (input.sortBy) {
      case 'name':
        return direction * a.name.localeCompare(b.name);
      case 'country':
        return direction * (a.country ?? '').localeCompare(b.country ?? '');
      case 'userCount':
        return direction * (a.userCount - b.userCount);
      case 'createdAt':
      default:
        return direction * (a.createdAt.getTime() - b.createdAt.getTime());
    }
  });

  return mapped;
}

export async function getTenantDetail(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      country: true,
      createdAt: true,
      currency: true,
      companySize: true,
      industry: true,
      acquisitionChannel: true,
      _count: { select: { users: true } },
    },
  });
  if (!tenant) return null;

  const { _count, ...rest } = tenant;
  return { ...rest, userCount: _count.users };
}

export type TenantUserSortField = 'firstName' | 'lastName' | 'email' | 'role' | 'status' | 'createdAt';

export interface ListTenantUsersInput {
  tenantId: string;
  sortBy: TenantUserSortField;
  sortOrder: SortOrder;
}

export async function listTenantUsers(input: ListTenantUsersInput) {
  return prisma.user.findMany({
    where: { tenantId: input.tenantId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
    orderBy: { [input.sortBy]: input.sortOrder },
  });
}
