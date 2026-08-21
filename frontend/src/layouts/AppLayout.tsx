import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import MobileTabbar from '../components/layout/MobileTabbar';
import PlansModal from '../components/common/PlansModal';
import AddPaymentMethodModal from '../components/common/AddPaymentMethodModal';
import { api } from '../api';
import type { PlanTier, Tenant } from '../api';
import { daysRemainingUntil } from '../lib/trial';

interface AppLayoutProps {
  user: any;
  token: string | null;
  tenant: Tenant | null;
  onTenantUpdated: (tenant: Tenant) => void;
  onLogout: () => void;
}

function plansModalDismissedKey(tenantId: string): string {
  return `northstack:dismissedPlansModal:${tenantId}`;
}

export default function AppLayout({ user, token, tenant, onTenantUpdated, onLogout }: AppLayoutProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Session-only "I closed it" flag — the actual dismissed/not-dismissed fact is derived from
  // localStorage during render below (dismissedInStorage), not mirrored into state, so there's
  // no post-paint useEffect correction and no one-frame flash of the modal on reload for owners
  // who already dismissed it.
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const [plansModalForceOpen, setPlansModalForceOpen] = useState(false);
  const [showAddPaymentMethod, setShowAddPaymentMethod] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  // Owner-only — PATCH /api/tenants/me/plan is owner-gated, and a member who happens to log in
  // before the owner has picked a plan shouldn't be nagged about a decision they can't make.
  const needsPlanSelection =
    Boolean(tenant) && tenant!.status === 'trialing' && tenant!.plan === null && user.role === 'owner';

  const dismissedInStorage = tenant ? localStorage.getItem(plansModalDismissedKey(tenant.id)) === '1' : false;

  // Shown once, automatically, right when a workspace is created — a dismissible modal over
  // whatever screen the person lands on, not a route that blocks navigation (corrected
  // 2026-08-13: the trial already started at registration regardless of plan choice, this is
  // an upsell prompt, not a gate). Dismissing it isn't a dead end, though (2026-08-18 fix): the
  // "Choose a plan" banner below stays up and can reopen it via plansModalForceOpen.
  const showPlansModal = needsPlanSelection && (plansModalForceOpen || !(sessionDismissed || dismissedInStorage));

  const dismissPlansModal = () => {
    if (tenant) {
      localStorage.setItem(plansModalDismissedKey(tenant.id), '1');
    }
    setSessionDismissed(true);
    setPlansModalForceOpen(false);
  };

  // Picking a paid plan (Starter/Growth — never Free Trial, PlansModal never calls this for
  // that card) now pays right away instead of just recording intent for later — Alejandro's
  // explicit correction (2026-08-20): no more "trial without a card" once a paid plan is
  // actually chosen, matching the same immediate-checkout behavior BillingPage's "Change plan"
  // already has. Reuses AddPaymentMethodModal (already has all the Paddle.js/redirect handling)
  // instead of duplicating it here.
  const handleSelectPlanAndCheckout = async (plan: PlanTier) => {
    const updated = await api.updateTenantPlan(token!, plan);
    onTenantUpdated(updated);
    dismissPlansModal();
    setShowAddPaymentMethod(true);
  };

  return (
    <div className="app">
      <TopBar user={user} token={token} onLogout={onLogout} onMenuClick={() => setMobileSidebarOpen(true)} />
      <div className="app-shell">
        <Sidebar user={user} mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
        <main className="app-main">
          {tenant?.status === 'suspended' && user.role === 'owner' && (
            <div className="alert alert-error mx-4 mt-4 sm:mx-6 flex items-center justify-between gap-3">
              <span>
                Your workspace is in view-only mode — your subscription lapsed and the grace period ended. Add a
                payment method to restore full access.
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm whitespace-nowrap"
                onClick={() => setShowAddPaymentMethod(true)}
              >
                Add payment method
              </button>
            </div>
          )}
          {tenant?.status === 'past_due' && tenant.gracePeriodEndsAt && (
            <div className="alert alert-warning mx-4 mt-4 sm:mx-6 flex items-center justify-between gap-3">
              <span>
                Your free trial ended. You have {daysRemainingUntil(tenant.gracePeriodEndsAt)} day
                {daysRemainingUntil(tenant.gracePeriodEndsAt) === 1 ? '' : 's'} left before your account is suspended.
              </span>
              {user.role === 'owner' && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm whitespace-nowrap"
                  onClick={() => setShowAddPaymentMethod(true)}
                >
                  Add payment method
                </button>
              )}
            </div>
          )}
          {needsPlanSelection && !showPlansModal && (
            <div className="alert alert-info mx-4 mt-4 sm:mx-6 flex items-center justify-between gap-3">
              <span>You haven't picked a plan yet — your trial is still active.</span>
              <button
                type="button"
                className="btn btn-outline btn-sm whitespace-nowrap"
                onClick={() => setPlansModalForceOpen(true)}
              >
                Choose a plan
              </button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
      <MobileTabbar />
      <AddPaymentMethodModal
        open={showAddPaymentMethod}
        token={token}
        // Defaults to "subscribe" — the common case for this banner is a trial that lapsed
        // without ever attaching a payment method. A past_due tenant whose *renewal* failed
        // (already has a provider) would more accurately read "update", but AppLayout doesn't
        // load the full Subscription just for this banner's copy — checkoutService.ts still
        // routes correctly either way based on the tenant's real provider state, this only
        // affects the modal's wording in that edge case.
        mode="subscribe"
        trialDaysRemaining={tenant ? daysRemainingUntil(tenant.trialEndsAt) : 0}
        onClose={() => setShowAddPaymentMethod(false)}
      />
      <PlansModal
        open={showPlansModal}
        tenant={tenant}
        token={token}
        onClose={dismissPlansModal}
        onPlanChosen={(updated) => {
          onTenantUpdated(updated);
          dismissPlansModal();
        }}
        onSelectPlan={handleSelectPlanAndCheckout}
      />
    </div>
  );
}
