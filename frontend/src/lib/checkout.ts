import { api } from '../api';
import { openExternalUrl } from './nativeBrowser';

// Shared by every "start paying" entry point (BillingPage's Subscribe button, PlansModal's
// paid-plan selection via BillingPage/AppLayout) — straight to the provider's hosted checkout in
// a new tab, no confirmation step first (Alejandro's correction, 2026-09-14: asking "are you sure
// you want to subscribe?" before redirecting is friction with no purpose once the plan itself was
// already chosen). "Update payment method" (AddPaymentMethodModal) is a distinct action and keeps
// its own confirmation — this is only for the checkout that actually creates/pays a subscription.
export async function redirectToCheckout(token: string): Promise<void> {
  const result = await api.startCheckout(token);
  if (!result.initPoint) {
    throw new Error('Could not start checkout.');
  }
  openExternalUrl(result.initPoint);
}
