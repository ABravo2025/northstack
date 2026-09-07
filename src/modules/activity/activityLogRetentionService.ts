import prisma from '../../lib/prisma.js';
import { getPlanLimits } from '../tenant/planLimits.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ActivityLogRetentionResult {
  tenantsChecked: number;
  entriesDeleted: number;
}

// Triggered once a day by Vercel Cron (/api/internal/activity-log-retention/run,
// src/routes/internal.ts) — plan-tier enforcement (2026-09-07): Starter keeps 7 days of Activity
// Log history, Growth keeps 30, older entries are deleted outright (not archived — matches the
// confirmed product decision, "después de eso se eliminan los registros"). Excludes
// suspended/cancelled tenants, same reasoning as runStalledOpportunityReminders — no point paying
// the query cost for a workspace nobody's using.
export async function runActivityLogRetention(now: Date = new Date()): Promise<ActivityLogRetentionResult> {
  const tenants = await prisma.tenant.findMany({
    where: { status: { notIn: ['suspended', 'cancelled'] } },
    select: { id: true, plan: true },
  });

  let entriesDeleted = 0;
  for (const tenant of tenants) {
    const { activityLogRetentionDays } = getPlanLimits(tenant);
    if (activityLogRetentionDays === null) continue; // unlimited retention, nothing to delete

    const cutoff = new Date(now.getTime() - activityLogRetentionDays * MS_PER_DAY);
    const { count } = await prisma.activityLogEntry.deleteMany({
      where: { tenantId: tenant.id, changedAt: { lt: cutoff } },
    });
    entriesDeleted += count;
  }

  return { tenantsChecked: tenants.length, entriesDeleted };
}
