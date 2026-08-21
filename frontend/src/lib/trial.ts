// Days left until a trial-style deadline (Tenant.trialEndsAt / Subscription.trialEndsAt) — same
// rounding as checkoutService.ts's backend daysRemaining (Math.ceil, never negative). Shared so
// PlansModal/AddPaymentMethodModal never promise a longer free trial than checkoutService.ts will
// actually grant once startCheckout runs (2026-08-21: it caps trialDays at what's really left of
// the tenant's original window instead of always handing out a fresh SIGNUP_TRIAL_DAYS).
export function daysRemainingUntil(target: string | null): number {
  if (!target) return 0;
  const ms = new Date(target).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
