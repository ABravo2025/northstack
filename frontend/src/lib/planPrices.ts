import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Market, PlanPricing, PricedPlan } from '../api/types';

export type { Market, MarketPricing, PlanPricing, PricedPlan } from '../api/types';

// Every price and seat number lives in exactly one place — the backend's src/config/pricing.ts,
// served by the public GET /api/plans/prices. Everything the app shows (PlansModal, /guide,
// /help) reads it through this hook instead of hardcoding a number that would silently drift the
// next time a price changes. Fetched at most once per page load and shared between callers; `null`
// until it lands (or if the request fails), so callers render a placeholder rather than a
// possibly-wrong fallback number.
let cached: PlanPricing | null = null;
let inflight: Promise<PlanPricing> | null = null;

function loadPlanPricing(): Promise<PlanPricing> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api
      .getPlanPrices()
      .then((res) => {
        cached = res;
        return res;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

// `enabled` lets a component that stays mounted while hidden (PlansModal) defer the fetch until
// it's actually shown.
export function usePlanPricing(enabled = true): PlanPricing | null {
  const [pricing, setPricing] = useState<PlanPricing | null>(cached);

  useEffect(() => {
    if (!enabled || pricing) return;
    let active = true;
    loadPlanPricing()
      .then((loaded) => {
        if (active) setPricing(loaded);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [enabled, pricing]);

  return pricing;
}

// Same routing as the backend's resolveProvider: Argentina is billed in ARS (Mercado Pago),
// everyone else in USD.
export function marketForCountry(country: string | null | undefined): Market {
  return country === 'Argentina' ? 'ar' : 'international';
}

// "$19" / "ARS 15,000" — whole amounts drop the decimals, which every current price is.
export function formatPlanPrice(cents: number, currency: string): string {
  const amount = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

// A plan's price in a market, formatted — or '—' while loading, or when the plan isn't sold in
// that market yet (0 in the config).
export function planPriceLabel(pricing: PlanPricing | null, market: Market, plan: PricedPlan): string {
  const m = pricing?.markets[market];
  if (!m || m.plans[plan] <= 0) return '—';
  return formatPlanPrice(m.plans[plan], m.currency);
}

export function extraSeatPriceLabel(pricing: PlanPricing | null, market: Market, plan: PricedPlan = 'starter'): string {
  const m = pricing?.markets[market];
  if (!m) return '—';
  return formatPlanPrice(m.extraSeatByPlan?.[plan] ?? m.extraSeat, m.currency);
}

// Per-user pricing (2026-10-02): the price per active user per month a NEW team gets today, and the
// regular price it's discounted from while the launch offer runs.
export function perUserPriceLabel(pricing: PlanPricing | null, market: Market, plan: PricedPlan, tier?: 'launch' | 'regular'): string {
  const m = pricing?.markets[market];
  if (!pricing || !m?.perUser) return '—';
  const which = tier ?? (pricing.isLaunch ? 'launch' : 'regular');
  return formatPlanPrice(m.perUser[which][plan], m.currency);
}

export function launchDiscountPct(pricing: PlanPricing | null, market: Market, plan: PricedPlan): number | null {
  const m = pricing?.markets[market];
  if (!pricing?.isLaunch || !m?.perUser) return null;
  const { launch, regular } = m.perUser;
  return regular[plan] > 0 ? Math.round((1 - launch[plan] / regular[plan]) * 100) : null;
}

// Smallest monthly bill for a plan today: the per-user price × the minimum team size.
export function minMonthlyLabel(pricing: PlanPricing | null, market: Market, plan: PricedPlan): string {
  const m = pricing?.markets[market];
  if (!pricing || !m?.perUser) return '—';
  const per = m.perUser[pricing.isLaunch ? 'launch' : 'regular'][plan];
  return formatPlanPrice(per * pricing.minUsers, m.currency);
}

// "December 31, 2026" / "31 de diciembre de 2026"
export function launchEndLabel(pricing: PlanPricing | null, locale: string): string {
  if (!pricing) return '—';
  return new Date(`${pricing.launchEndsAt}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
