import prisma from '../../lib/prisma.js';
import { createExtraSeatAddon, createRecurringProduct, legacyExtraSeatAddonMatching } from '../../lib/dodopayments.js';
import { ADDONS, LAUNCH_ENDS_AT, MIN_USERS, PER_USER, PRICING, TRIAL_DAYS, billingMarkets, isLaunchPeriod, type Market, type PricedPlan } from '../../config/pricing.js';
import { PLAN_LIMITS, type PlanLimits } from './planLimits.js';
import type { PaymentProvider, PlanPrice } from '@prisma/client';

// Turns src/config/pricing.ts (the one place prices are defined) into what billing actually
// charges: PlanPrice rows, plus the Dodo Product/Addon each international row needs. Replaces
// scripts/seed-plan-prices.ts + scripts/setup-dodo-products.ts, which had to be run by hand per
// environment after every price change (2026-09-26).
//
// A price change INSERTS a new row, never edits one — existing subscribers stay pinned to the row
// they were confirmed on (Subscription.planPriceId), so their price doesn't move.

export function marketForProvider(provider: PaymentProvider | null, country: string | null): Market {
  if (provider) return provider === 'mercadopago' ? 'ar' : 'international';
  return country === 'Argentina' ? 'ar' : 'international';
}

// Serializes concurrent syncs (two checkouts right after a deploy) so neither inserts a duplicate
// row. DB-only work under it — Dodo provisioning (ensureDodoObjects) never takes it.
// Transaction-scoped: released on commit/rollback.
const SYNC_LOCK_KEY = 7_202_609_26;

// Per-process memo so the DB is only consulted once per config change per warm instance.
let syncedConfig: string | null = null;

// Makes the latest row of every plan/market match PRICING. Cheap after the first call.
export async function ensurePlanPricesSynced(): Promise<void> {
  const markets = billingMarkets();
  const config = JSON.stringify(markets);
  if (syncedConfig === config) return;

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SYNC_LOCK_KEY})`;
      for (const market of Object.keys(markets) as Market[]) {
        const { currency, plans, extraSeat: seatByPlan } = markets[market];
        for (const plan of Object.keys(plans) as PricedPlan[]) {
          const priceCents = plans[plan];
          const extraSeat = seatByPlan[plan]; // per-user price — per plan since 2026-10-02
          const latest = await tx.planPrice.findFirst({ where: { plan, market }, orderBy: { effectiveFrom: 'desc' } });
          const samePlanPrice = latest?.launchPriceCents === priceCents && latest.currency === currency;
          const sameSeatPrice = latest?.extraSeatPriceCents === extraSeat && latest.currency === currency;
          if (samePlanPrice && sameSeatPrice) continue;

          await tx.planPrice.create({
            data: {
              plan,
              market,
              currency,
              launchPriceCents: priceCents,
              // Regular (post-launch) base for the same MIN_USERS — display/history; billing uses launchPriceCents.
              regularPriceCents: PER_USER[market].regular[plan] * MIN_USERS,
              extraSeatPriceCents: extraSeat,
              // Dodo objects are priced, so they carry over only when their own price didn't change.
              dodoProductId: samePlanPrice ? latest!.dodoProductId : null,
              dodoExtraSeatAddonId: sameSeatPrice ? latest!.dodoExtraSeatAddonId : null,
            },
          });
        }
      }
    },
    { timeout: 30_000 },
  );

  syncedConfig = config;
}

// Fills the latest international row's missing Dodo Product/Addon. Separate from the sync above so
// Mercado Pago checkouts (and local dev without Dodo credentials) never call Dodo.
//
// Deliberately NOT inside a transaction or advisory lock (2026-10-26 review): holding one across
// Dodo's API calls queued every concurrent checkout and webhook behind a slow Dodo, and a timeout
// rolled back the saved ids of objects Dodo had already created. Instead each object is saved the
// moment it exists, with a conditional write — if a concurrent request saved one first, theirs is
// kept and ours stays unused in Dodo (never attached to any subscription, so harmless).
function needsDodoObjects(row: PlanPrice): boolean {
  return (row.launchPriceCents > 0 && !row.dodoProductId) || (row.extraSeatPriceCents > 0 && !row.dodoExtraSeatAddonId);
}

async function ensureDodoObjects(row: PlanPrice): Promise<PlanPrice> {
  if (!needsDodoObjects(row)) return row;
  // A concurrent request may have provisioned them since `row` was read.
  const fresh = await prisma.planPrice.findUniqueOrThrow({ where: { id: row.id } });
  if (!needsDodoObjects(fresh)) return fresh;

  if (fresh.launchPriceCents > 0 && !fresh.dodoProductId) {
    const productId = await createRecurringProduct({ name: `Northstack — ${fresh.plan}`, priceCents: fresh.launchPriceCents });
    const saved = await prisma.planPrice.updateMany({ where: { id: fresh.id, dodoProductId: null }, data: { dodoProductId: productId } });
    if (saved.count === 0) console.warn(`PlanPrice ${fresh.id}: concurrent request provisioned the Dodo product first, ${productId} left unused`);
  }
  if (fresh.extraSeatPriceCents > 0 && !fresh.dodoExtraSeatAddonId) {
    // Another row (either plan) with the same seat price may already have an addon for it.
    const sibling = await prisma.planPrice.findFirst({
      where: { market: fresh.market, extraSeatPriceCents: fresh.extraSeatPriceCents, dodoExtraSeatAddonId: { not: null } },
      orderBy: { effectiveFrom: 'desc' },
    });
    const addonId =
      sibling?.dodoExtraSeatAddonId ??
      (await legacyExtraSeatAddonMatching(fresh.extraSeatPriceCents)) ??
      (await createExtraSeatAddon(fresh.extraSeatPriceCents));
    await prisma.planPrice.updateMany({ where: { id: fresh.id, dodoExtraSeatAddonId: null }, data: { dodoExtraSeatAddonId: addonId } });
  }
  return prisma.planPrice.findUniqueOrThrow({ where: { id: fresh.id } });
}

// The row a NEW checkout or plan change is priced from. Null when the plan isn't sold in that
// market yet (price 0 in PRICING) — callers turn that into a "not available" error.
export async function currentPlanPrice(plan: PricedPlan, market: Market): Promise<PlanPrice | null> {
  await ensurePlanPricesSynced();
  const row = await prisma.planPrice.findFirst({ where: { plan, market }, orderBy: { effectiveFrom: 'desc' } });
  if (!row || row.launchPriceCents <= 0) return null;
  return market === 'international' ? ensureDodoObjects(row) : row;
}

// The row an EXISTING subscription keeps paying (grandfathered). A subscription confirmed before
// planPriceId existed resolves to the latest row of its plan/market at the base price it actually
// pays (lockedPriceCents) — the current row normally, an older one once PRICING has moved on — and
// gets pinned to it right here (self-healing, no backfill script), so a later change in PRICING no
// longer moves it. Never the current row at a different price: seat billing against that would
// reprice a grandfathered subscriber (2026-10-26 review). No row at that price → null, and callers
// leave billing as it is rather than guess.
export async function lockedPlanPrice(
  subscription: { id: string; planPriceId: string | null; plan: PricedPlan; provider: PaymentProvider | null; lockedPriceCents: number },
  market: Market,
): Promise<PlanPrice | null> {
  if (subscription.planPriceId) {
    const row = await prisma.planPrice.findUnique({ where: { id: subscription.planPriceId } });
    if (row) return row;
  }
  await ensurePlanPricesSynced();
  const row = await prisma.planPrice.findFirst({
    where: { plan: subscription.plan, market, launchPriceCents: subscription.lockedPriceCents },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!row || row.launchPriceCents <= 0) {
    console.warn(`Subscription ${subscription.id}: no ${subscription.plan}/${market} PlanPrice at ${subscription.lockedPriceCents}, billing left unchanged`);
    return null;
  }
  if (subscription.provider) {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { planPriceId: row.id } });
  }
  return row;
}

// Recurring amount for a Mercado Pago preapproval — decimal major units (MP's API takes ARS, not
// centavos), base plan + extra seats at the row's own seat price.
export function mercadoPagoAmount(row: Pick<PlanPrice, 'launchPriceCents' | 'extraSeatPriceCents'>, extraSeats: number): number {
  return (row.launchPriceCents + extraSeats * row.extraSeatPriceCents) / 100;
}

// What each plan includes, as sold (no per-client agreement) — the numbers the plans comparison
// shows in the app and on the landing (2026-10-14 plan review), so neither hardcodes "5 projects".
// null = unlimited. freeTrialSeatCap is left out: it's the trial's, not a plan's (top-level below).
type PublicPlanLimits = Omit<PlanLimits, 'freeTrialSeatCap'>;
function publicLimits(plan: PricedPlan): PublicPlanLimits {
  const { freeTrialSeatCap: _trialCap, ...rest } = PLAN_LIMITS[plan];
  return rest;
}

// What GET /api/plans/prices serves — the app UI and the landing render every price from this.
export function publicPricing() {
  const markets = billingMarkets();
  const withCompat = (m: Market) => ({
    ...markets[m],
    // Per-plan since 2026-10-02; extraSeat stays a number (Starter's) for clients built on the old shape.
    extraSeatByPlan: markets[m].extraSeat,
    extraSeat: markets[m].extraSeat.starter,
    perUser: { launch: PER_USER[m].launch, regular: PER_USER[m].regular },
  });
  return {
    model: 'per_user' as const,
    minUsers: MIN_USERS,
    launchEndsAt: LAUNCH_ENDS_AT,
    isLaunch: isLaunchPeriod(),
    addons: ADDONS,
    markets: { international: withCompat('international'), ar: withCompat('ar') },
    includedSeats: PRICING.includedSeats,
    freeTrialSeatCap: PRICING.freeTrialSeatCap,
    trialDays: TRIAL_DAYS,
    limits: { starter: publicLimits('starter'), growth: publicLimits('growth') },
    // Kept for any client still on the pre-2026-09-26 shape (USD plan prices only).
    prices: markets.international.plans,
  };
}
