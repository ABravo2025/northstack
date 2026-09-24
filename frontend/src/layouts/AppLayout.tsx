import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Sidebar from '../components/layout/Sidebar';
import SettingsSidebar from '../components/layout/SettingsSidebar';
import DashboardsSidebar from '../components/layout/DashboardsSidebar';
import TimeOffSidebar from '../components/layout/TimeOffSidebar';
import TopBar from '../components/layout/TopBar';
import MobileTabbar from '../components/layout/MobileTabbar';
import PrimaryActionFab from '../components/layout/PrimaryActionFab';
import PlansModal from '../components/common/PlansModal';
import ProductTour from '../components/tour/ProductTour';
import { useToast } from '../components/common/ToastProvider';
import type { PlanTier, Tenant } from '../api';
import { daysRemainingUntil } from '../lib/trial';
import { redirectToCheckout } from '../lib/checkout';
import { usePermissions } from '../contexts/PermissionsContext';
import { PrimaryActionProvider } from '../contexts/PrimaryActionContext';
import { TimeOffTabProvider } from '../contexts/TimeOffTabContext';
import { useNewVersionAvailable } from '../hooks/useNewVersionAvailable';

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

export default function AppLayout({ user, token, tenant, onLogout }: AppLayoutProps) {
  const { t } = useTranslation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Session-only "I closed it" flag — the actual dismissed/not-dismissed fact is derived from
  // localStorage during render below (dismissedInStorage), not mirrored into state, so there's
  // no post-paint useEffect correction and no one-frame flash of the modal on reload for owners
  // who already dismissed it.
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const [plansModalForceOpen, setPlansModalForceOpen] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [tourReplaySignal, setTourReplaySignal] = useState(0);
  const location = useLocation();
  const permissions = usePermissions();
  const toast = useToast();
  const newVersionAvailable = useNewVersionAvailable();

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  // Custom Roles Fase J — migrated off `user.role === 'owner'`. PATCH /api/tenants/me/plan is
  // gated by canManageBilling (Fase B), not a hardcoded owner check — a member who can't manage
  // billing shouldn't be nagged about a decision they can't make.
  const needsPlanSelection =
    Boolean(tenant) && tenant!.status === 'trialing' && tenant!.plan === null && permissions.has('manage_billing');

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
  // already has. Straight to the provider's checkout, no confirmation modal in between
  // (2026-09-14 — see lib/checkout.ts's redirectToCheckout comment).
  //
  // No longer calls api.updateTenantPlan first (2026-09-15, QA-88 — that wrote Tenant.plan
  // immediately, showing e.g. "Starter" as the tenant's plan before any payment was ever
  // confirmed, including for someone who abandoned checkout without paying). `plan` goes
  // straight into redirectToCheckout instead; the backend only sets it for real once the
  // checkout's payment is confirmed by the provider's webhook.
  const handleSelectPlanAndCheckout = async (plan: PlanTier) => {
    dismissPlansModal();
    await redirectToCheckout(token!, plan);
  };

  // Shared by the past_due/suspended banners' "Add payment method" buttons below — same
  // straight-to-checkout behavior as handleSelectPlanAndCheckout, just without a plan choice
  // first (the tenant already has one; they're re-attaching a card to the same plan).
  const handleAddPaymentMethod = async () => {
    setStartingCheckout(true);
    try {
      await redirectToCheckout(token!);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setStartingCheckout(false);
    }
  };

  return (
    <PrimaryActionProvider>
    <TimeOffTabProvider>
    <div className="app">
      <TopBar
        user={user}
        token={token}
        onLogout={onLogout}
        onMenuClick={() => setMobileSidebarOpen(true)}
        onReplayTour={() => setTourReplaySignal((n) => n + 1)}
      />
      <div className="app-shell">
        {location.pathname.startsWith('/settings') ? (
          <SettingsSidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
        ) : location.pathname.startsWith('/dashboards') ? (
          <DashboardsSidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
        ) : location.pathname.startsWith('/hr/time-off') ? (
          <TimeOffSidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
        ) : (
          <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} tenant={tenant} />
        )}
        <main className="app-main">
          {newVersionAvailable && (
            <div className="alert alert-info mx-4 mt-4 sm:mx-6 flex items-center justify-between gap-3">
              <span>{t('banners.newVersion')}</span>
              <button
                type="button"
                className="btn btn-outline btn-sm whitespace-nowrap"
                onClick={() => window.location.reload()}
              >
                {t('banners.reload')}
              </button>
            </div>
          )}
          {tenant?.status === 'suspended' && permissions.has('manage_billing') && (
            <div className="alert alert-error mx-4 mt-4 sm:mx-6 flex items-center justify-between gap-3">
              <span>{t('banners.suspended')}</span>
              <button
                type="button"
                className="btn btn-outline btn-sm whitespace-nowrap"
                onClick={handleAddPaymentMethod}
                disabled={startingCheckout}
              >
                {startingCheckout ? t('banners.starting') : t('banners.addPaymentMethod')}
              </button>
            </div>
          )}
          {tenant?.status === 'past_due' && tenant.gracePeriodEndsAt && (
            <div className="alert alert-warning mx-4 mt-4 sm:mx-6 flex items-center justify-between gap-3">
              <span>{t('banners.pastDue', { count: daysRemainingUntil(tenant.gracePeriodEndsAt) })}</span>
              {permissions.has('manage_billing') && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm whitespace-nowrap"
                  onClick={handleAddPaymentMethod}
                  disabled={startingCheckout}
                >
                  {startingCheckout ? t('banners.starting') : t('banners.addPaymentMethod')}
                </button>
              )}
            </div>
          )}
          {needsPlanSelection && !showPlansModal && (
            <div className="alert alert-info mx-4 mt-4 sm:mx-6 flex items-center justify-between gap-3">
              <span>{t('banners.noPlanYet')}</span>
              <button
                type="button"
                className="btn btn-outline btn-sm whitespace-nowrap"
                onClick={() => setPlansModalForceOpen(true)}
              >
                {t('banners.choosePlan')}
              </button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
      <MobileTabbar />
      <PrimaryActionFab />
      <PlansModal
        open={showPlansModal}
        tenant={tenant}
        onClose={dismissPlansModal}
        onSelectPlan={handleSelectPlanAndCheckout}
      />
      <ProductTour token={token ?? ''} user={user} replaySignal={tourReplaySignal} />
    </div>
    </TimeOffTabProvider>
    </PrimaryActionProvider>
  );
}
