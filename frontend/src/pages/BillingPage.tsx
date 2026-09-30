import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import type { PlanTier, Subscription, Tenant } from '../api';
import { useToast } from '../components/common/ToastProvider';
import ConfirmDialog from '../components/common/ConfirmDialog';
import TableSkeleton from '../components/common/TableSkeleton';
import { BriefcaseIcon } from '../components/common/Icons';
import { formatMoney } from '../lib/currencies';
import { openExternalUrl } from '../lib/nativeBrowser';
import { redirectToCheckout } from '../lib/checkout';
import { formatPlanPrice, marketForCountry, usePlanPricing } from '../lib/planPrices';
import AddPaymentMethodModal from '../components/common/AddPaymentMethodModal';
import PlansModal from '../components/common/PlansModal';

interface BillingPageProps {
  token: string;
  tenant: Tenant | null;
  // Not used here as of the checkout rework (2026-09-15, QA-88) — a plan choice no longer
  // resolves to an updated Tenant synchronously (see handleSelectPlan below), so there's nothing
  // to hand back for a first-time subscribe; kept in the interface since the route that renders
  // this page (App.tsx) already wires it through for its other siblings.
  onTenantUpdated: (tenant: Tenant) => void;
}

const PLAN_LABEL: Record<PlanTier, string> = { starter: 'Starter', growth: 'Growth', scale: 'Scale' };
const PLAN_RANK: Record<PlanTier, number> = { starter: 1, growth: 2, scale: 3 };

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
  const { t } = useTranslation('settingsPages');
  const modifier = STATUS_BADGE_MODIFIER[status] ?? 'cancelled';
  return (
    <span className={`status-badge status-${modifier}`}>
      {label ?? t(`billing.status.${status}`, { defaultValue: status.replace('_', ' ') })}
    </span>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  // `undefined` locale (not a hardcoded 'en-US') so the date format itself also follows the
  // browser/user locale, same fix already applied to IntegrationsSettingsPage's own date helper
  // during its i18n pass.
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Dodo's card_network / Mercado Pago's payment_method_id are lowercase, underscore-separated
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
  master: 'Mastercard',
  amex: 'American Express',
};

function formatCardBrand(brand: string): string {
  return CARD_BRAND_LABEL[brand] ?? brand.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// spec's date-mapping table (settings-billing-flow-mockup.html's prose description) — every
// field here already exists on the model, nothing new. `active` shows a from-to range
// (currentPeriodStart -> currentPeriodEnd) per Alejandro's explicit request (2026-08-19) instead
// of just the renewal date, so a paid plan visibly says when the current period started too.
function planDateInfo(
  t: ReturnType<typeof useTranslation>['t'],
  sub: Subscription,
): { label: string; date: string | null; rangeStart?: string | null } | null {
  if (sub.cancelledAt && sub.cancellationEffectiveAt) {
    return { label: t('billing.dateLabel.ends'), date: sub.cancellationEffectiveAt };
  }
  switch (sub.status) {
    case 'trialing':
      return { label: t('billing.dateLabel.trialEnds'), date: sub.trialEndsAt };
    case 'active':
      return { label: t('billing.dateLabel.active'), date: sub.currentPeriodEnd, rangeStart: sub.currentPeriodStart };
    case 'past_due':
      return { label: t('billing.dateLabel.paymentOverdueSince'), date: sub.currentPeriodEnd };
    case 'suspended':
      return { label: t('billing.dateLabel.suspendedSince'), date: sub.gracePeriodEndsAt };
    default:
      return null;
  }
}

export default function BillingPage({ token, tenant }: BillingPageProps) {
  const toast = useToast();
  const { t } = useTranslation('settingsPages');
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPlansModal, setShowPlansModal] = useState(false);
  const [showAddPaymentMethod, setShowAddPaymentMethod] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null);
  // Plan chosen in PlansModal by a tenant already paying — confirmed here first, since it can
  // charge right away (upgrade) or only apply later (downgrade).
  const [planToConfirm, setPlanToConfirm] = useState<PlanTier | null>(null);
  const [changingPlan, setChangingPlan] = useState(false);
  const pricing = usePlanPricing();

  const load = () => {
    setLoading(true);
    api
      .getSubscription(token)
      .then(setSubscription)
      .catch((error) => toast.error(t('billing.loadError', { message: (error as Error).message })))
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [token]);

  // Checkout opens in its own tab (the provider's own hosted page), so this tab has no direct
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

  const dateInfo = planDateInfo(t, subscription);
  const hasProvider = subscription.provider !== null;
  const hasPendingCancellation = Boolean(subscription.cancelledAt && subscription.cancellationEffectiveAt);
  // subscription.tenantPlan (not subscription.plan) is the real "what's actually chosen" source
  // of truth — subscription.plan can still be the 'starter' signup placeholder for a tenant on
  // Free Trial whose checkout hasn't been confirmed by a webhook yet (checkoutService.ts).
  const isFreeTrial = subscription.tenantPlan === null;

  // Passed to PlansModal as onSelectPlan (2026-08-19 — reusing the same full-featured modal
  // shown at signup, per Alejandro's request, instead of a bare two-button expand). Already-
  // paying tenants (provider set) go through the post-billing self-serve change-plan endpoint,
  // which schedules the change for next cycle without a new checkout. A tenant still on Free
  // Trial (no provider yet) goes straight to checkout with the chosen plan (2026-09-15, QA-88 —
  // this used to call updateTenantPlan first, writing Tenant.plan before any payment was
  // confirmed, which is also why the standalone "Subscribe" button is gone: "Change plan" is now
  // the only entry point into checkout, for both a first subscribe and swapping plans later).
  const handleSelectPlan = async (plan: PlanTier) => {
    if (hasProvider) {
      setPlanToConfirm(plan);
    } else {
      await redirectToCheckout(token, plan);
    }
  };

  // What a paid plan change does (backend changePlan, 2026-09-30): during the trial it switches now
  // with nothing charged; an upgrade charges the new plan's full price today and restarts the
  // billing cycle (Mercado Pago: the payer confirms it in MP first); a downgrade keeps the current
  // plan until currentPeriodEnd.
  const market = subscription.provider === 'mercadopago' ? 'ar' : marketForCountry(tenant?.country);
  const currentPlan = subscription.tenantPlan;
  const monthlyPriceFor = (plan: PlanTier): string => {
    const m = pricing?.markets[market];
    if (!pricing || !m || (plan !== 'starter' && plan !== 'growth')) return '—';
    const extraSeats = Math.max(0, subscription.activeSeats - pricing.includedSeats[plan]);
    return formatPlanPrice(m.plans[plan] + extraSeats * m.extraSeat, m.currency);
  };
  const planChangeMessage = (plan: PlanTier): string => {
    const values = { plan: PLAN_LABEL[plan], current: currentPlan ? PLAN_LABEL[currentPlan] : '', price: monthlyPriceFor(plan) };
    if (subscription.status === 'trialing') return t('billing.planChangeConfirm.trial', values);
    if (currentPlan && PLAN_RANK[plan] > PLAN_RANK[currentPlan]) {
      return subscription.provider === 'mercadopago'
        ? t('billing.planChangeConfirm.upgradeMercadoPago', values)
        : t('billing.planChangeConfirm.upgradeCard', values);
    }
    return t('billing.planChangeConfirm.downgrade', { ...values, date: formatDate(subscription.currentPeriodEnd) });
  };

  const runPlanChange = async (plan: PlanTier) => {
    setChangingPlan(true);
    try {
      const result = await api.changeSubscriptionPlan(token, plan);
      const values = { plan: PLAN_LABEL[plan], date: formatDate(result.effectiveAt) };
      if (result.initPoint) {
        openExternalUrl(result.initPoint);
        toast.success(t('billing.planChangeToast.upgradeInMercadoPago', values));
      } else {
        toast.success(t(`billing.planChangeToast.${result.outcome}`, values));
      }
      setPlanToConfirm(null);
      load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setChangingPlan(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await api.cancelSubscription(token);
      toast.success(t('billing.cancellationScheduled'));
      setShowCancelConfirm(false);
      load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setCancelling(false);
    }
  };

  // For the orphan case Alejandro hit (2026-09-15, QA-89): a plan chosen via Mercado Pago's
  // checkout before its preapproval webhook ever confirmed — Tenant.plan shows a real plan, but
  // subscription.provider is still null (checkoutService.ts's MP branch writes the plan
  // immediately, no metadata channel to defer it like Dodo's checkout gets). No real subscription
  // exists anywhere to cancel, so this just clears the local choice instead of calling
  // handleCancel/api.cancelSubscription, which would reject with "No active paid subscription".
  const handleClearPlan = async () => {
    setCancelling(true);
    try {
      await api.clearUnconfirmedPlan(token);
      toast.success(t('billing.backToFreeTrialToast'));
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
      toast.success(t('billing.subscriptionResumed'));
      load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setResuming(false);
    }
  };

  const handleViewInvoice = async (invoiceId: string) => {
    setViewingInvoiceId(invoiceId);
    try {
      const url = await api.getInvoiceDocumentUrl(token, invoiceId);
      openExternalUrl(url);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setViewingInvoiceId(null);
    }
  };

  return (
    <div className="max-w-6xl flex flex-col gap-2.5">
      <div className="card">
        <h3 className="card-title">{t('billing.planCardTitle')}</h3>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold">
              {isFreeTrial ? t('billing.freeTrialLabel') : PLAN_LABEL[subscription.tenantPlan!]}
            </span>
            {!isFreeTrial && (
              <span className="text-sm text-ink-muted">
                {formatMoney(subscription.lockedPriceCents, subscription.currency)}
                {t('billing.perMonthSuffix')}
              </span>
            )}
            {!isFreeTrial && (
              <StatusBadge
                status={hasPendingCancellation ? 'cancel_scheduled' : subscription.status}
                label={hasPendingCancellation ? t('billing.status.ending') : undefined}
              />
            )}
          </div>
          {!hasPendingCancellation && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowPlansModal(true)}>
              {t('billing.changePlan')}
            </button>
          )}
        </div>
        {isFreeTrial ? (
          <p className="text-sm text-ink-faint mb-2">
            {t('billing.trialEndsHint', { date: formatDate(subscription.trialEndsAt) })}
          </p>
        ) : (
          dateInfo && (
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
          )
        )}

        {subscription.pendingPlan && (
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2 text-sm">
            <span className="text-amber-700 dark:text-amber-400">
              {t('billing.pendingPlanChange', {
                plan: PLAN_LABEL[subscription.pendingPlan],
                date: formatDate(subscription.currentPeriodEnd),
              })}
            </span>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => currentPlan && runPlanChange(currentPlan)}
              disabled={changingPlan}
            >
              {t('billing.cancelPendingPlanChange')}
            </button>
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-line dark:border-dark-line flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm">
            <span className="font-medium">
              {subscription.activeSeats}/{subscription.includedSeats}
            </span>{' '}
            <span className="text-ink-muted">{t('billing.seatsIncluded')}</span>
            {subscription.extraSeats > 0 && (
              <span className="text-ink-muted">
                {' '}
                {t('billing.extraSeats', {
                  count: subscription.extraSeats,
                  price: formatMoney(subscription.extraSeatsCostCents, subscription.currency),
                })}
              </span>
            )}
          </span>
          {isFreeTrial && subscription.activeSeats >= subscription.includedSeats && (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              {t('billing.freeTrialCapped', { count: subscription.includedSeats })}
            </span>
          )}
        </div>

        {hasProvider && !hasPendingCancellation && subscription.status !== 'cancelled' && (
          <div className="mt-3 pt-3 border-t border-line dark:border-dark-line">
            <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => setShowCancelConfirm(true)}>
              {t('billing.cancelSubscription')}
            </button>
          </div>
        )}
        {!hasProvider && !isFreeTrial && (
          <div className="mt-3 pt-3 border-t border-line dark:border-dark-line">
            <button type="button" className="btn-ghost btn-sm text-danger" onClick={handleClearPlan} disabled={cancelling}>
              {cancelling ? t('billing.clearing') : t('billing.backToFreeTrial')}
            </button>
          </div>
        )}
        {hasPendingCancellation && (
          <div className="mt-3 pt-3 border-t border-line dark:border-dark-line">
            <button type="button" className="btn btn-outline btn-sm" onClick={handleResume} disabled={resuming}>
              {resuming ? t('billing.resuming') : t('billing.resumeSubscription')}
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">{t('billing.paymentMethodCardTitle')}</h3>
        {hasProvider ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <BriefcaseIcon className="h-4 w-4 text-ink-faint" />
              <span className="text-sm">
                {subscription.paymentMethodBrand === 'account_money'
                  ? t('billing.mercadoPagoBalance')
                  : subscription.paymentMethodBrand && subscription.paymentMethodLast4
                    ? `${formatCardBrand(subscription.paymentMethodBrand)} •••• ${subscription.paymentMethodLast4}`
                    : subscription.paymentMethodBrand
                      ? formatCardBrand(subscription.paymentMethodBrand)
                      : t('billing.cardOnFile')}
              </span>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowAddPaymentMethod(true)}>
              {t('billing.updatePaymentMethod')}
            </button>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{t('billing.noPaymentMethod')}</p>
        )}
      </div>

      <div className="card">
        <h3 className="card-title">{t('billing.invoicesCardTitle')}</h3>
        {subscription.invoices.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('billing.noInvoices')}</p>
        ) : (
          <div className="full-table-wrap">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-faint">
                <th className="font-normal py-1.5">{t('billing.columns.date')}</th>
                <th className="font-normal py-1.5">{t('billing.columns.amount')}</th>
                <th className="font-normal py-1.5">{t('billing.columns.status')}</th>
                <th className="font-normal py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {subscription.invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t border-line dark:border-dark-line">
                  <td className="py-1.5">{formatDate(invoice.paidAt ?? invoice.createdAt)}</td>
                  <td className="py-1.5">
                    {formatMoney(invoice.amountCents, invoice.currency)}
                    {invoice.baseAmountCents != null && invoice.extraSeatsAmountCents != null && invoice.extraSeatsAmountCents > 0 && (
                      <span className="block text-xs text-ink-faint">
                        {t('billing.invoiceSeatsBreakdown', {
                          base: formatMoney(invoice.baseAmountCents, invoice.currency),
                          extra: formatMoney(invoice.extraSeatsAmountCents, invoice.currency),
                        })}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5">
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    {invoice.provider === 'dodopayments' && (
                      <button
                        type="button"
                        className="text-xs text-accent underline disabled:opacity-50"
                        onClick={() => handleViewInvoice(invoice.id)}
                        disabled={viewingInvoiceId === invoice.id}
                      >
                        {viewingInvoiceId === invoice.id ? t('billing.opening') : t('billing.viewInvoice')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <AddPaymentMethodModal open={showAddPaymentMethod} token={token} provider={subscription.provider} onClose={() => setShowAddPaymentMethod(false)} />

      <PlansModal
        open={showPlansModal}
        tenant={tenant}
        onClose={() => setShowPlansModal(false)}
        onSelectPlan={handleSelectPlan}
        currentPlan={subscription.tenantPlan}
      />

      {planToConfirm && (
        <ConfirmDialog
          title={t('billing.planChangeConfirm.title', { plan: PLAN_LABEL[planToConfirm] })}
          message={planChangeMessage(planToConfirm)}
          confirmLabel={changingPlan ? t('billing.planChangeConfirm.confirming') : t('billing.planChangeConfirm.confirm')}
          confirmDisabled={changingPlan}
          onConfirm={() => runPlanChange(planToConfirm)}
          onCancel={() => setPlanToConfirm(null)}
        />
      )}

      {showCancelConfirm && (
        <ConfirmDialog
          title={t('billing.cancelConfirm.title')}
          message={
            dateInfo?.date
              ? t('billing.cancelConfirm.messageWithDate', { date: formatDate(subscription.currentPeriodEnd) })
              : t('billing.cancelConfirm.messageNoDate')
          }
          confirmLabel={cancelling ? t('billing.cancelConfirm.cancelling') : t('billing.cancelSubscription')}
          confirmDisabled={cancelling}
          onConfirm={handleCancel}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}
    </div>
  );
}
