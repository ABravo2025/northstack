import { useState } from 'react';
import Modal from './Modal';
import { CheckIcon } from './Icons';
import { useToast } from './ToastProvider';
import { api } from '../../api';
import type { PlanTier, Tenant } from '../../api/types';

interface FeatureRow {
  label: string;
  sub?: string;
  included: boolean;
}

interface PlanCardConfig {
  key: 'trial' | PlanTier;
  name: string;
  tagline: string;
  price: string;
  priceSuffix?: string;
  strikePrice?: string;
  cap: string;
  features: FeatureRow[];
  ctaLabel: string;
}

// Copy/features match the approved mockup (subscription-plans-mockup.html) verbatim —
// spec-subscription-plans.md only described the plans in prose, the actual visual/content
// reference is this mockup. "Free Trial" is not in the mockup — added at Alejandro's request
// (2026-08-13 feedback) as an explicit third option, same feature set as Starter, for anyone
// who wants to keep exploring without committing to a plan yet (functionally identical to
// closing the modal, since every tenant already has full access during the trial regardless
// of `plan` — nothing in the backend gates features by plan today).
const PLAN_CARDS: PlanCardConfig[] = [
  {
    key: 'trial',
    name: 'Free Trial',
    tagline: 'Keep exploring — decide later',
    price: 'Free',
    priceSuffix: 'for 15 days',
    cap: 'Full access, no card required',
    ctaLabel: 'Continue with free trial',
    features: [
      { label: 'Sales / CRM', sub: '1 pipeline', included: true },
      { label: 'HR core & Time Off', included: true },
      { label: 'Notes, Tasks & Activity Log', included: true },
      { label: 'Up to 2 active Forms', included: true },
      { label: '2 admin users', included: true },
      { label: 'Payroll', included: false },
      { label: 'Email support', included: true },
    ],
  },
  {
    key: 'starter',
    name: 'Starter',
    tagline: 'For small teams just getting set up',
    price: '$29',
    priceSuffix: '/month',
    strikePrice: '$39',
    cap: 'Up to 10 people',
    ctaLabel: 'Start free trial',
    features: [
      { label: 'Sales / CRM', sub: '1 pipeline', included: true },
      { label: 'HR core & Time Off', included: true },
      { label: 'Notes, Tasks & Activity Log', included: true },
      { label: 'Up to 2 active Forms', included: true },
      { label: '2 admin users', included: true },
      { label: 'Payroll', included: false },
      { label: 'Email support', included: true },
    ],
  },
  {
    key: 'growth',
    name: 'Growth',
    tagline: 'For growing teams that need Payroll',
    price: '$79',
    priceSuffix: '/month',
    strikePrice: '$99',
    cap: 'Up to 50 people',
    ctaLabel: 'Start free trial',
    features: [
      { label: 'Sales / CRM', sub: 'unlimited pipelines', included: true },
      { label: 'HR core & Time Off', included: true },
      { label: 'Notes, Tasks & Activity Log', included: true },
      { label: 'Unlimited Forms', included: true },
      { label: '5 admin users', included: true },
      { label: 'Payroll*', included: true },
      { label: 'Google Calendar integration', included: true },
      {
        label: 'Future integrations included',
        sub: 'Payments (Stripe/QuickBooks), Slack, webhooks, public API — as they ship',
        included: true,
      },
      { label: 'Priority email support', included: true },
    ],
  },
];

// spec-subscription-plans.md: badge matches Company size from signup (1-10 -> Starter,
// 11-50 -> Growth). Larger bands get the "Get in touch" link highlighted instead — no card is
// recommended for them.
function recommendedTier(companySize: string | null): PlanTier | null {
  if (companySize === '1-10') return 'starter';
  if (companySize === '11-50') return 'growth';
  return null;
}

interface PlansModalProps {
  open: boolean;
  tenant: Tenant | null;
  token: string;
  onClose: () => void;
  onPlanChosen: (tenant: Tenant) => void;
}

// Shown once, automatically, right when a workspace is created (spec-subscription-plans.md +
// Alejandro's 2026-08-13 correction: a dismissible modal over the app, not a route that blocks
// navigation until a plan is picked — the trial has already started at registration either
// way, this is an upsell, not a gate).
export default function PlansModal({ open, tenant, token, onClose, onPlanChosen }: PlansModalProps) {
  const toast = useToast();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const recommended = recommendedTier(tenant?.companySize ?? null);

  const handleSelect = async (card: PlanCardConfig) => {
    if (card.key === 'trial') {
      onClose();
      return;
    }
    setLoadingKey(card.key);
    try {
      const updated = await api.updateTenantPlan(token, card.key);
      onPlanChosen(updated);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <Modal open={open} title="Choose your plan" onClose={onClose} xwide>
      <div className="text-center mb-2">
        <div className="text-xs font-semibold text-accent uppercase tracking-wide mb-1">Last step</div>
        <p className="text-sm text-ink-muted max-w-md mx-auto">
          Every plan starts with a 15-day free trial — no credit card required. You can change plans anytime from
          Settings.
        </p>
      </div>

      <div className="text-center text-sm font-medium rounded-lg border border-line bg-accent-tint px-4 py-2.5 my-4 mx-auto max-w-xl dark:border-dark-line">
        🚀 Launch pricing for our first customers — the price you start at is the price you keep, for as long as you
        stay subscribed.
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {PLAN_CARDS.map((card) => {
          const isRecommended = card.key === recommended;
          return (
            <div
              key={card.key}
              className={`relative flex flex-col rounded-xl border p-5 ${
                isRecommended ? 'border-accent shadow-[0_0_0_1px_var(--color-accent)]' : 'border-line dark:border-dark-line'
              }`}
            >
              {isRecommended && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white">
                  Recommended for you
                </span>
              )}
              <h3 className="card-title mt-1">{card.name}</h3>
              <p className="text-xs text-ink-muted mb-4 min-h-[2rem]">{card.tagline}</p>

              <p className="mb-0.5">
                <span className="text-2xl font-bold">{card.price}</span>
                {card.priceSuffix && <span className="text-sm font-normal text-ink-muted"> {card.priceSuffix}</span>}
                {card.strikePrice && <span className="ml-1 text-sm text-ink-faint line-through">{card.strikePrice}</span>}
              </p>
              <p className="text-xs text-ink-faint mb-3">{card.cap}</p>

              {card.key !== 'trial' && (
                <div className="text-xs font-semibold text-accent bg-accent-tint rounded-md px-2 py-1.5 mb-3 leading-snug">
                  🚀 Launch price — locked in for as long as you stay subscribed
                </div>
              )}

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
                disabled={loadingKey !== null}
              >
                {loadingKey === card.key ? 'Starting…' : card.ctaLabel}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-ink-faint mt-5">
        Team bigger than 50 people?{' '}
        <a href="mailto:info@joinnorthstack.com?subject=Northstack%20Scale%20plan" className="underline text-accent">
          Get in touch
        </a>{' '}
        for a custom plan.
      </p>

      <p className="text-center text-xs text-ink-faint mt-4 leading-relaxed">
        Your trial ends in <strong className="text-ink-muted">15 days</strong>. If no payment method is added, your
        workspace keeps working for <strong className="text-ink-muted">14 more days</strong> before it's paused —
        plenty of time, no surprise lockout.
        <br />
        * Payroll calculates and tracks pay runs today — it doesn't move money yet. One-click payment processing is
        coming through a future partnership.
      </p>
    </Modal>
  );
}
