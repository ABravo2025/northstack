import { useEffect, useState } from 'react';
import { api } from '../api';

export type PlanPricesCents = Record<'starter' | 'growth', number>;

export function formatPlanPrice(cents: number): string {
  return `$${Math.round(cents / 100)}`;
}

// Plan prices live in exactly one place — CURRENT_PLAN_PRICES_CENTS in the backend's
// planService.ts, served by the public GET /api/plans/prices. Every price the app shows
// (PlansModal, the /guide pricing table) reads it through this hook instead of hardcoding a
// number that would silently drift the next time a price changes. Fetched at most once per page
// load and shared between callers; `null` until it lands (or if the request fails), so callers
// render a placeholder rather than a possibly-wrong fallback number.
let cachedPrices: PlanPricesCents | null = null;
let inflight: Promise<PlanPricesCents> | null = null;

function loadPlanPrices(): Promise<PlanPricesCents> {
  if (cachedPrices) return Promise.resolve(cachedPrices);
  if (!inflight) {
    inflight = api
      .getPlanPrices()
      .then((res) => {
        cachedPrices = res.prices;
        return res.prices;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

// `enabled` lets a component that stays mounted while hidden (PlansModal) defer the fetch until
// it's actually shown.
export function usePlanPrices(enabled = true): PlanPricesCents | null {
  const [prices, setPrices] = useState<PlanPricesCents | null>(cachedPrices);

  useEffect(() => {
    if (!enabled || prices) return;
    let active = true;
    loadPlanPrices()
      .then((loaded) => {
        if (active) setPrices(loaded);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [enabled, prices]);

  return prices;
}
