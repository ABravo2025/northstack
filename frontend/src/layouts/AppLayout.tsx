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
  const [plansModalDismissed, setPlansModalDismissed] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!tenant) return;
    setPlansModalDismissed(localStorage.getItem(plansModalDismissedKey(tenant.id)) === '1');
  }, [tenant?.id]);

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  // Shown once, automatically, right when a workspace is created — a dismissible modal over
  // whatever screen the person lands on, not a route that blocks navigation (corrected
  // 2026-08-13: the trial already started at registration regardless of plan choice, this is
  // an upsell prompt, not a gate). Owner-only — PATCH /api/tenants/me/plan is owner-gated, and
  // a member who happens to log in before the owner has picked a plan shouldn't be nagged
  // about a decision they can't make.
  const showPlansModal =
    Boolean(tenant) &&
    tenant!.status === 'trialing' &&
    tenant!.plan === null &&
    user.role === 'owner' &&
    !plansModalDismissed;

  const dismissPlansModal = () => {
    if (tenant) {
      localStorage.setItem(plansModalDismissedKey(tenant.id), '1');
    }
    setPlansModalDismissed(true);
  };

  return (
    <div className="app">
      <TopBar user={user} token={token} onLogout={onLogout} onMenuClick={() => setMobileSidebarOpen(true)} />
      <div className="app-shell">
        <Sidebar user={user} mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
        <main className="app-main">
          {tenant?.status === 'past_due' && tenant.gracePeriodEndsAt && (
            <div className="alert alert-warning mx-4 mt-4 sm:mx-6">
              Your free trial ended. You have {daysRemaining(tenant.gracePeriodEndsAt)} day
              {daysRemaining(tenant.gracePeriodEndsAt) === 1 ? '' : 's'} left before your account is suspended.
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
