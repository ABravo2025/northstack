import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import MobileTabbar from '../components/layout/MobileTabbar';
import PlansModal from '../components/common/PlansModal';
import type { Tenant } from '../api';

interface AppLayoutProps {
  user: any;
  token: string | null;
  tenant: Tenant | null;
  onTenantUpdated: (tenant: Tenant) => void;
  onLogout: () => void;
}

function daysRemaining(target: string): number {
  const ms = new Date(target).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
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

  return (
    <div className="app">
      <TopBar user={user} token={token} onLogout={onLogout} onMenuClick={() => setMobileSidebarOpen(true)} />
      <div className="app-shell">
        <Sidebar user={user} mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
        <main className="app-main">
          {tenant?.status === 'suspended' && user.role === 'owner' && (
            <div className="alert alert-error mx-4 mt-4 sm:mx-6">
              Your workspace is in view-only mode — your subscription lapsed and the grace period ended. Choose a
              plan to restore full access.
            </div>
          )}
          {tenant?.status === 'past_due' && tenant.gracePeriodEndsAt && (
            <div className="alert alert-warning mx-4 mt-4 sm:mx-6">
              Your free trial ended. You have {daysRemaining(tenant.gracePeriodEndsAt)} day
              {daysRemaining(tenant.gracePeriodEndsAt) === 1 ? '' : 's'} left before your account is suspended.
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
      <PlansModal
        open={showPlansModal}
        tenant={tenant}
        token={token}
        onClose={dismissPlansModal}
        onPlanChosen={(updated) => {
          onTenantUpdated(updated);
          dismissPlansModal();
        }}
      />
    </div>
  );
}
