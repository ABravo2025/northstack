import { api } from '../api';
import type { PlanTier } from '../api';
import { openExternalUrl } from './nativeBrowser';

// Shared by every "start paying" entry point (PlansModal's paid-plan selection via
// BillingPage/AppLayout, AddPaymentMethodModal's "update payment method") — straight to the
// provider's hosted checkout in a new tab, no confirmation step first (Alejandro's correction,
// 2026-09-14: asking "are you sure you want to subscribe?" before redirecting is friction with no
// purpose once the plan itself was already chosen).
//
// `plan` (2026-09-15, QA-88) — required for a first-time subscribe: the backend uses it directly
// for checkout instead of trusting Tenant.plan/Subscription.plan being set beforehand, and only
// writes it for real once the checkout's payment is confirmed (routes/webhooks.ts). Omit when
// updating the payment method on an already-active subscription — the backend ignores it there.
export async function redirectToCheckout(token: string, plan?: PlanTier): Promise<void> {
  const result = await api.startCheckout(token, plan);
  if (!result.initPoint) {
    throw new Error('Could not start checkout.');
  }
  openExternalUrl(result.initPoint);
}
