import prisma from '../../lib/prisma.js';
import type { SubscriptionStatus, TenantStatus } from '@prisma/client';

export type TenantSortField = 'name' | 'country' | 'createdAt' | 'userCount' | 'employeeCount';
export type SortOrder = 'asc' | 'desc';

export interface ListTenantsInput {
  status: TenantStatus;
  sortBy: TenantSortField;
  sortOrder: SortOrder;
  search?: string;
}

export interface OnboardingSummary {
  completedSteps: number;
  totalSteps: number;
  hasEmployees: boolean;
  hasCompanies: boolean;
  hasInvitedTeammate: boolean;
  hasTimeOffPolicy: boolean;
}

// Platform-wide equivalent of the checklist onboardingService.ts's getOnboardingStatus used to
// compute for the tenant's own onboarding UI -- that function was removed 2026-09-15 when the
// tenant-facing checklist was replaced by a guided Product Tour (a single completion flag, not a
// 4-step breakdown), so this is reimplemented here rather than calling something that no longer
// exists. hasCompanies checks the `Company` model (CRM v2), not the legacy `Client` model -- new
// tenants (via seedSampleData or manual entry) only ever populate Company/Contact now, so a
// Client-based check would read as permanently incomplete for every real tenant going forward.
function summarizeOnboarding(counts: {
  employeeCount: number;
  companyCount: number;
  userCount: number;
  timeOffPolicyCount: number;
}): OnboardingSummary {
  // Tenant registration auto-creates one Employee record for the owner (see tenantService.ts),
  // so a fresh tenant always has employeeCount === 1 -- "added your first employee" means
  // someone beyond that, same threshold the old checklist used.
  const hasEmployees = counts.employeeCount > 1;
  const hasCompanies = counts.companyCount > 0;
  const hasInvitedTeammate = counts.userCount > 1;
  const hasTimeOffPolicy = counts.timeOffPolicyCount > 0;
  const completedSteps = [hasEmployees, hasCompanies, hasInvitedTeammate, hasTimeOffPolicy].filter(Boolean).length;
  return { completedSteps, totalSteps: 4, hasEmployees, hasCompanies, hasInvitedTeammate, hasTimeOffPolicy };
}

export interface TenantListItem {
  id: string;
  name: string;
  country: string | null;
  createdAt: Date;
  userCount: number;
  employeeCount: number;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionCreatedAt: Date | null;
  onboarding: OnboardingSummary;
}

// Internal admin tool, one row per tenant across the whole platform -- a
// single findMany + in-process sort is simpler than mixing Prisma orderBy
// (fine for name/country/createdAt) with a separate path for userCount
// (an aggregate, not a real column), and this dataset isn't large enough
// for that split to matter. Company/TimeOffPolicy counts (needed only for the onboarding
// summary, not shown as their own column) are fetched via groupBy instead of a per-tenant
// query, same reasoning applied at list scale.
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
      _count: { select: { users: true, employees: true } },
      subscription: { select: { status: true, createdAt: true } },
    },
  });

  const tenantIds = tenants.map((t) => t.id);
  const [companyCounts, timeOffPolicyCounts] = await Promise.all([
    prisma.company.groupBy({ by: ['tenantId'], where: { tenantId: { in: tenantIds } }, _count: { _all: true } }),
    prisma.timeOffPolicyDefinition.groupBy({
      by: ['tenantId'],
      where: { tenantId: { in: tenantIds } },
      _count: { _all: true },
    }),
  ]);
  const companyCountByTenant = new Map(companyCounts.map((c) => [c.tenantId, c._count._all]));
  const timeOffPolicyCountByTenant = new Map(timeOffPolicyCounts.map((c) => [c.tenantId, c._count._all]));

  const mapped: TenantListItem[] = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    country: t.country,
    createdAt: t.createdAt,
    userCount: t._count.users,
    employeeCount: t._count.employees,
    subscriptionStatus: t.subscription?.status ?? null,
    subscriptionCreatedAt: t.subscription?.createdAt ?? null,
    onboarding: summarizeOnboarding({
      employeeCount: t._count.employees,
      companyCount: companyCountByTenant.get(t.id) ?? 0,
      userCount: t._count.users,
      timeOffPolicyCount: timeOffPolicyCountByTenant.get(t.id) ?? 0,
    }),
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
      case 'employeeCount':
        return direction * (a.employeeCount - b.employeeCount);
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
      _count: { select: { users: true, employees: true } },
      subscription: { select: { status: true, createdAt: true } },
    },
  });
  if (!tenant) return null;

  const [companyCount, timeOffPolicyCount] = await Promise.all([
    prisma.company.count({ where: { tenantId } }),
    prisma.timeOffPolicyDefinition.count({ where: { tenantId } }),
  ]);

  const { _count, subscription, ...rest } = tenant;
  return {
    ...rest,
    userCount: _count.users,
    employeeCount: _count.employees,
    subscriptionStatus: subscription?.status ?? null,
    subscriptionCreatedAt: subscription?.createdAt ?? null,
    onboarding: summarizeOnboarding({
      employeeCount: _count.employees,
      companyCount,
      userCount: _count.users,
      timeOffPolicyCount,
    }),
  };
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
