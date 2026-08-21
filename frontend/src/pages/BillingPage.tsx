import { useEffect, useState } from 'react';
import { api } from '../api';
import type { PlanTier, Subscription, Tenant } from '../api';
import { useToast } from '../components/common/ToastProvider';
import ConfirmDialog from '../components/common/ConfirmDialog';
import TableSkeleton from '../components/common/TableSkeleton';
import { BriefcaseIcon } from '../components/common/Icons';
import { formatMoney } from '../lib/currencies';
import { daysRemainingUntil } from '../lib/trial';
import AddPaymentMethodModal from '../components/common/AddPaymentMethodModal';
import PlansModal from '../components/common/PlansModal';

interface BillingPageProps {
  token: string;
  tenant: Tenant | null;
  onTenantUpdated: (tenant: Tenant) => void;
}

const PLAN_LABEL: Record<PlanTier, string> = { starter: 'Starter', growth: 'Growth', scale: 'Scale' };

// Domain statuses (Subscription.status / Invoice.status) don't map 1:1 to the existing
// status-badge CSS modifiers (pending/approved/rejected/cancelled, from TimeOffRequest) — this
// translates instead of adding new CSS for what's visually the same 4 colors.
const STATUS_BADGE_MODIFIER: Record<string, string> = {
  active: 'approved',
  paid: 'approved',
  trialing: 'pending',
  past_due: 'pending',
  pending: 'pending',
  suspended: 'rejected',
  failed: 'rejected',
  cancelled: 'cancelled',
  refunded: 'cancelled',
};

function StatusBadge({ status, label }: { status: string; label?: string }) {
  const modifier = STATUS_BADGE_MODIFIER[status] ?? 'cancelled';
  return <span className={`status-badge status-${modifier}`}>{label ?? status.replace('_', ' ')}</span>;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Paddle's card.type / Mercado Pago's payment_method_id are lowercase, underscore-separated
// codes (e.g. "american_express", "union_pay") — never shown raw to the tenant.
const CARD_BRAND_LABEL: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  american_express: 'American Express',
  diners_club: 'Diners Club',
  discover: 'Discover',
  jcb: 'JCB',
  mada: 'Mada',
  maestro: 'Maestro',
  union_pay: 'UnionPay',
  unknown: 'Card',
};

function formatCardBrand(brand: string): string {
  return CARD_BRAND_LABEL[brand] ?? brand.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// spec's date-mapping table (settings-billing-flow-mockup.html's prose description) — every
// field here already exists on the model, nothing new. `active` shows a from-to range
// (currentPeriodStart -> currentPeriodEnd) per Alejandro's explicit request (2026-08-19) instead
// of just the renewal date, so a paid plan visibly says when the current period started too.
function planDateInfo(sub: Subscription): { label: string; date: string | null; rangeStart?: string | null } | null {
  if (sub.cancelledAt && sub.cancellationEffectiveAt) {
    return { label: 'Ends', date: sub.cancellationEffectiveAt };
  }
  switch (sub.status) {
    case 'trialing':
      return { label: 'Trial ends', date: sub.trialEndsAt };
    case 'active':
      return { label: 'Active', date: sub.currentPeriodEnd, rangeStart: sub.currentPeriodStart };
    case 'past_due':
      return { label: 'Payment overdue since', date: sub.currentPeriodEnd };
    case 'suspended':
      return { label: 'Suspended since', date: sub.gracePeriodEndsAt };
    default:
      return null;
  }
}

export default function BillingPage({ token, tenant, onTenantUpdated }: BillingPageProps) {
  const toast = useToast();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPlansModal, setShowPlansModal] = useState(false);
  const [showAddPaymentMethod, setShowAddPaymentMethod] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .getSubscription(token)
      .then(setSubscription)
      .catch((error) => toast.error('Failed to load billing details: ' + (error as Error).message))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [token]);

  // Paddle checkout now opens in its own tab (PaddleCheckoutPage.tsx), so this tab has no direct
  // signal when it completes — refetch whenever the tenant comes back to this tab instead. Cheap
  // (one GET) and correct even if they never actually finish the checkout.
  useEffect(() => {
    const handleFocus = () => load();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading || !subscription) {
    return (
      <div className="max-w-6xl">
        <TableSkeleton rows={3} columns={2} />
      </div>
    );
  }

  const dateInfo = planDateInfo(subscription);
  const hasProvider = subscription.provider !== null;
  const hasPendingCancellation = Boolean(subscription.cancelledAt && subscription.cancellationEffectiveAt);

  // Passed to PlansModal as onSelectPlan (2026-08-19 — reusing the same full-featured modal
  // shown at signup, per Alejandro's request, instead of a bare two-button expand). Trial (no
  // provider attached yet) still records the choice via the pre-billing PATCH
  // /api/tenants/me/plan first (same one AppLayout's auto-opened PlansModal calls), but then —
  // 2026-08-20 correction — immediately continues into real checkout instead of leaving it as
  // just an intention, same as AppLayout's welcome modal now does. Already-paying tenants
  // (provider set) go through the post-billing self-serve change-plan endpoint instead, which
  // schedules the change for next cycle without a new checkout.
  const handleSelectPlan = async (plan: PlanTier) => {
    if (hasProvider) {
      await api.changeSubscriptionPlan(token, plan);
      toast.success('Plan change scheduled — it applies starting your next billing cycle.');
      load();
    } else {
      const updated = await api.updateTenantPlan(token, plan);
      onTenantUpdated(updated);
      load();
      setShowAddPaymentMethod(true);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await api.cancelSubscription(token);
      toast.success('Cancellation scheduled for the end of your current period.');
      setShowCancelConfirm(false);
      load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCancelling(false);
    }
  };

  const handleResume = async () => {
    setResuming(true);
    try {
      await api.resumeSubscription(token);
      toast.success('Subscription resumed.');
      load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setResuming(false);
    }
  };

  const handleViewInvoice = async (invoiceId: string, disposition: 'inline' | 'attachment') => {
    setViewingInvoiceId(invoiceId);
    try {
      const url = await api.getInvoiceDocumentUrl(token, invoiceId, disposition);
      // 'attachment' disposition already makes Paddle's own response carry a
      // Content-Disposition header that tells the browser to save it — a plain navigation is
      // enough to trigger that, same as 'inline' just opens it in a new tab either way.
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setViewingInvoiceId(null);
    }
  };

  return (
    <div className="max-w-6xl flex flex-col gap-2.5">
      <div className="card">
        <h3 className="card-title">Plan</h3>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold">{PLAN_LABEL[subscription.plan]}</span>
            <span className="text-sm text-ink-muted">
              {formatMoney(subscription.lockedPriceCents, subscription.currency)}/mo
            </span>
            <StatusBadge status={hasPendingCancellation ? 'cancel_scheduled' : subscription.status} label={hasPendingCancellation ? 'ending' : undefined} />
          </div>
          <div className="flex items-center gap-2">
            {!hasPendingCancellation && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowPlansModal(true)}>
                Change plan
              </button>
            )}
            {!hasProvider && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAddPaymentMethod(true)}>
                Subscribe
              </button>
            )}
          </div>
        </div>
        {dateInfo && (
          <p className="text-sm text-ink-faint mb-2">
            {dateInfo.rangeStart ? (
              <>
                {dateInfo.label}: {formatDate(dateInfo.rangeStart)} – {formatDate(dateInfo.date)}
              </>
            ) : (
              <>
                {dateInfo.label}: {formatDate(dateInfo.date)}
              </>
            )}
          </p>
        )}

        {hasProvider && !hasPendingCancellation && subscription.status !== 'cancelled' && (
          <div className="mt-3 pt-3 border-t border-line dark:border-dark-line">
            <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => setShowCancelConfirm(true)}>
              Cancel subscription
            </button>
          </div>
        )}
        {hasPendingCancellation && (
          <div className="mt-3 pt-3 border-t border-line dark:border-dark-line">
            <button type="button" className="btn btn-outline btn-sm" onClick={handleResume} disabled={resuming}>
              {resuming ? 'Resuming…' : 'Resume subscription'}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">Payment method</h3>
        {hasProvider ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <BriefcaseIcon className="h-4 w-4 text-ink-faint" />
              <span className="text-sm">
                {subscription.paymentMethodBrand && subscription.paymentMethodLast4
                  ? `${formatCardBrand(subscription.paymentMethodBrand)} •••• ${subscription.paymentMethodLast4}`
                  : 'Card on file'}
              </span>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowAddPaymentMethod(true)}>
              Update payment method
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            No payment method on file yet — use the <strong>Subscribe</strong> button above to add one.
          </p>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">Invoices</h3>
        {subscription.invoices.length === 0 ? (
          <p className="text-sm text-ink-muted">No invoices yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint">
                <th className="font-normal py-1.5">Date</th>
                <th className="font-normal py-1.5">Amount</th>
                <th className="font-normal py-1.5">Status</th>
                <th className="font-normal py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {subscription.invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t border-line dark:border-dark-line">
                  <td className="py-1.5">{formatDate(invoice.paidAt ?? invoice.createdAt)}</td>
                  <td className="py-1.5">{formatMoney(invoice.amountCents, invoice.currency)}</td>
                  <td className="py-1.5">
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    {invoice.provider === 'paddle' && (
                      <>
                        <button
                          type="button"
                          className="text-xs text-accent underline disabled:opacity-50"
                          onClick={() => handleViewInvoice(invoice.id, 'inline')}
                          disabled={viewingInvoiceId === invoice.id}
                        >
                          {viewingInvoiceId === invoice.id ? 'Opening…' : 'View invoice'}
                        </button>
                        <span className="text-ink-faint mx-1.5">·</span>
                        <button
                          type="button"
                          className="text-xs text-accent underline disabled:opacity-50"
                          onClick={() => handleViewInvoice(invoice.id, 'attachment')}
                          disabled={viewingInvoiceId === invoice.id}
                        >
                          Download
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AddPaymentMethodModal
        open={showAddPaymentMethod}
        token={token}
        mode={hasProvider ? 'update' : 'subscribe'}
        planLabel={`${PLAN_LABEL[subscription.plan]} — ${formatMoney(subscription.lockedPriceCents, subscription.currency)}/mo`}
        trialDaysRemaining={daysRemainingUntil(subscription.trialEndsAt)}
        onClose={() => setShowAddPaymentMethod(false)}
      />

      <PlansModal
        open={showPlansModal}
        tenant={tenant}
        token={token}
        onClose={() => setShowPlansModal(false)}
        onPlanChosen={(updated) => {
          onTenantUpdated(updated);
          setShowPlansModal(false);
        }}
        onSelectPlan={handleSelectPlan}
        currentPlan={subscription.plan}
      />

      {showCancelConfirm && (
        <ConfirmDialog
          title="Cancel subscription"
          message={`Your plan stays active until the end of your current billing period${
            dateInfo?.date ? ` (${formatDate(subscription.currentPeriodEnd)})` : ''
          }. You can resume anytime before then.`}
          confirmLabel={cancelling ? 'Cancelling…' : 'Cancel subscription'}
          confirmDisabled={cancelling}
          onConfirm={handleCancel}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </div>
  );
}
