import prisma from '../../lib/prisma.js';
import { avg, daysBetween, lastNMonthKeys, median, monthKey, monthsAgoUtc, pct } from './mathUtils.js';

interface PipelineValueBucket {
  pipelineId: string;
  pipelineName: string;
  currency: string;
  amountCents: number;
  count: number;
}

async function getOpenPipelineValue(tenantId: string): Promise<PipelineValueBucket[]> {
  const opps = await prisma.opportunity.findMany({
    where: { tenantId, isActive: true, stage: { outcome: 'open' } },
    select: { amountCents: true, currency: true, pipelineId: true, pipeline: { select: { name: true } } },
  });
  const groups = new Map<string, PipelineValueBucket>();
  for (const o of opps) {
    const key = `${o.pipelineId}|${o.currency}`;
    if (!groups.has(key)) groups.set(key, { pipelineId: o.pipelineId, pipelineName: o.pipeline.name, currency: o.currency, amountCents: 0, count: 0 });
    const bucket = groups.get(key)!;
    bucket.amountCents += o.amountCents;
    bucket.count += 1;
  }
  return [...groups.values()].sort((a, b) => b.amountCents - a.amountCents);
}

interface WinRateResult {
  winRatePct: number | null;
  wonCount: number;
  lostCount: number;
  dealSizeByCurrency: { currency: string; medianAmountCents: number; avgAmountCents: number; sampleSize: number }[];
  cycleDaysMedian: number;
  cycleSampleSize: number;
}

// Opportunity has no dedicated "closedAt" column — cycle length and any
// period-windowing both derive from OpportunityStageHistory (first entry =
// entered the pipeline, last entry = entered the closing won/lost stage).
async function getWinRateAndCycle(tenantId: string): Promise<WinRateResult> {
  const closed = await prisma.opportunity.findMany({
    where: { tenantId, isActive: true, stage: { outcome: { in: ['won', 'lost'] } } },
    select: {
      amountCents: true,
      currency: true,
      stage: { select: { outcome: true } },
      stageHistory: { select: { enteredAt: true }, orderBy: { enteredAt: 'asc' } },
    },
  });
  const won = closed.filter((o) => o.stage.outcome === 'won');
  const lost = closed.filter((o) => o.stage.outcome === 'lost');

  const byCurrency = new Map<string, number[]>();
  for (const o of won) {
    if (!byCurrency.has(o.currency)) byCurrency.set(o.currency, []);
    byCurrency.get(o.currency)!.push(o.amountCents);
  }
  const dealSizeByCurrency = [...byCurrency].map(([currency, amounts]) => ({
    currency,
    medianAmountCents: Math.round(median(amounts)),
    avgAmountCents: Math.round(avg(amounts)),
    sampleSize: amounts.length,
  }));

  const cycleDays = closed
    .filter((o) => o.stageHistory.length >= 2)
    .map((o) => daysBetween(o.stageHistory[0].enteredAt, o.stageHistory[o.stageHistory.length - 1].enteredAt));

  return {
    winRatePct: pct(won.length, won.length + lost.length),
    wonCount: won.length,
    lostCount: lost.length,
    dealSizeByCurrency,
    cycleDaysMedian: Math.round(median(cycleDays) * 10) / 10,
    cycleSampleSize: cycleDays.length,
  };
}

interface StageVelocity {
  stageId: string;
  stageName: string;
  pipelineName: string;
  historicalMedianDays: number;
  sampleSize: number;
}

interface AtRiskOpportunity {
  opportunityId: string;
  name: string;
  companyId: string;
  stageId: string;
  stageName: string;
  daysInStage: number;
  stageMedianDays: number;
}

// "Historical" durations come only from *completed* stage visits (this stage
// entry was followed by another) — mixing in still-open, in-progress visits
// would bias the average down (a deal that just arrived hasn't had time to
// look slow yet). At-risk opportunities are compared against that clean
// baseline separately. Same underlying data as the "time in stage" indicator
// already shown per-Opportunity in the detail panel — this aggregates it.
async function getStageVelocity(tenantId: string): Promise<{ byStage: StageVelocity[]; atRisk: AtRiskOpportunity[] }> {
  const history = await prisma.opportunityStageHistory.findMany({
    where: { tenantId },
    select: {
      opportunityId: true,
      stageId: true,
      enteredAt: true,
      stage: { select: { name: true, pipeline: { select: { name: true } } } },
    },
    orderBy: [{ opportunityId: 'asc' }, { enteredAt: 'asc' }],
  });

  const byOpportunity = new Map<string, typeof history>();
  for (const entry of history) {
    if (!byOpportunity.has(entry.opportunityId)) byOpportunity.set(entry.opportunityId, []);
    byOpportunity.get(entry.opportunityId)!.push(entry);
  }

  const durationsByStage = new Map<string, { name: string; pipelineName: string; days: number[] }>();
  const currentStageEntry = new Map<string, (typeof history)[number]>();
  for (const sequence of byOpportunity.values()) {
    for (let i = 0; i < sequence.length; i++) {
      const cur = sequence[i];
      const next = sequence[i + 1];
      if (next) {
        if (!durationsByStage.has(cur.stageId)) {
          durationsByStage.set(cur.stageId, { name: cur.stage.name, pipelineName: cur.stage.pipeline.name, days: [] });
        }
        durationsByStage.get(cur.stageId)!.days.push(daysBetween(cur.enteredAt, next.enteredAt));
      } else {
        currentStageEntry.set(cur.opportunityId, cur);
      }
    }
  }

  const byStage = [...durationsByStage].map(([stageId, v]) => ({
    stageId,
    stageName: v.name,
    pipelineName: v.pipelineName,
    historicalMedianDays: Math.round(median(v.days) * 10) / 10,
    sampleSize: v.days.length,
  }));
  const medianByStage = new Map(byStage.map((s) => [s.stageId, s]));

  const openOpps = await prisma.opportunity.findMany({
    where: { tenantId, isActive: true, stage: { outcome: 'open' } },
    select: { id: true, name: true, companyId: true, stageId: true },
  });
  const now = new Date();
  const atRisk: AtRiskOpportunity[] = [];
  for (const o of openOpps) {
    const entry = currentStageEntry.get(o.id);
    const stageStats = medianByStage.get(o.stageId);
    // Require at least 3 completed historical visits before trusting the
    // baseline — a "median" of 1 sample is noise, not a benchmark.
    if (!entry || !stageStats || stageStats.sampleSize < 3) continue;
    const daysInStage = daysBetween(entry.enteredAt, now);
    if (daysInStage > stageStats.historicalMedianDays) {
      atRisk.push({
        opportunityId: o.id,
        name: o.name,
        companyId: o.companyId,
        stageId: o.stageId,
        stageName: stageStats.stageName,
        daysInStage: Math.round(daysInStage * 10) / 10,
        stageMedianDays: stageStats.historicalMedianDays,
      });
    }
  }

  return { byStage, atRisk: atRisk.sort((a, b) => b.daysInStage - a.daysInStage) };
}

async function getLeadToOpportunityConversion(tenantId: string): Promise<{ leadsWithOpportunity: number; totalLeads: number; conversionPct: number | null }> {
  const leads = await prisma.contact.findMany({
    where: { tenantId, isActive: true, leadStatus: { not: null } },
    select: { id: true, opportunityLinks: { select: { id: true }, take: 1 } },
  });
  const withOpportunity = leads.filter((l) => l.opportunityLinks.length > 0).length;
  return { leadsWithOpportunity: withOpportunity, totalLeads: leads.length, conversionPct: pct(withOpportunity, leads.length) };
}

interface LeadSourceBucket {
  leadSourceId: string | null;
  name: string;
  totalContacts: number;
  contactsWithWonDeal: number;
  winRatePct: number | null;
}

async function getLeadSourceEffectiveness(tenantId: string): Promise<LeadSourceBucket[]> {
  const contacts = await prisma.contact.findMany({
    where: { tenantId, isActive: true },
    select: {
      leadSourceId: true,
      leadSource: { select: { name: true } },
      opportunityLinks: { select: { opportunity: { select: { stage: { select: { outcome: true } } } } } },
    },
  });
  const groups = new Map<string, { name: string; total: number; won: number }>();
  for (const c of contacts) {
    const key = c.leadSourceId ?? 'none';
    if (!groups.has(key)) groups.set(key, { name: c.leadSource?.name ?? 'Not set', total: 0, won: 0 });
    const g = groups.get(key)!;
    g.total += 1;
    if (c.opportunityLinks.some((l) => l.opportunity.stage.outcome === 'won')) g.won += 1;
  }
  return [...groups].map(([leadSourceId, g]) => ({
    leadSourceId: leadSourceId === 'none' ? null : leadSourceId,
    name: g.name,
    totalContacts: g.total,
    contactsWithWonDeal: g.won,
    winRatePct: pct(g.won, g.total),
  }));
}

async function getLossReasonDistribution(tenantId: string): Promise<{ lossReasonId: string | null; name: string; count: number }[]> {
  const groups = await prisma.opportunity.groupBy({
    by: ['lossReasonId'],
    where: { tenantId, isActive: true, stage: { outcome: 'lost' } },
    _count: true,
  });
  const ids = groups.map((g) => g.lossReasonId).filter((id): id is string => id !== null);
  const defs = ids.length ? await prisma.fieldCatalogDefinition.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const byId = new Map(defs.map((d) => [d.id, d.name]));
  return groups
    .map((g) => ({ lossReasonId: g.lossReasonId, name: g.lossReasonId ? (byId.get(g.lossReasonId) ?? 'Unknown') : 'Not set', count: g._count }))
    .sort((a, b) => b.count - a.count);
}

// Same query shape as the cross-tenant version in scripts/metrics-report.ts,
// scoped to one tenant.
async function getMultiThreading(tenantId: string): Promise<{ openCount: number; singleThreadedPct: number | null; multiThreadedPct: number | null }> {
  const open = await prisma.opportunity.findMany({
    where: { tenantId, isActive: true, stage: { outcome: 'open' } },
    select: { contactLinks: { select: { id: true } } },
  });
  const single = open.filter((o) => o.contactLinks.length === 1).length;
  const multi = open.filter((o) => o.contactLinks.length > 1).length;
  return { openCount: open.length, singleThreadedPct: pct(single, open.length), multiThreadedPct: pct(multi, open.length) };
}

async function getCompanyGrowth(tenantId: string, monthsBack: number): Promise<{ byMonth: { month: string; count: number }[]; byStatus: { name: string; count: number }[] }> {
  const since = monthsAgoUtc(monthsBack - 1);
  const [recent, all] = await Promise.all([
    prisma.company.findMany({ where: { tenantId, createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.company.groupBy({ by: ['statusId'], where: { tenantId }, _count: true }),
  ]);
  const months = lastNMonthKeys(monthsBack);
  const counts = new Map<string, number>(months.map((m) => [m, 0]));
  for (const c of recent) {
    const key = monthKey(c.createdAt);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const statuses = await prisma.statusDefinition.findMany({ where: { id: { in: all.map((g) => g.statusId) } }, select: { id: true, name: true } });
  const byId = new Map(statuses.map((s) => [s.id, s.name]));
  return {
    byMonth: months.map((month) => ({ month, count: counts.get(month) ?? 0 })),
    byStatus: all.map((g) => ({ name: byId.get(g.statusId) ?? 'Unknown', count: g._count })),
  };
}

interface OwnerLeaderboardEntry {
  ownerId: string;
  ownerName: string;
  openCount: number;
  openAmountByCurrency: CurrencyTotal[];
  wonCount: number;
  wonAmountByCurrency: CurrencyTotal[];
}

interface CurrencyTotal {
  currency: string;
  amountCents: number;
}

// Sensitive — this is per-person performance data inside the tenant.
// Deliberately not gated here (services don't know about roles); the route
// layer must restrict this field to owner/admin before returning it.
async function getDealsByOwner(tenantId: string): Promise<OwnerLeaderboardEntry[]> {
  const opps = await prisma.opportunity.findMany({
    where: { tenantId, isActive: true, ownerId: { not: null } },
    select: {
      ownerId: true,
      amountCents: true,
      currency: true,
      stage: { select: { outcome: true } },
      owner: { select: { firstName: true, lastName: true } },
    },
  });
  const byOwner = new Map<string, { name: string; open: Map<string, number>; won: Map<string, number>; openCount: number; wonCount: number }>();
  for (const o of opps) {
    const key = o.ownerId!;
    if (!byOwner.has(key)) {
      byOwner.set(key, { name: `${o.owner!.firstName} ${o.owner!.lastName}`, open: new Map(), won: new Map(), openCount: 0, wonCount: 0 });
    }
    const entry = byOwner.get(key)!;
    if (o.stage.outcome === 'open') {
      entry.openCount += 1;
      entry.open.set(o.currency, (entry.open.get(o.currency) ?? 0) + o.amountCents);
    } else if (o.stage.outcome === 'won') {
      entry.wonCount += 1;
      entry.won.set(o.currency, (entry.won.get(o.currency) ?? 0) + o.amountCents);
    }
  }
  const toCurrencyTotals = (m: Map<string, number>): CurrencyTotal[] => [...m].map(([currency, amountCents]) => ({ currency, amountCents }));
  return [...byOwner]
    .map(([ownerId, e]) => ({
      ownerId,
      ownerName: e.name,
      openCount: e.openCount,
      openAmountByCurrency: toCurrencyTotals(e.open),
      wonCount: e.wonCount,
      wonAmountByCurrency: toCurrencyTotals(e.won),
    }))
    .sort((a, b) => b.wonCount - a.wonCount);
}

export async function getSalesMetrics(tenantId: string, monthsBack = 6) {
  const [openPipeline, winRateAndCycle, stageVelocity, leadConversion, leadSourceEffectiveness, lossReasons, multiThreading, companyGrowth, dealsByOwner] =
    await Promise.all([
      getOpenPipelineValue(tenantId),
      getWinRateAndCycle(tenantId),
      getStageVelocity(tenantId),
      getLeadToOpportunityConversion(tenantId),
      getLeadSourceEffectiveness(tenantId),
      getLossReasonDistribution(tenantId),
      getMultiThreading(tenantId),
      getCompanyGrowth(tenantId, monthsBack),
      getDealsByOwner(tenantId),
    ]);
  return { openPipeline, winRateAndCycle, stageVelocity, leadConversion, leadSourceEffectiveness, lossReasons, multiThreading, companyGrowth, dealsByOwner };
}
