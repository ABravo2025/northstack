import prisma from '../src/lib/prisma.js';
import { CURRENT_PLAN_PRICES_CENTS } from '../src/modules/tenant/planService.js';
import type { PlanTier, SubscriptionStatus, TenantStatus } from '@prisma/client';

// One-time backfill (Billing Integration, Unidad 2): every Tenant that existed before
// Subscription was introduced gets a matching row, copying its current
// plan/status/trialEndsAt/gracePeriodEndsAt/lockedPriceCents. Idempotent — skips any tenant that
// already has one (Subscription.tenantId is @unique), safe to re-run after a partial failure.
//
// Tenant.plan/lockedPriceCents are nullable (a trialing tenant may not have picked a plan yet);
// Subscription's aren't (see schema.prisma's comment on the model) — those tenants get the same
// 'starter' placeholder registerTenantWithOwner now sets for brand-new signups, so every tenant
// ends up with a Subscription that has SOME billable plan the moment a checkout might need one.
const TENANT_TO_SUBSCRIPTION_STATUS: Record<TenantStatus, SubscriptionStatus> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  suspended: 'suspended',
  cancelled: 'cancelled',
};

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      status: true,
      plan: true,
      trialEndsAt: true,
      gracePeriodEndsAt: true,
      lockedPriceCents: true,
    },
  });

  let created = 0;
  let skipped = 0;

  for (const tenant of tenants) {
    const existing = await prisma.subscription.findUnique({ where: { tenantId: tenant.id } });
    if (existing) {
      skipped += 1;
      continue;
    }

    const plan: PlanTier = tenant.plan ?? 'starter';
    const lockedPriceCents = tenant.lockedPriceCents ?? CURRENT_PLAN_PRICES_CENTS.starter;

    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        plan,
        status: TENANT_TO_SUBSCRIPTION_STATUS[tenant.status],
        lockedPriceCents,
        currency: 'USD',
        trialEndsAt: tenant.trialEndsAt,
        gracePeriodEndsAt: tenant.gracePeriodEndsAt,
      },
    });
    created += 1;
  }

  console.log(`Created ${created} Subscription row(s), skipped ${skipped} tenant(s) that already had one.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
