import { useState } from 'react';
import Modal from './Modal';
import { useToast } from './ToastProvider';
import { api } from '../../api';

interface AddPaymentMethodModalProps {
  open: boolean;
  token: string;
  // "subscribe": no payment method on file yet — this call attaches one AND starts the 15-day
  // free trial. "update": a payment method already exists — this call only replaces the card
  // on the SAME subscription (checkoutService.ts routes to a distinct provider mechanism so it
  // never creates a second, competing subscription). Alejandro's explicit correction (2026-08-19):
  // these are two different intents and must read differently, even though both end up calling
  // the same POST /api/subscriptions/me/checkout.
  mode: 'subscribe' | 'update';
  planLabel?: string; // e.g. "Starter — $29.00/mo", shown only in subscribe mode
  // Days actually left of the tenant's original trial window (daysRemainingUntil(tenant.trialEndsAt))
  // — only meaningful in "subscribe" mode. checkoutService.ts caps the real provider-side trial at
  // this same number (2026-08-21), so this copy must match: 0 (or omitted) means checkout charges
  // immediately, never promise "free trial" in that case.
  trialDaysRemaining?: number;
  onClose: () => void;
}

// spec's "Add payment method" modal — billing-payment-mockup.html referenced by the spec doesn't
// actually exist in the repo (same gap found with subscription-plans-mockup.html during
// Signup+Plans), built from the spec's prose + existing Modal.tsx conventions per Alejandro's
// explicit direction (2026-08-19) rather than blocking on a mockup that isn't there.
//
// Triggers POST /api/subscriptions/me/checkout and always hands off to the provider in a NEW
// browser tab — Mercado Pago's hosted init_point via window.open (2026-08-21 correction:
// previously window.location.href, navigating the current tab away from Northstack entirely,
// which broke Alejandro's standing "if a modal can't do it, open a new tab" rule — it only applied
// that to Paddle before), Paddle via its own PaddleCheckoutPage.tsx route (2026-08-20: should feel
// like its own window, not an overlay stacked on the current one). Never a card form of our own,
// per the spec's "nunca tocamos datos de tarjeta". This component no longer loads Paddle.js
// itself; PaddleCheckoutPage.tsx does, in its own tab. BillingPage.tsx refetches on window focus
// (both providers leave the original tab in place) rather than relying on a same-tab redirect
// completing.
export default function AddPaymentMethodModal({
  open,
  token,
  mode,
  planLabel,
  trialDaysRemaining,
  onClose,
}: AddPaymentMethodModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const hasTrialLeft = mode === 'subscribe' && Boolean(trialDaysRemaining && trialDaysRemaining > 0);

  const handleStart = async () => {
    setLoading(true);
    try {
      const result = await api.startCheckout(token);
      if (result.provider === 'mercadopago' && result.initPoint) {
        window.open(result.initPoint, '_blank', 'noopener,noreferrer');
        onClose();
        return;
      }
      if (result.provider === 'paddle' && result.paddleTransactionId) {
        window.open(`/billing/checkout?transactionId=${result.paddleTransactionId}`, '_blank', 'noopener,noreferrer');
        onClose();
        return;
      }
      toast.error('Could not start checkout.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      title={mode === 'subscribe' ? (hasTrialLeft ? 'Start your free trial' : 'Subscribe') : 'Update payment method'}
      onClose={onClose}
    >
      {mode === 'subscribe' ? (
        <p className="text-sm text-ink-muted mb-4">
          {hasTrialLeft ? (
            <>
              {planLabel ? (
                <>
                  You're about to start your {trialDaysRemaining}-day free trial of{' '}
                  <strong className="text-ink">{planLabel}</strong>.{' '}
                </>
              ) : (
                `You're about to start your ${trialDaysRemaining}-day free trial. `
              )}
              You'll be redirected to our payment provider (in a new tab) to securely add a card — you won't be
              charged until the trial ends in {trialDaysRemaining} day{trialDaysRemaining === 1 ? '' : 's'}. Northstack
              never sees or stores your card details.
            </>
          ) : (
            <>
              {planLabel ? (
                <>
                  You're about to subscribe to <strong className="text-ink">{planLabel}</strong>.{' '}
                </>
              ) : (
                "You're about to subscribe. "
              )}
              You'll be redirected to our payment provider (in a new tab) to securely add a card — you'll be charged
              right away. Northstack never sees or stores your card details.
            </>
          )}
        </p>
      ) : (
        <p className="text-sm text-ink-muted mb-4">
          You'll be redirected to our payment provider (in a new tab) to securely replace your payment method.
          Your new card takes over immediately — Northstack never sees or stores your card details.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={handleStart} disabled={loading}>
          {loading ? 'Starting…' : 'Continue'}
        </button>
      </div>
    </Modal>
  );
}
