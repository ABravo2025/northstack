import prisma from '../../lib/prisma.js';
import { avg, daysBetween, median, monthKey, monthKeysInRange, pct } from './mathUtils.js';
import type { DateRange } from './dateRange.js';

function inRange(date: Date, range: DateRange): boolean {
  return date >= range.since && date <= range.until;
}

interface PipelineValueBucket {
  pipelineId: string;
  pipelineName: string;
  currency: string;
  amountCents: number;
  count: number;
}

// Not range-filtered — "what's open right now" is current state, not an
// aggregate over a period. See docs/metrics/tenant-metrics-spec.md's
// currency rule: grouped by currency, never summed across currencies.
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
  cycleDaysMedian: number | null;
  cycleSampleSize: number;
}

// Opportunity has no dedicated "closedAt" column — close date (and so the
// range filter, and cycle length) both derive from OpportunityStageHistory's
// last entry (when it entered the closing won/lost stage).
async function getWinRateAndCycle(tenantId: string, range: DateRange): Promise<WinRateResult> {
  const closedAll = await prisma.opportunity.findMany({
    where: { tenantId, isActive: true, stage: { outcome: { in: ['won', 'lost'] } } },
    select: {
      amountCents: true,
      currency: true,
      stage: { select: { outcome: true } },
      stageHistory: { select: { enteredAt: true }, orderBy: { enteredAt: 'asc' } },
    },
  });
  const closed = closedAll.filter((o) => {
    const closedAt = o.stageHistory[o.stageHistory.length - 1]?.enteredAt;
    return closedAt && inRange(closedAt, range);
  });
  const won = closed.filter((o) => o.stage.outcome === 'won');
  const lost = closed.filter((o) => o.stage.outcome === 'lost');

  const byCurrency = new Map<string, number[]>();
  for (const o of won) {
    if (!byCurrency.has(o.currency)) byCurrency.set(o.currency, []);
    byCurrency.get(o.currency)!.push(o.amountCents);
  }
  // `amounts` is never empty here — every entry in byCurrency had at least one amount pushed onto
  // it at the point it was created, in the loop just above.
  const dealSizeByCurrency = [...byCurrency].map(([currency, amounts]) => ({
    currency,
    medianAmountCents: Math.round(median(amounts) ?? 0),
    avgAmountCents: Math.round(avg(amounts) ?? 0),
    sampleSize: amounts.length,
  }));

  const cycleDays = closed
    .filter((o) => o.stageHistory.length >= 2)
    .map((o) => daysBetween(o.stageHistory[0].enteredAt, o.stageHistory[o.stageHistory.length - 1].enteredAt));
  const cycleDaysMedianValue = median(cycleDays);

  return {
    winRatePct: pct(won.length, won.length + lost.length),
    wonCount: won.length,
    lostCount: lost.length,
    dealSizeByCurrency,
    cycleDaysMedian: cycleDaysMedianValue === null ? null : Math.round(cycleDaysMedianValue * 10) / 10,
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

// Not range-filtered, on purpose, even though everything else on this page
// is: the historical median needs a large enough sample to mean anything, and
// a narrow date range (e.g. "today") would starve it to noise. It's a
// standing baseline, not a period metric — same reasoning for `atRisk`, which
// is about which deals are stuck *right now*, not during some past window.
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

  // v.days is never empty here — same reasoning as dealSizeByCurrency above: each entry in
  // durationsByStage had a day-count pushed onto it at the point it was created.
  const byStage = [...durationsByStage].map(([stageId, v]) => ({
    stageId,
    stageName: v.name,
    pipelineName: v.pipelineName,
    historicalMedianDays: Math.round((median(v.days) ?? 0) * 10) / 10,
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

async function getLeadToOpportunityConversion(
  tenantId: string,
  range: DateRange,
): Promise<{ leadsWithOpportunity: number; totalLeads: number; conversionPct: number | null }> {
  const leads = await prisma.contact.findMany({
    where: { tenantId, isActive: true, leadStatus: { not: null }, createdAt: { gte: range.since, lte: range.until } },
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

async function getLeadSourceEffectiveness(tenantId: string, range: DateRange): Promise<LeadSourceBucket[]> {
  const contacts = await prisma.contact.findMany({
    where: { tenantId, isActive: true, createdAt: { gte: range.since, lte: range.until } },
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

async function getLossReasonDistribution(tenantId: string, range: DateRange): Promise<{ lossReasonId: string | null; name: string; count: number }[]> {
  const lost = await prisma.opportunity.findMany({
    where: { tenantId, isActive: true, stage: { outcome: 'lost' } },
    select: { lossReasonId: true, stageHistory: { select: { enteredAt: true }, orderBy: { enteredAt: 'desc' }, take: 1 } },
  });
  const inWindow = lost.filter((o) => {
    const closedAt = o.stageHistory[0]?.enteredAt;
    return closedAt && inRange(closedAt, range);
  });
  const counts = new Map<string, number>();
  for (const o of inWindow) {
    const key = o.lossReasonId ?? 'none';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ids = [...counts.keys()].filter((id) => id !== 'none');
  const defs = ids.length ? await prisma.fieldCatalogDefinition.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const byId = new Map(defs.map((d) => [d.id, d.name]));
  return [...counts]
    .map(([lossReasonId, count]) => ({
      lossReasonId: lossReasonId === 'none' ? null : lossReasonId,
      name: lossReasonId === 'none' ? 'Not set' : (byId.get(lossReasonId) ?? 'Unknown'),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

// Not range-filtered — a current snapshot of open deals, same reasoning as
// getOpenPipelineValue. Same query shape as the cross-tenant version in
// scripts/metrics-report.ts, scoped to one tenant.
async function getMultiThreading(tenantId: string): Promise<{ openCount: number; singleThreadedPct: number | null; multiThreadedPct: number | null }> {
  const open = await prisma.opportunity.findMany({
    where: { tenantId, isActive: true, stage: { outcome: 'open' } },
    select: { contactLinks: { select: { id: true } } },
  });
  const single = open.filter((o) => o.contactLinks.length === 1).length;
  const multi = open.filter((o) => o.contactLinks.length > 1).length;
  return { openCount: open.length, singleThreadedPct: pct(single, open.length), multiThreadedPct: pct(multi, open.length) };
}

async function getCompanyGrowth(
  tenantId: string,
  range: DateRange,
): Promise<{ byMonth: { month: string; count: number }[]; byStatus: { name: string; count: number }[] }> {
  const [inWindow, all] = await Promise.all([
    prisma.company.findMany({ where: { tenantId, createdAt: { gte: range.since, lte: range.until } }, select: { createdAt: true } }),
    // byStatus is current state (Prospect/Customer/Churned right now), not range-filtered.
    prisma.company.groupBy({ by: ['statusId'], where: { tenantId }, _count: true }),
  ]);
  const months = monthKeysInRange(range.since, range.until);
  const counts = new Map<string, number>(months.map((m) => [m, 0]));
  for (const c of inWindow) {
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
// `open*` fields are current state (unfiltered); `won*` fields are filtered
// to deals closed within `range`, same reasoning as getWinRateAndCycle.
async function getDealsByOwner(tenantId: string, range: DateRange): Promise<OwnerLeaderboardEntry[]> {
  const opps = await prisma.opportunity.findMany({
    where: { tenantId, isActive: true, ownerId: { not: null } },
    select: {
      ownerId: true,
      amountCents: true,
      currency: true,
      stage: { select: { outcome: true } },
      owner: { select: { firstName: true, lastName: true } },
      stageHistory: { select: { enteredAt: true }, orderBy: { enteredAt: 'desc' }, take: 1 },
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
      const closedAt = o.stageHistory[0]?.enteredAt;
      if (closedAt && inRange(closedAt, range)) {
        entry.wonCount += 1;
        entry.won.set(o.currency, (entry.won.get(o.currency) ?? 0) + o.amountCents);
      }
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

export async function getSalesMetrics(tenantId: string, range: DateRange) {
  const [openPipeline, winRateAndCycle, stageVelocity, leadConversion, leadSourceEffectiveness, lossReasons, multiThreading, companyGrowth, dealsByOwner] =
    await Promise.all([
      getOpenPipelineValue(tenantId),
      getWinRateAndCycle(tenantId, range),
      getStageVelocity(tenantId),
      getLeadToOpportunityConversion(tenantId, range),
      getLeadSourceEffectiveness(tenantId, range),
      getLossReasonDistribution(tenantId, range),
      getMultiThreading(tenantId),
      getCompanyGrowth(tenantId, range),
      getDealsByOwner(tenantId, range),
    ]);
  return { openPipeline, winRateAndCycle, stageVelocity, leadConversion, leadSourceEffectiveness, lossReasons, multiThreading, companyGrowth, dealsByOwner };
}
