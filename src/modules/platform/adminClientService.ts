import type { ActivityEntityType, PlanTier, SubscriptionStatus, TenantStatus } from '@prisma/client';
import prisma from '../../lib/prisma.js';
import { PRICING, MIN_USERS } from '../../config/pricing.js';
import { PLAN_LIMITS, activeOverride, getEffectivePlan, getPlanLimits } from '../tenant/planLimits.js';
import { listAudit } from './adminActionService.js';

// Admin Center v2 (2026-10-03) — the read side of the new Admin Center: client list, client
// detail and the business overview. Read-only on purpose (stage 1): nothing here writes, calls a
// payment provider or syncs prices — MRR is computed from what's already stored.
//
// Health score (Alejandro, 2026-10-03): team access 40% + modules in use 25% + payments up to
// date 25% + user growth 10%, each part 0–100. Pure functions below so the formula is testable
// and easy to retune once there's real data.

const DAY = 24 * 60 * 60 * 1000;

export type ModuleKey = 'people' | 'timeoff' | 'sales' | 'tasks' | 'payroll' | 'payments';

// Which activity-log entity types count as "using" each module. Only writes are logged, so
// "using" means creating/editing something there in the window, not just looking.
export const MODULE_ENTITIES: Record<ModuleKey, ActivityEntityType[]> = {
  people: ['employee', 'employeeTermination', 'customFieldDefinition', 'fieldCatalogDefinition', 'invitation', 'user'],
  timeoff: ['timeOffPolicy', 'timeOffRequest', 'timeOffAdjustment', 'timeOffSettings'],
  sales: ['company', 'contact', 'opportunity', 'pipeline', 'pipelineStage', 'publicForm'],
  tasks: ['task', 'note'],
  payroll: ['employeeCompensation', 'payrollRun', 'payFrequency', 'paymentMethod'],
  payments: ['stripeConnection', 'stripeInvoice'],
};

export function moduleForEntity(entityType: ActivityEntityType): ModuleKey | null {
  for (const [key, types] of Object.entries(MODULE_ENTITIES) as [ModuleKey, ActivityEntityType[]][]) {
    if (types.includes(entityType)) return key;
  }
  return null;
}

// Modules the tenant's plan includes (what "modules in use" is measured against).
export function availableModules(plan: PlanTier | null): ModuleKey[] {
  const limits = getPlanLimits({ plan });
  const mods: ModuleKey[] = ['people', 'timeoff', 'sales', 'tasks'];
  if (limits.payrollEnabled) mods.push('payroll');
  return mods;
}

// The status shown in the Admin. "Active" only means a paying customer (a payment method is
// attached); a tenant that never attached one is in its trial, past it ("expired") or an old
// account from before plans existed ("no_plan" - no trial date at all). "cancelling" = asked to
// cancel, still paid up until the period ends.
export type ClientStatus = 'trialing' | 'expired' | 'no_plan' | 'active' | 'cancelling' | 'past_due' | 'suspended' | 'cancelled';

export function clientStatus(
  tenant: { status: TenantStatus; trialEndsAt: Date | null },
  sub: { status: SubscriptionStatus; cancelledAt: Date | null; provider: string | null } | null,
  now: Date = new Date(),
): ClientStatus {
  if (tenant.status === 'cancelled') return 'cancelled';
  if (tenant.status === 'suspended') return 'suspended';
  if (!sub?.provider) {
    if (!tenant.trialEndsAt) return 'no_plan';
    return tenant.trialEndsAt > now ? 'trialing' : 'expired';
  }
  if (tenant.status === 'past_due' || sub.status === 'past_due') return 'past_due';
  if (sub.cancelledAt && sub.status === 'active') return 'cancelling';
  return 'active';
}

export interface HealthInput {
  status: ClientStatus;
  activeUsers: number;
  usersSeenLast7d: number;
  modulesUsed30d: number;
  modulesAvailable: number;
  usersNow: number;
  users30dAgo: number;
}

export interface HealthBreakdown {
  score: number;
  access: number;
  modules: number;
  payments: number;
  growth: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function healthScore(h: HealthInput): HealthBreakdown {
  const access = h.activeUsers > 0 ? clamp((h.usersSeenLast7d / h.activeUsers) * 100) : 0;
  const modules = h.modulesAvailable > 0 ? clamp((h.modulesUsed30d / h.modulesAvailable) * 100) : 0;
  const payments = { trialing: 100, active: 100, no_plan: 50, cancelling: 50, expired: 0, past_due: 0, suspended: 0, cancelled: 0 }[h.status];
  // 50 = same size as 30 days ago; +/- 50 for doubling/halving. A team that didn't exist 30 days
  // ago and has users now counts as growing.
  const growth = h.users30dAgo > 0 ? clamp(50 + ((h.usersNow - h.users30dAgo) / h.users30dAgo) * 50) : h.usersNow > 0 ? 75 : 0;
  const score = clamp(access * 0.4 + modules * 0.25 + payments * 0.25 + growth * 0.1);
  return { score, access, modules, payments, growth };
}

export interface Attention {
  level: 'bad' | 'warn';
  kind: 'payment_failed' | 'trial_ending' | 'inactive' | 'cancelling' | 'grace';
  daysLeft?: number;
  days?: number;
}

export function attentionFor(input: {
  status: ClientStatus;
  plan: PlanTier | null;
  trialEndsAt: Date | null;
  gracePeriodEndsAt: Date | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  now?: Date;
}): Attention[] {
  const now = input.now ?? new Date();
  const out: Attention[] = [];
  if (input.status === 'past_due') out.push({ level: 'bad', kind: 'payment_failed' });
  if (input.status === 'trialing' && !input.plan && input.trialEndsAt) {
    const daysLeft = Math.ceil((input.trialEndsAt.getTime() - now.getTime()) / DAY);
    if (daysLeft <= 3) out.push({ level: 'warn', kind: 'trial_ending', daysLeft });
  }
  if (input.gracePeriodEndsAt && input.gracePeriodEndsAt > now) {
    out.push({ level: 'warn', kind: 'grace', daysLeft: Math.ceil((input.gracePeriodEndsAt.getTime() - now.getTime()) / DAY) });
  }
  if (input.status === 'active' || input.status === 'trialing' || input.status === 'past_due' || input.status === 'cancelling') {
    const since = input.lastSeenAt ?? input.createdAt;
    const days = Math.floor((now.getTime() - since.getTime()) / DAY);
    if (days >= 7) out.push({ level: 'warn', kind: 'inactive', days });
  }
  if (input.status === 'cancelling') out.push({ level: 'warn', kind: 'cancelling' });
  return out;
}

// Monthly recurring revenue in the subscription's own currency (minor units): the locked base
// price + active users beyond the included seats at the locked seat price. Zero unless the tenant
// actually pays (a provider is attached and the subscription is active, past due or cancelling).
export function monthlyRevenueCents(input: {
  plan: PlanTier | null;
  activeUsers: number;
  sub: { status: SubscriptionStatus; provider: string | null; lockedPriceCents: number; currency: string; extraSeatPriceCents: number | null } | null;
}): number {
  const { sub, plan } = input;
  if (!sub || !plan || !sub.provider) return 0;
  if (sub.status !== 'active' && sub.status !== 'past_due') return 0;
  const pricedPlan = plan === 'growth' ? 'growth' : 'starter';
  const included = PRICING.includedSeats[pricedPlan];
  const extra = Math.max(0, input.activeUsers - included);
  const market = sub.currency === 'ARS' ? 'ar' : 'international';
  const seat = sub.extraSeatPriceCents ?? PRICING.markets[market].extraSeat[pricedPlan];
  return sub.lockedPriceCents + extra * seat;
}

// ---------------------------------------------------------------------------------------------
// Loaders

async function loadClientRows(now: Date, onlyTenantId?: string) {
  const since30 = new Date(now.getTime() - 30 * DAY);
  const since7 = new Date(now.getTime() - 7 * DAY);
  const since90 = new Date(now.getTime() - 90 * DAY);
  const byTenant = onlyTenantId ? { tenantId: onlyTenantId } : {};
  const [tenants, users, moduleUse, openTickets, sessions, writes] = await Promise.all([
    prisma.tenant.findMany({
      where: onlyTenantId ? { id: onlyTenantId } : {},
      select: {
        id: true, name: true, slug: true, status: true, createdAt: true, country: true, industry: true, companySize: true,
        currency: true, plan: true, trialEndsAt: true, gracePeriodEndsAt: true, acquisitionChannel: true, legalName: true, website: true, phone: true, planOverride: true, deletionScheduledAt: true,
        subscription: {
          select: {
            status: true, provider: true, lockedPriceCents: true, currency: true, currentPeriodEnd: true, cancelledAt: true,
            cancellationEffectiveAt: true, cancellationReason: true, paymentMethodBrand: true, paymentMethodLast4: true, trialEndsAt: true,
            planPrice: { select: { extraSeatPriceCents: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findMany({
      where: { tenantId: onlyTenantId ?? { not: null }, platformRole: null },
      select: { id: true, tenantId: true, status: true, role: true, createdAt: true, lastSeenAt: true, firstName: true, lastName: true, email: true },
    }),
    prisma.activityLogEntry.groupBy({ by: ['tenantId', 'entityType'], where: { ...byTenant, changedAt: { gte: since30 } }, _count: { _all: true } }),
    prisma.ticket.groupBy({ by: ['tenantId'], where: { ...byTenant, status: { isTerminal: false } }, _count: { _all: true } }),
    // User.lastSeenAt only exists since 2026-10-03; logins (sessions) and logged changes from the
    // last 90 days fill in "last activity" for everything before that.
    prisma.session.groupBy({ by: ['userId'], where: { createdAt: { gte: since90 }, ...(onlyTenantId ? { user: { tenantId: onlyTenantId } } : {}) }, _max: { createdAt: true } }),
    prisma.activityLogEntry.groupBy({ by: ['changedByUserId'], where: { ...byTenant, changedAt: { gte: since90 } }, _max: { changedAt: true } }),
  ]);

  const lastLogin = new Map(sessions.map((x) => [x.userId, x._max.createdAt]));
  const lastWrite = new Map(writes.map((w) => [w.changedByUserId, w._max.changedAt]));
  const latest = (...dates: (Date | null | undefined)[]) => dates.reduce<Date | null>((m, d) => (d && (!m || d > m) ? d : m), null);
  for (const u of users) u.lastSeenAt = latest(u.lastSeenAt, lastLogin.get(u.id), lastWrite.get(u.id));

  const usersByTenant = new Map<string, typeof users>();
  for (const u of users) {
    if (!u.tenantId) continue;
    const list = usersByTenant.get(u.tenantId) ?? [];
    list.push(u);
    usersByTenant.set(u.tenantId, list);
  }
  const modulesByTenant = new Map<string, Set<ModuleKey>>();
  for (const row of moduleUse) {
    const mod = moduleForEntity(row.entityType);
    if (!mod) continue;
    const set = modulesByTenant.get(row.tenantId) ?? new Set<ModuleKey>();
    set.add(mod);
    modulesByTenant.set(row.tenantId, set);
  }
  const ticketsByTenant = new Map(openTickets.map((t) => [t.tenantId, t._count._all]));

  return tenants.map((t) => {
    const tUsers = usersByTenant.get(t.id) ?? [];
    const active = tUsers.filter((u) => u.status === 'active');
    const owner = tUsers.find((u) => u.role === 'owner') ?? tUsers[0] ?? null;
    const lastSeenAt = tUsers.reduce<Date | null>((max, u) => (u.lastSeenAt && (!max || u.lastSeenAt > max) ? u.lastSeenAt : max), null);
    const status = clientStatus(t, t.subscription, now);
    const avail = availableModules(t.plan);
    const used = [...(modulesByTenant.get(t.id) ?? [])].filter((m) => avail.includes(m));
    const health = healthScore({
      status,
      activeUsers: active.length,
      usersSeenLast7d: active.filter((u) => u.lastSeenAt && u.lastSeenAt >= since7).length,
      modulesUsed30d: used.length,
      modulesAvailable: avail.length,
      usersNow: active.length,
      users30dAgo: active.filter((u) => u.createdAt <= since30).length,
    });
    const sub = t.subscription;
    const mrrCents = monthlyRevenueCents({
      plan: t.plan,
      activeUsers: active.length,
      sub: sub ? { ...sub, extraSeatPriceCents: sub.planPrice?.extraSeatPriceCents ?? null } : null,
    });
    return {
      tenant: t,
      users: tUsers,
      row: {
        id: t.id,
        name: t.name,
        slug: t.slug,
        country: t.country,
        industry: t.industry,
        createdAt: t.createdAt,
        status,
        plan: t.plan,
        activeUsers: active.length,
        billedUsers: t.plan ? Math.max(active.length, MIN_USERS) : null,
        mrrCents,
        currency: sub?.currency ?? t.currency,
        health,
        lastSeenAt,
        trialEndsAt: t.trialEndsAt,
        nextChargeAt: sub?.provider && status !== 'cancelling' ? sub.currentPeriodEnd : null,
        owner: owner ? { name: `${owner.firstName} ${owner.lastName}`.trim(), email: owner.email } : null,
        openTickets: ticketsByTenant.get(t.id) ?? 0,
        hasAgreement: activeOverride(t.planOverride, now) !== null,
        deletionScheduledAt: t.deletionScheduledAt,
        attention: attentionFor({ status, plan: t.plan, trialEndsAt: t.trialEndsAt, gracePeriodEndsAt: t.gracePeriodEndsAt, lastSeenAt, createdAt: t.createdAt, now }),
      },
    };
  });
}

export type ClientRow = Awaited<ReturnType<typeof loadClientRows>>[number]['row'];

export async function listClients(now = new Date()): Promise<ClientRow[]> {
  return (await loadClientRows(now)).map((r) => r.row);
}

export async function getClientDetail(tenantId: string, now = new Date()) {
  const [found] = await loadClientRows(now, tenantId);
  if (!found) return null;
  const { tenant, users, row } = found;
  const since30 = new Date(now.getTime() - 30 * DAY);

  const [days, activity, invoices, tickets, recentEvents, staffActions] = await Promise.all([
    prisma.userActivityDay.groupBy({ by: ['day'], where: { tenantId, day: { gte: since30 } }, _count: { _all: true } }),
    prisma.activityLogEntry.findMany({
      where: { tenantId, changedAt: { gte: since30 } },
      select: { entityType: true, changedByUserId: true, changedAt: true },
    }),
    prisma.invoice.findMany({
      where: { subscription: { tenantId } },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: { id: true, amountCents: true, currency: true, status: true, periodStart: true, periodEnd: true, paidAt: true, createdAt: true, provider: true },
    }),
    prisma.ticket.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, subject: true, createdAt: true, status: { select: { label: true, isTerminal: true, color: true } }, user: { select: { firstName: true, lastName: true } } },
    }),
    prisma.activityLogEntry.findMany({
      where: { tenantId, entityType: { in: ['subscription', 'tenant', 'invitation'] } },
      orderBy: { changedAt: 'desc' },
      take: 30,
      select: { id: true, summary: true, changedAt: true, entityType: true, changedBy: { select: { firstName: true, lastName: true, platformRole: true } } },
    }),
    listAudit({ tenantId, take: 50 }),
  ]);

  // Active users per UTC day, last 30 days (zeros filled in).
  const byDay = new Map(days.map((d) => [d.day.toISOString().slice(0, 10), d._count._all]));
  const dailyActive = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(now.getTime() - (29 - i) * DAY).toISOString().slice(0, 10);
    return { date, users: byDay.get(date) ?? 0 };
  });

  // Per-module usage: distinct users, number of changes and last change in 30 days.
  const avail = availableModules(tenant.plan);
  const activeCount = row.activeUsers || 1;
  const usage = (Object.keys(MODULE_ENTITIES) as ModuleKey[]).map((key) => {
    const entries = activity.filter((a) => MODULE_ENTITIES[key].includes(a.entityType));
    const people = new Set(entries.map((e) => e.changedByUserId)).size;
    const last = entries.reduce<Date | null>((m, e) => (!m || e.changedAt > m ? e.changedAt : m), null);
    return { module: key, included: key === 'payments' ? getPlanLimits({ plan: tenant.plan }).paymentsEnabled : avail.includes(key), users: people, adoptionPct: Math.min(100, Math.round((people / activeCount) * 100)), changes: entries.length, lastUsedAt: last };
  });

  // Account timeline: what's stored, newest first.
  const sub = tenant.subscription;
  const timeline: { at: Date; kind: string; text: string; by: string | null }[] = [
    { at: tenant.createdAt, kind: 'signup', text: 'signup', by: row.owner?.name ?? null },
    ...invoices.map((inv) => ({ at: inv.paidAt ?? inv.createdAt, kind: inv.status === 'paid' ? 'invoice_paid' : inv.status === 'failed' ? 'invoice_failed' : 'invoice_' + inv.status, text: `${inv.amountCents}|${inv.currency}`, by: inv.provider })),
    ...staffActions.map((a) => ({ at: a.createdAt, kind: 'staff_' + a.action, text: a.reason, by: `${a.actor} (Northstack)` })),
    ...recentEvents.map((e) => ({ at: e.changedAt, kind: 'log', text: e.summary, by: `${e.changedBy.firstName} ${e.changedBy.lastName}`.trim() + (e.changedBy.platformRole ? ' (Northstack)' : '') })),
  ];
  if (sub?.cancelledAt) timeline.push({ at: sub.cancelledAt, kind: 'cancel_requested', text: sub.cancellationReason ?? '', by: row.owner?.name ?? null });
  timeline.sort((a, b) => b.at.getTime() - a.at.getTime());

  const rawAgreement = tenant.planOverride && typeof tenant.planOverride === 'object' ? (tenant.planOverride as Record<string, unknown>) : null;
  const agreement = rawAgreement
    ? { ...rawAgreement, active: activeOverride(tenant.planOverride, now) !== null }
    : null;

  return {
    ...row,
    planLimits: PLAN_LIMITS[getEffectivePlan(tenant)],
    effectiveLimits: getPlanLimits(tenant, now),
    agreement,
    company: {
      legalName: tenant.legalName,
      website: tenant.website,
      phone: tenant.phone,
      companySize: tenant.companySize,
      acquisitionChannel: tenant.acquisitionChannel,
      currency: tenant.currency,
    },
    subscription: sub
      ? {
          status: sub.status,
          provider: sub.provider,
          currency: sub.currency,
          lockedPriceCents: sub.lockedPriceCents,
          extraSeatPriceCents: sub.planPrice?.extraSeatPriceCents ?? null,
          currentPeriodEnd: sub.currentPeriodEnd,
          cancelledAt: sub.cancelledAt,
          cancellationEffectiveAt: sub.cancellationEffectiveAt,
          cancellationReason: sub.cancellationReason,
          card: sub.paymentMethodLast4 ? `${sub.paymentMethodBrand ?? ''} •••• ${sub.paymentMethodLast4}`.trim() : null,
        }
      : null,
    users: users
      .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email, role: u.role, status: u.status, lastSeenAt: u.lastSeenAt, createdAt: u.createdAt }))
      .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.name.localeCompare(b.name))),
    dailyActive,
    usage,
    invoices,
    tickets: tickets.map((t) => ({ id: t.id, subject: t.subject, createdAt: t.createdAt, status: t.status.label, open: !t.status.isTerminal, color: t.status.color, reporter: t.user ? `${t.user.firstName} ${t.user.lastName}`.trim() : null })),
    timeline: timeline.slice(0, 40),
  };
}

export async function getOverview(now = new Date()) {
  const rows = await listClients(now);
  const paying = rows.filter((r) => r.mrrCents > 0);
  const mrrByCurrency: Record<string, number> = {};
  for (const r of paying) mrrByCurrency[r.currency] = (mrrByCurrency[r.currency] ?? 0) + r.mrrCents;

  // Trial conversion over tenants created 15–75 days ago (their 15-day trial has ended).
  const from = new Date(now.getTime() - 75 * DAY), to = new Date(now.getTime() - 15 * DAY);
  const cohort = rows.filter((r) => r.createdAt >= from && r.createdAt <= to);
  const converted = cohort.filter((r) => r.plan !== null && r.status !== 'trialing').length;

  // Sign-ups per ISO week (Monday start), last 8 weeks, and how many of those now pay.
  const monday = new Date(now); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(monday.getTime() - (7 - i) * 7 * DAY), end = new Date(start.getTime() + 7 * DAY);
    const inWeek = rows.filter((r) => r.createdAt >= start && r.createdAt < end);
    return { weekStart: start.toISOString().slice(0, 10), signups: inWeek.length, paying: inWeek.filter((r) => r.mrrCents > 0).length };
  });

  const openTickets = await prisma.ticket.count({ where: { status: { isTerminal: false } } });
  return {
    clients: rows.length,
    payingClients: paying.length,
    trialing: rows.filter((r) => r.status === 'trialing').length,
    activeUsers: rows.filter((r) => r.status !== 'suspended' && r.status !== 'cancelled').reduce((s, r) => s + r.activeUsers, 0),
    mrrByCurrency,
    trialConversion: cohort.length ? { pct: Math.round((converted / cohort.length) * 100), cohort: cohort.length } : null,
    openTickets,
    // Paying clients only: a plan picked during the trial without a payment method doesn't count.
    byPlan: { growth: paying.filter((r) => r.plan === 'growth').length, starter: paying.filter((r) => r.plan !== 'growth').length, none: rows.length - paying.length },
    weeks,
    attention: rows.filter((r) => r.attention.length).map((r) => ({ id: r.id, name: r.name, attention: r.attention })),
    recentSignups: rows.slice(0, 5).map((r) => ({ id: r.id, name: r.name, country: r.country, industry: r.industry, status: r.status, createdAt: r.createdAt })),
  };
}
