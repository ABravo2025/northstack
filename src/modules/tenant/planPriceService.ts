import prisma from '../../lib/prisma.js';
import { createExtraSeatAddon, createRecurringProduct, legacyExtraSeatAddonMatching } from '../../lib/dodopayments.js';
import { PRICING, type Market, type PricedPlan } from '../../config/pricing.js';
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
// row nor provisions a duplicate Dodo Product. Transaction-scoped: released on commit/rollback.
const SYNC_LOCK_KEY = 7_202_609_26;

// Per-process memo so the DB is only consulted once per config change per warm instance.
let syncedConfig: string | null = null;

// Makes the latest row of every plan/market match PRICING. Cheap after the first call.
export async function ensurePlanPricesSynced(): Promise<void> {
  const config = JSON.stringify(PRICING.markets);
  if (syncedConfig === config) return;

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SYNC_LOCK_KEY})`;
      for (const market of Object.keys(PRICING.markets) as Market[]) {
        const { currency, plans, extraSeat } = PRICING.markets[market];
        for (const plan of Object.keys(plans) as PricedPlan[]) {
          const priceCents = plans[plan];
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
              regularPriceCents: priceCents, // column kept for history only — no launch/regular split since 2026-09-14
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
async function ensureDodoObjects(row: PlanPrice): Promise<PlanPrice> {
  const needsProduct = row.launchPriceCents > 0 && !row.dodoProductId;
  const needsAddon = row.extraSeatPriceCents > 0 && !row.dodoExtraSeatAddonId;
  if (!needsProduct && !needsAddon) return row;

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SYNC_LOCK_KEY})`;
      // Re-read under the lock: a concurrent request may have provisioned them already.
      const fresh = await tx.planPrice.findUniqueOrThrow({ where: { id: row.id } });
      const data: { dodoProductId?: string; dodoExtraSeatAddonId?: string } = {};
      if (fresh.launchPriceCents > 0 && !fresh.dodoProductId) {
        data.dodoProductId = await createRecurringProduct({ name: `Northstack — ${fresh.plan}`, priceCents: fresh.launchPriceCents });
      }
      if (fresh.extraSeatPriceCents > 0 && !fresh.dodoExtraSeatAddonId) {
        // A seat price is market-wide, so the other plan's row may already have an addon for it.
        const sibling = await tx.planPrice.findFirst({
          where: { market: fresh.market, extraSeatPriceCents: fresh.extraSeatPriceCents, dodoExtraSeatAddonId: { not: null } },
          orderBy: { effectiveFrom: 'desc' },
        });
        data.dodoExtraSeatAddonId =
          sibling?.dodoExtraSeatAddonId ??
          (await legacyExtraSeatAddonMatching(fresh.extraSeatPriceCents)) ??
          (await createExtraSeatAddon(fresh.extraSeatPriceCents));
      }
      return Object.keys(data).length > 0 ? tx.planPrice.update({ where: { id: fresh.id }, data }) : fresh;
    },
    { timeout: 30_000 },
  );
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
// planPriceId existed reads the market's latest row (what seat billing always did) and, when that
// row is the price it actually pays, gets pinned to it right here — self-healing, no backfill
// script — so a later change in PRICING no longer moves it.
export async function lockedPlanPrice(
  subscription: { id: string; planPriceId: string | null; plan: PricedPlan; provider: PaymentProvider | null; lockedPriceCents: number },
  market: Market,
): Promise<PlanPrice | null> {
  if (subscription.planPriceId) {
    const row = await prisma.planPrice.findUnique({ where: { id: subscription.planPriceId } });
    if (row) return row;
  }
  const row = await currentPlanPrice(subscription.plan, market);
  if (row && subscription.provider && row.launchPriceCents === subscription.lockedPriceCents) {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { planPriceId: row.id } });
  }
  return row;
}

// Recurring amount for a Mercado Pago preapproval — decimal major units (MP's API takes ARS, not
// centavos), base plan + extra seats at the row's own seat price.
export function mercadoPagoAmount(row: Pick<PlanPrice, 'launchPriceCents' | 'extraSeatPriceCents'>, extraSeats: number): number {
  return (row.launchPriceCents + extraSeats * row.extraSeatPriceCents) / 100;
}

// What GET /api/plans/prices serves — the app UI and the landing render every price from this.
export function publicPricing() {
  return {
    markets: PRICING.markets,
    includedSeats: PRICING.includedSeats,
    freeTrialSeatCap: PRICING.freeTrialSeatCap,
    // Kept for any client still on the pre-2026-09-26 shape (USD plan prices only).
    prices: PRICING.markets.international.plans,
  };
}
