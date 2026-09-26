import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { CheckIcon } from './Icons';
import { useToast } from './ToastProvider';
import type { PlanTier, Tenant } from '../../api/types';
import { daysRemainingUntil } from '../../lib/trial';
import { COMPANY_SIZE_1_10, COMPANY_SIZE_11_50 } from '../../lib/companySize';
import { extraSeatPriceLabel, marketForCountry, planPriceLabel, usePlanPricing, type Market, type PlanPricing } from '../../lib/planPrices';

interface FeatureRow {
  label: string;
  sub?: string;
  included: boolean;
}

interface PlanCardConfig {
  key: 'trial' | PlanTier;
  name: string;
  tagline: string;
  // Only the trial card carries a static price ('Free'). Starter/Growth's price comes from
  // usePlanPricing (the backend's single price definition) — never hardcode it here.
  price?: string;
  priceSuffix?: string;
  cap: string;
  features: FeatureRow[];
  // Only meaningful for the 'trial' card, which never depends on trialDaysLeft — Starter/Growth's
  // label is computed at render time (planCtaLabel below) instead, since it must reflect however
  // many days are actually left of the tenant's trial, not a hardcoded "15".
  ctaLabel?: string;
}

// Alejandro's 2026-08-21 catch: once the tenant's real trial window has lapsed, checkoutService.ts
// already charges immediately instead of granting a fresh trial (see its daysRemaining comment) —
// this modal must stop promising "free trial" once that's no longer true, or the copy actively
// lies about what's about to happen.
function planCtaLabel(t: ReturnType<typeof useTranslation>['t'], card: PlanCardConfig, trialDaysLeft: number): string {
  if (card.key === 'trial') {
    return card.ctaLabel!;
  }
  return trialDaysLeft > 0
    ? t('plansModal.ctaStartTrial', { count: trialDaysLeft })
    : t('plansModal.ctaSubscribeNow');
}

// Plan-tier enforcement (2026-09-07) — copy mirrors the real enforced limits in
// src/modules/tenant/planLimits.ts, not aspirational marketing text (the previous version
// predated any backend enforcement at all — see that file's own history). "Free Trial" gets the
// full Growth-level feature set: a tenant with no plan chosen yet (`Tenant.plan === null`) gets
// Growth-equivalent access so they experience the whole platform before committing — the instant
// they pick Starter, Starter's real limits apply (getEffectivePlan).
//
// Seats pricing (2026-09-14, Alejandro's call): each `cap` line below advertises a flat per-seat
// model (included seats + per-extra-seat price, both from usePlanPricing, no admin-vs-member
// distinction) — matches
// enforcement exactly: no separate Admin-role cap exists (removed 2026-09-14, seatService.ts's
// real-time billing is the only limit now, same as any other seat).
//
// i18n (Unit 7): "Starter"/"Growth" are this product's own plan-tier names, kept identical in
// both locales (same convention as "Stripe"/"Google Calendar" elsewhere in Settings — a
// proprietary/brand-like name isn't run through t()). "Free Trial" is a generic concept already
// translated elsewhere (common.json's trial banners), so it does go through t() here.
function getPlanCards(t: ReturnType<typeof useTranslation>['t'], pricing: PlanPricing | null, market: Market): PlanCardConfig[] {
  const seatCap = (plan: 'starter' | 'growth') =>
    t(`plansModal.cards.${plan}.cap`, {
      included: pricing ? pricing.includedSeats[plan] : '—',
      seatPrice: extraSeatPriceLabel(pricing, market),
    });
  return [
    {
      key: 'trial',
      name: t('plansModal.cards.trial.name'),
      tagline: t('plansModal.cards.trial.tagline'),
      price: t('plansModal.cards.trial.price'),
      priceSuffix: t('plansModal.cards.trial.priceSuffix'),
      cap: t('plansModal.cards.trial.cap'),
      ctaLabel: t('plansModal.cards.trial.ctaLabel'),
      features: [
        { label: t('plansModal.features.salesCrm'), sub: t('plansModal.features.salesCrmSubUnlimited'), included: true },
        { label: t('plansModal.features.hrTimeOff'), sub: t('plansModal.features.hrTimeOffSubUnlimited'), included: true },
        { label: t('plansModal.features.notesTasksTags'), included: true },
        { label: t('plansModal.features.activityLog'), sub: t('plansModal.features.activityLogSub30'), included: true },
        { label: t('plansModal.features.payrollTracking'), included: true },
        { label: t('plansModal.features.payments'), sub: t('plansModal.features.paymentsSub'), included: true },
        { label: t('plansModal.features.googleCalendar'), included: true },
        { label: t('plansModal.features.customRoles'), sub: t('plansModal.features.customRolesSubUnlimited'), included: true },
        { label: t('plansModal.features.apiAccess'), included: true },
        { label: t('plansModal.features.emailSupport'), included: true },
      ],
    },
    {
      key: 'starter',
      name: 'Starter',
      tagline: t('plansModal.cards.starter.tagline'),
      priceSuffix: t('plansModal.cards.starter.priceSuffix'),
      cap: seatCap('starter'),
      features: [
        { label: t('plansModal.features.salesCrm'), sub: t('plansModal.features.salesCrmSubStarter'), included: true },
        { label: t('plansModal.features.hrTimeOff'), sub: t('plansModal.features.hrTimeOffSubStarter'), included: true },
        { label: t('plansModal.features.notesTasksTags'), included: true },
        { label: t('plansModal.features.activityLog'), sub: t('plansModal.features.activityLogSub7'), included: true },
        { label: t('plansModal.features.payrollTracking'), included: false },
        { label: t('plansModal.features.payments'), included: false },
        { label: t('plansModal.features.googleCalendar'), included: true },
        { label: t('plansModal.features.customRoles'), sub: t('plansModal.features.customRolesSubStarter'), included: true },
        { label: t('plansModal.features.apiAccess'), included: false },
        { label: t('plansModal.features.emailSupport'), included: true },
      ],
    },
    {
      key: 'growth',
      name: 'Growth',
      tagline: t('plansModal.cards.growth.tagline'),
      priceSuffix: t('plansModal.cards.growth.priceSuffix'),
      cap: seatCap('growth'),
      features: [
        { label: t('plansModal.features.salesCrm'), sub: t('plansModal.features.salesCrmSubUnlimited'), included: true },
        { label: t('plansModal.features.hrTimeOff'), sub: t('plansModal.features.hrTimeOffSubUnlimited'), included: true },
        { label: t('plansModal.features.notesTasksTags'), included: true },
        { label: t('plansModal.features.activityLog'), sub: t('plansModal.features.activityLogSub30'), included: true },
        { label: t('plansModal.features.payrollTracking'), included: true },
        { label: t('plansModal.features.payments'), sub: t('plansModal.features.paymentsSub'), included: true },
        { label: t('plansModal.features.googleCalendar'), included: true },
        { label: t('plansModal.features.customRoles'), sub: t('plansModal.features.customRolesSubUnlimited'), included: true },
        { label: t('plansModal.features.apiAccess'), included: true },
        { label: t('plansModal.features.emailSupportPriority'), included: true },
      ],
    },
  ];
}

// spec-subscription-plans.md: badge matches Company size from signup (1-10 -> Starter,
// 11-50 -> Growth). Larger bands get the "Get in touch" link highlighted instead — no card is
// recommended for them.
function recommendedTier(companySize: string | null): PlanTier | null {
  if (companySize === COMPANY_SIZE_1_10) return 'starter';
  if (companySize === COMPANY_SIZE_11_50) return 'growth';
  return null;
}

interface PlansModalProps {
  open: boolean;
  tenant: Tenant | null;
  onClose: () => void;
  // How a plan selection is actually submitted — required (2026-09-15, QA-88: this used to have
  // a same-file fallback that called the pre-billing updateTenantPlan directly, writing
  // Tenant.plan before any payment was confirmed; removed as a footgun once every real caller
  // already passed its own handler anyway). AppLayout's auto-open goes straight to checkout with
  // the chosen plan; BillingPage's "Change plan" uses the post-billing self-serve endpoint for an
  // already-paying tenant, or also goes straight to checkout for one that isn't yet.
  onSelectPlan: (plan: PlanTier) => Promise<void>;
  // Marks that card as the tenant's current plan (disabled, "Current plan" instead of a CTA) —
  // only meaningful for BillingPage's "Change plan" (a tenant there always already has a real
  // plan). AppLayout's auto-open only ever shows when plan === null, so nothing is ever "current"
  // there — this prop stays undefined in that usage.
  currentPlan?: PlanTier | null;
}

// Shown once, automatically, right when a workspace is created (spec-subscription-plans.md +
// Alejandro's 2026-08-13 correction: a dismissible modal over the app, not a route that blocks
// navigation until a plan is picked — the trial has already started at registration either
// way, this is an upsell, not a gate).
export default function PlansModal({ open, tenant, onClose, onSelectPlan, currentPlan }: PlansModalProps) {
  const toast = useToast();
  const { t } = useTranslation('settingsPages');
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  // Fetched lazily on first open rather than on mount — this component stays mounted
  // (AppLayout toggles `open`, doesn't remount it), so this only ever runs for the sessions that
  // actually open the modal. Shows "—" for Starter/Growth until it lands or if it fails, rather
  // than a hardcoded number that could be wrong.
  const pricing = usePlanPricing(open);
  // Argentina sees its ARS prices (Mercado Pago), everyone else USD — same routing as checkout.
  const market = marketForCountry(tenant?.country);

  // Rebuilt every render (not memoized) so a live language switch (Settings → Profile) updates
  // this modal's copy immediately, same pattern as lib/settingsSections.tsx's getSettingsSections.
  const planCards = getPlanCards(t, pricing, market);

  const recommended = recommendedTier(tenant?.companySize ?? null);
  const trialDaysLeft = daysRemainingUntil(tenant?.trialEndsAt ?? null);
  const hasTrialLeft = trialDaysLeft > 0;
  // Free Trial isn't a real downgrade target from a chosen plan (2026-09-15, QA-89 — selecting it
  // used to just close the modal with no actual effect once currentPlan was set) — hidden here
  // rather than left selectable-but-inert. Going back to Free Trial from a real plan, when
  // possible at all, lives in BillingPage's own "Cancel subscription"/"Back to Free Trial"
  // buttons instead, which is the only place that can tell whether there's a real provider
  // subscription to actually cancel first.
  const visibleCards = currentPlan ? planCards.filter((card) => card.key !== 'trial') : planCards;

  const handleSelect = async (card: PlanCardConfig) => {
    if (card.key === 'trial') {
      onClose();
      return;
    }
    setLoadingKey(card.key);
    try {
      await onSelectPlan(card.key);
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <Modal open={open} title={t('plansModal.title')} onClose={onClose} xwide>
      <div className="text-center mb-2">
        <div className="text-xs font-semibold text-accent uppercase tracking-wide mb-1">{t('plansModal.lastStep')}</div>
        <p className="text-sm text-ink-muted max-w-md mx-auto">
          {hasTrialLeft ? t('plansModal.introTrial', { count: trialDaysLeft }) : t('plansModal.introExpired')}
        </p>
      </div>

      <div className="text-center text-sm font-medium rounded-lg border border-line bg-accent-tint px-4 py-2.5 my-4 mx-auto max-w-xl dark:border-dark-line">
        {t('plansModal.priceLockedBanner')}
      </div>

      <div className={`grid gap-4 ${visibleCards.length === 2 ? 'md:grid-cols-2 max-w-xl mx-auto' : 'md:grid-cols-3'}`}>
        {visibleCards.map((card) => {
          const isCurrent = card.key === currentPlan;
          const isRecommended = !isCurrent && card.key === recommended;
          const displayPrice =
            card.key === 'starter' || card.key === 'growth' ? planPriceLabel(pricing, market, card.key) : card.price;
          return (
            <div
              key={card.key}
              className={`relative flex flex-col rounded-xl border p-5 ${
                isCurrent || isRecommended
                  ? 'border-accent shadow-[0_0_0_1px_var(--color-accent)]'
                  : 'border-line dark:border-dark-line'
              }`}
            >
              {isCurrent ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
                  {t('plansModal.currentPlanBadge')}
                </span>
              ) : (
                isRecommended && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
                    {t('plansModal.recommendedBadge')}
                  </span>
                )
              )}
              <h3 className="card-title mt-1">{card.name}</h3>
              <p className="text-xs text-ink-muted mb-4 min-h-[2rem]">{card.tagline}</p>

              <p className="mb-0.5">
                <span className="text-2xl font-bold">{displayPrice}</span>
                {card.priceSuffix && <span className="text-sm font-normal text-ink-muted"> {card.priceSuffix}</span>}
              </p>
              <p className="text-xs text-ink-faint mb-3">{card.cap}</p>

              {/* Rendered for every card, invisible on trial (no "locked price" concept for a
                  free plan) — reserves the same height so the feature list below starts at the
                  same row across all 3 cards instead of trial's list starting higher. */}
              <div
                className={`text-xs font-semibold text-accent bg-accent-tint rounded-md px-2 py-1.5 mb-3 leading-snug ${
                  card.key === 'trial' ? 'invisible' : ''
                }`}
              >
                {hasTrialLeft
                  ? t('plansModal.priceLockedFirstCharge', { count: trialDaysLeft })
                  : t('plansModal.priceLockedChargedToday')}
              </div>

              <ul className="flex-1 flex flex-col gap-2 text-sm mb-4">
                {card.features.map((feature) => (
                  <li
                    key={feature.label}
                    className={`flex items-start gap-2 ${feature.included ? '' : 'text-ink-faint'}`}
                  >
                    <CheckIcon
                      className={`h-3.5 w-3.5 flex-shrink-0 mt-0.5 ${
                        feature.included ? 'text-emerald-600 dark:text-emerald-400' : 'text-line-strong'
                      }`}
                    />
                    <span className="flex flex-col">
                      <span>{feature.label}</span>
                      {feature.sub && <span className="text-xs text-ink-faint">{feature.sub}</span>}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className={card.key === 'growth' ? 'btn btn-primary w-full' : 'btn btn-outline w-full'}
                onClick={() => handleSelect(card)}
                disabled={loadingKey !== null || isCurrent}
              >
                {isCurrent
                  ? t('plansModal.currentPlanBadge')
                  : loadingKey === card.key
                    ? t('plansModal.ctaStarting')
                    : planCtaLabel(t, card, trialDaysLeft)}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-ink-faint mt-5">
        {t('plansModal.enterprisePrefix')}{' '}
        <a href="mailto:info@joinnorthstack.com?subject=Northstack%20Enterprise%20plan" className="underline text-accent">
          {t('plansModal.enterpriseLink')}
        </a>{' '}
        {t('plansModal.enterpriseSuffix')}
      </p>

      <p className="text-center text-xs text-ink-faint mt-4 leading-relaxed">
        {hasTrialLeft
          ? t('plansModal.footerTrialActive', { count: trialDaysLeft })
          : t('plansModal.footerTrialExpired')}
        <br />
        {t('plansModal.footerPayrollDisclaimer')}
      </p>
    </Modal>
  );
}
