import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { useToast } from './ToastProvider';
import { redirectToCheckout } from '../../lib/checkout';

interface AddPaymentMethodModalProps {
  open: boolean;
  token: string;
  onClose: () => void;
}

// spec's "Add payment method" modal — billing-payment-mockup.html referenced by the spec doesn't
// actually exist in the repo (same gap found with subscription-plans-mockup.html during
// Signup+Plans), built from the spec's prose + existing Modal.tsx conventions per Alejandro's
// explicit direction (2026-08-19) rather than blocking on a mockup that isn't there.
//
// Update-payment-method only (2026-09-14) — a card already exists on an active subscription, this
// call replaces it on the SAME subscription (checkoutService.ts routes to a distinct provider
// mechanism so it never creates a second, competing subscription). Selecting/subscribing to a
// plan for the first time no longer goes through this modal at all — see lib/checkout.ts's
// redirectToCheckout, called directly with no confirmation step in between (Alejandro's
// correction: asking "are you sure?" before a redirect the tenant already asked for by picking a
// plan is friction with no purpose).
//
// Triggers POST /api/subscriptions/me/checkout and hands off to the provider's own hosted page in
// a NEW browser tab via window.open (2026-08-21 correction: previously window.location.href,
// navigating the current tab away from Northstack entirely, which broke Alejandro's standing "if a
// modal can't do it, open a new tab" rule). Never a card form of our own, per the spec's "nunca
// tocamos datos de tarjeta". BillingPage.tsx refetches on window focus (the original tab stays in
// place) rather than relying on a same-tab redirect completing.
export default function AddPaymentMethodModal({ open, token, onClose }: AddPaymentMethodModalProps) {
  const toast = useToast();
  const { t } = useTranslation('settingsPages');
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    try {
      await redirectToCheckout(token);
      onClose();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} title={t('addPaymentMethod.title')} onClose={onClose}>
      <p className="text-sm text-ink-muted mb-4">
        {t('addPaymentMethod.description')}
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose} disabled={loading}>
          {t('addPaymentMethod.cancel')}
        </button>
        <button type="button" className="btn btn-primary" onClick={handleStart} disabled={loading}>
          {loading ? t('addPaymentMethod.starting') : t('addPaymentMethod.continue')}
        </button>
      </div>
    </Modal>
  );
}
