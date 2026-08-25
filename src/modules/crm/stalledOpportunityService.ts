import prisma from '../../lib/prisma.js';
import { createNotification, findLatestNotificationTimestamps } from '../notifications/notificationService.js';
import { sendOpportunityStalledEmail } from '../../lib/mailer.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface StalledReminderResult {
  pipelinesChecked: number;
  opportunitiesScanned: number;
  notificationsCreated: number;
  skippedAlreadyNotified: number;
  skippedUnowned: number;
}

// Driven by a Vercel Cron hitting /api/internal/opportunities/stalled-reminders/run
// once a day (see src/routes/internal.ts) — docs/tareas/specredisenosalesv2.md §3.8,
// the project's first cron that writes user-visible rows and sends mail (the two
// existing crons are billing/infra, silent by design).
//
// Dedup is "once per stall episode," derived entirely from data that already
// exists — no new schema. A stage change always writes a fresh
// OpportunityStageHistory row (opportunityService.ts's updateOpportunity), which
// naturally invalidates any earlier stalled-notification for that Opportunity:
// a candidate is skipped only if its latest matching Notification is newer than
// its *current* stage's enteredAt. Move the deal, let it stall again in the new
// stage, and it notifies again — no separate "already notified" flag to maintain.
export async function runStalledOpportunityReminders(now: Date = new Date()): Promise<StalledReminderResult> {
  const result: StalledReminderResult = {
    pipelinesChecked: 0,
    opportunitiesScanned: 0,
    notificationsCreated: 0,
    skippedAlreadyNotified: 0,
    skippedUnowned: 0,
  };

  // Excludes suspended/cancelled tenants — unlike runPlanTransitions (billing
  // housekeeping nobody sees), this one emails real end users.
  const pipelines = await prisma.pipeline.findMany({
    where: {
      stalledThresholdDays: { not: null },
      isActive: true,
      tenant: { status: { notIn: ['suspended', 'cancelled'] } },
    },
    select: { id: true, tenantId: true, stalledThresholdDays: true },
  });
  result.pipelinesChecked = pipelines.length;

  for (const pipeline of pipelines) {
    const cutoff = new Date(now.getTime() - pipeline.stalledThresholdDays! * MS_PER_DAY);

    const opportunities = await prisma.opportunity.findMany({
      where: {
        tenantId: pipeline.tenantId,
        pipelineId: pipeline.id,
        isActive: true,
        stage: { outcome: 'open' },
      },
      select: {
        id: true,
        name: true,
        ownerId: true,
        createdAt: true,
        stage: { select: { name: true } },
        company: { select: { name: true } },
        owner: { select: { email: true, firstName: true } },
        // take: 1 here (not a separate per-opportunity query) — avoids an N+1
        // across every open deal in the pipeline.
        stageHistory: { orderBy: { enteredAt: 'desc' }, take: 1, select: { enteredAt: true } },
      },
    });
    result.opportunitiesScanned += opportunities.length;

    const candidates = opportunities.filter((opp) => (opp.stageHistory[0]?.enteredAt ?? opp.createdAt) <= cutoff);
    if (candidates.length === 0) {
      continue;
    }

    // One batched lookup for every candidate in this pipeline, not one per
    // Opportunity.
    const latestNotified = await findLatestNotificationTimestamps(
      pipeline.tenantId,
      'opportunity_stalled',
      'opportunity',
      candidates.map((c) => c.id),
    );

    for (const opp of candidates) {
      const enteredAt = opp.stageHistory[0]?.enteredAt ?? opp.createdAt;

      if (!opp.ownerId) {
        // Unowned stalled deals are skipped, not misdirected to anyone else
        // (docs/tareas/specredisenosalesv2.md §3.8).
        result.skippedUnowned += 1;
        continue;
      }

      const lastNotifiedAt = latestNotified.get(`${opp.id}:${opp.ownerId}`);
      if (lastNotifiedAt && lastNotifiedAt > enteredAt) {
        result.skippedAlreadyNotified += 1;
        continue;
      }

      const daysInStage = Math.floor((now.getTime() - enteredAt.getTime()) / MS_PER_DAY);
      const message = `${opp.name} has been in ${opp.stage.name} for ${daysInStage} days`;

      await createNotification({
        tenantId: pipeline.tenantId,
        userId: opp.ownerId,
        type: 'opportunity_stalled',
        entityType: 'opportunity',
        entityId: opp.id,
        message,
      });
      result.notificationsCreated += 1;

      if (opp.owner) {
        const appUrl = `${process.env.APP_BASE_URL ?? 'http://localhost:5173'}/opportunities`;
        sendOpportunityStalledEmail({
          to: opp.owner.email,
          ownerFirstName: opp.owner.firstName,
          opportunityName: opp.name,
          companyName: opp.company?.name ?? '',
          stageName: opp.stage.name,
          daysInStage,
          appUrl,
        }).catch((error) => console.error('Failed to send opportunity stalled email:', error));
      }
    }
  }

  return result;
}
