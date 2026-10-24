import { useState, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from './api';
import type { PermissionsPayload, Tenant } from './api';
import { setActiveSessionToken, setUnauthorizedHandler } from './api/http';
import { SUPPORT_TOKEN_KEY, getSupportToken } from './lib/supportSession';
import i18n from './lib/i18n';
import { useToast } from './components/common/ToastProvider';
import { PermissionsProvider, usePermissions } from './contexts/PermissionsContext';
import { isGrowthFeatureEnabled, planFeaturesFor } from './lib/planLimits';
import TableSkeleton from './components/common/TableSkeleton';
import LoginPage from './pages/LoginPage';
import { readDeviceToken } from './api/twoStep';
import { TWO_STEP_CHANGED } from './components/settings/TwoStepCard';
import type { TwoStepPending } from './api/types';
import RegisterPage from './pages/RegisterPage';
import CompleteSignupPage from './pages/CompleteSignupPage';
import ReferralsPage from './pages/ReferralsPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AcceptInvitePage from './pages/AcceptInvitePage';
import ContractConfirmationPage from './pages/ContractConfirmationPage';
import OverviewPage from './pages/OverviewPage';
import MyTasksPage from './pages/MyTasksPage';
import ProjectsPage from './pages/ProjectsPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import HelpPage from './pages/HelpPage';
import GuidePage from './pages/GuidePage';
import DashboardsLayout from './layouts/DashboardsLayout';
import DashboardsHomePage from './pages/DashboardsHomePage';
import DashboardsHrPage from './pages/dashboards/DashboardsHrPage';
import DashboardsTimeOffPage from './pages/dashboards/DashboardsTimeOffPage';
import DashboardsPayrollPage from './pages/dashboards/DashboardsPayrollPage';
import DashboardsSalesPage from './pages/dashboards/DashboardsSalesPage';
import DashboardsPaymentsPage from './pages/dashboards/DashboardsPaymentsPage';
import DashboardsTasksPage from './pages/dashboards/DashboardsTasksPage';
import DashboardsAdoptionPage from './pages/dashboards/DashboardsAdoptionPage';
import EmployeesPage from './pages/EmployeesPage';
import TimeOffOverviewPage from './pages/TimeOffOverviewPage';
import CompaniesPage from './pages/CompaniesPage';
import ContactsPage from './pages/ContactsPage';
import PipelinesSettingsPage from './pages/PipelinesSettingsPage';
import OpportunitiesPage from './pages/OpportunitiesPage';
import ProfileSettingsPage from './pages/ProfileSettingsPage';
import IntegrationsSettingsPage from './pages/IntegrationsSettingsPage';
import CompanyPage from './pages/CompanyPage';
import TimeOffSettingsPage from './pages/TimeOffSettingsPage';
import ShiftsSettingsPage from './pages/ShiftsSettingsPage';
import PayrollOverviewPage from './pages/payroll/PayrollOverviewPage';
import PayslipsPage from './pages/payroll/PayslipsPage';
import MyPayslipsPage from './pages/payroll/MyPayslipsPage';
import VerifyPayslipPage from './pages/payroll/VerifyPayslipPage';
import ShiftsSchedulePage from './pages/shifts/ShiftsSchedulePage';
import MyShiftsPage from './pages/shifts/MyShiftsPage';
import TimesheetPage from './pages/shifts/TimesheetPage';
import TimesheetApprovalsPage from './pages/shifts/TimesheetApprovalsPage';
import HoursReportPage from './pages/shifts/HoursReportPage';
import ShiftRequestsPage from './pages/shifts/ShiftRequestsPage';
import TodayBoardPage from './pages/shifts/TodayBoardPage';
import ClockPage from './pages/shifts/ClockPage';
import ShiftResponsePage from './pages/shifts/ShiftResponsePage';
import ClientReportPage from './pages/shifts/ClientReportPage';
import { useCanSchedule } from './components/layout/ShiftsSidebar';
import CompanyUsersPage from './pages/CompanyUsersPage';
import PublicFormsSettingsPage from './pages/PublicFormsSettingsPage';
import ActivityLogSettingsPage from './pages/ActivityLogSettingsPage';
import RolesPermissionsPage from './pages/RolesPermissionsPage';
import PublicFormPage from './pages/PublicFormPage';
import ApiDocsPage from './pages/ApiDocsPage';
import BillingPage from './pages/BillingPage';
import PaymentsOverviewPage from './pages/PaymentsOverviewPage';
import PayrollPage from './pages/PayrollPage';
import PayrollRunDetailPage from './pages/PayrollRunDetailPage';
import AppLayout from './layouts/AppLayout';
import WorkspaceSettingsLayout from './layouts/WorkspaceSettingsLayout';
import SettingsHomePage from './pages/SettingsHomePage';
import { isPublicFormsEnabled } from './lib/featureFlags';
import { clearReturnTo, peekReturnTo, rememberReturnTo } from './lib/returnTo';
import OAuthConsentPage from './pages/OAuthConsentPage';
import './App.css';
import { setNumberCountry } from './lib/currencies';
import { setTenantCountry } from './lib/countries';

export default function App() {
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const isAcceptInviteRoute = location.pathname.startsWith('/accept-invite');
  const isConfirmContractRoute = location.pathname.startsWith('/confirm-contract');
  const isResetPasswordRoute = location.pathname.startsWith('/reset-password');
  const isRegisterCompleteRoute = location.pathname.startsWith('/register/complete');

  // A support session (Admin Center v2) lives in this tab only: see lib/supportSession.ts.
  const [token, setToken] = useState<string | null>(getSupportToken() ?? localStorage.getItem('token'));
  const [user, setUser] = useState<any>(null);
  const [permissions, setPermissions] = useState<PermissionsPayload | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(
    () =>
      !isAcceptInviteRoute &&
      !isConfirmContractRoute &&
      !isResetPasswordRoute &&
      !isRegisterCompleteRoute &&
      Boolean(getSupportToken() ?? localStorage.getItem('token')),
  );

  // Keeps http.ts's copy of "which token is the app's active session" current — apiFetch uses it
  // to tell the active session's own request 401ing (real expiration) apart from an unrelated
  // request 401ing with some other token (e.g. AcceptInvitePage logging in a second account in
  // the same tab). Runs before the session-restore effect below on every render that changes
  // `token`, so that effect's own api.getCurrentUser(token) call is always checked against the
  // right value.
  useEffect(() => {
    setActiveSessionToken(token);
  }, [token]);

  // Single place that applies the signed-in user's language preference — every setUser call site
  // (session restore, login, ProfileSettingsPage's selector, etc.) flows through here instead of
  // each one calling i18n.changeLanguage itself. Null locale (never chosen) leaves i18next on
  // whatever the browser-language detector already picked.
  useEffect(() => {
    if (user?.locale && i18n.language !== user.locale) {
      i18n.changeLanguage(user.locale);
    }
  }, [user?.locale]);

  useEffect(() => {
    if (isAcceptInviteRoute || isConfirmContractRoute || isResetPasswordRoute || isRegisterCompleteRoute) {
      // Handling an invite/contract-confirmation/password-reset/signup-completion link: never
      // auto-restore a stored session, whoever clicked it may not be whoever last used this
      // browser.
      return;
    }

    if (token) {
      setCheckingSession(true);
      // Run in parallel, not chained — getCurrentTenant only needs the token, not the user
      // response, so sequencing them doubled the round-trip on every session restore. The
      // tenant fetch stays best-effort (powers PlansModal + the past_due banner in AppLayout);
      // a failure there shouldn't block being logged in, so it's swallowed independently rather
      // than failing the whole Promise.all.
      // Only a server rejection (401/403) ends the stored session. A network error, a request
      // cut off by a reload, or a 5xx is retried twice and, if it keeps failing, shows the login
      // without forgetting the token, so the next load restores the session (found 2026-10-12:
      // reloading while this check was in flight logged people out).
      const restore = (attempt: number): Promise<void> =>
        Promise.all([api.getCurrentUser(token), api.getCurrentTenant(token).catch(() => null)])
          .then(([userResponse, tenant]) => {
            setUser(userResponse.user);
            setPermissions({ ...userResponse.permissions, twoStep: userResponse.twoStep });
            if (tenant) {
              setTenant(tenant);
            }
          })
          .catch((error: unknown) => {
            const rejected = error instanceof ApiError && (error.status === 401 || error.status === 403);
            if (!rejected && attempt < 2) {
              return new Promise<void>((resolve) => setTimeout(resolve, 800 * (attempt + 1))).then(() => restore(attempt + 1));
            }
            setToken(null);
            if (rejected) {
              localStorage.removeItem('token');
            }
            return undefined;
          });
      restore(0).finally(() => setCheckingSession(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Shared by handleContractConfirmed/handlePasswordReset/handleInvitationAccepted/
  // handleSignupCompleted below (found live, 2026-09-15, QA-87 — a customer's first login and a
  // brand-new signup both showed a sidebar missing Payroll/the whole Sales group, permanently
  // until a manual reload). None of these actions' own responses carry `permissions` — only
  // GET /api/auth/me does (see AuthResponse in api/types.ts) — so they all depended on the
  // separate [token] effect above to fetch it after the fact, same as login did. But unlike
  // login, they navigate to /overview immediately, from a route the effect explicitly bails out
  // on (isAcceptInviteRoute/isConfirmContractRoute/isResetPasswordRoute/isRegisterCompleteRoute
  // — "whoever clicked it may not be whoever last used this browser"). react-router's
  // BrowserRouter wraps navigate()'s location update in startTransition, so that effect — fired
  // by this same setToken call, same tick as navigate — can still see the OLD guarded pathname
  // and skip the fetch entirely; since token only changes once, it would never retry, leaving
  // checkingSession stuck true (a permanent spinner, worse than the original bug) if these just
  // set it and waited on that effect. So this fetches user+permissions+tenant itself, gated
  // behind checkingSession (checked at the very top of this component, before Routes even
  // renders), instead of ever relying on that effect for a route it's designed to ignore.
  const adoptConfirmedSession = async (newToken: string) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
    setCheckingSession(true);
    navigate('/overview');
    try {
      const [{ user: fullUser, permissions, twoStep: twoStepFlags }, tenant] = await Promise.all([
        api.getCurrentUser(newToken),
        api.getCurrentTenant(newToken).catch(() => null),
      ]);
      setUser(fullUser);
      setPermissions({ ...permissions, twoStep: twoStepFlags });
      if (tenant) {
        setTenant(tenant);
      }
    } finally {
      setCheckingSession(false);
    }
  };

  const handleContractConfirmed = (newToken: string) => adoptConfirmedSession(newToken);
  const handlePasswordReset = (newToken: string) => adoptConfirmedSession(newToken);
  const handleInvitationAccepted = (newToken: string) => adoptConfirmedSession(newToken);

  // Two-step verification (spec-2fa.md): the password was right and a code / setup comes next.
  const [twoStep, setTwoStep] = useState<{ email: string; pending: TwoStepPending } | null>(null);

  // Settings → Profile turned two-step verification on/off: the banner follows without a reload.
  useEffect(() => {
    const onChange = (e: Event) => {
      const enabled = (e as CustomEvent<{ enabled: boolean }>).detail.enabled;
      setPermissions((prev) => (prev ? { ...prev, twoStep: { ...(prev.twoStep ?? { required: false }), enabled } } : prev));
    };
    window.addEventListener(TWO_STEP_CHANGED, onChange);
    return () => window.removeEventListener(TWO_STEP_CHANGED, onChange);
  }, []);

  const adoptLoginSession = (newToken: string) => {
    setTwoStep(null);
    setToken(newToken);
    localStorage.setItem('token', newToken);
  };

  const handleLogin = async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await api.login({ email, password, deviceToken: readDeviceToken(email) });
      if (response.mfa) {
        setTwoStep({ email, pending: response.mfa });
        return;
      }
      const newToken = response.session?.token;
      if (newToken) {
        adoptLoginSession(newToken);
        // Deliberately NOT setUser(response.user) here (found live, 2026-09-15 — a customer's
        // first login showed a sidebar missing Payroll/the whole Sales group, permanently until
        // a manual reload): setting `user` this early made isAuthenticated true — and AppLayout
        // render for real — before the [token] effect below has fetched permissions/tenant, so
        // Sidebar's usePermissions()/isGrowthFeatureEnabled(tenant) rendered fail-closed against
        // null. Leaving `user` unset here means isAuthenticated stays false (LoginPage keeps
        // showing) until that effect's Promise.all resolves and sets user+permissions+tenant
        // together — AppLayout's first-ever render then already has everything it needs.
      }
    } catch (error) {
      // /api/auth/login never returns a `field` (unlike registration) — always a toast.
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // CompleteSignupPage already called POST /api/tenants/register itself (it owns the 3-step
  // survey's own loading/error state) — this just adopts the resulting session via the same
  // adoptConfirmedSession helper above (same isRegisterCompleteRoute trap applies here as
  // isConfirmContractRoute/isResetPasswordRoute/isAcceptInviteRoute do to those three). Lands on
  // /overview directly — PlansModal (AppLayout) shows itself automatically over that screen for
  // a fresh trialing tenant, it isn't a route of its own (2026-08-13 correction). Re-fetches
  // tenant via adoptConfirmedSession rather than reusing the register response's own `tenant`
  // (one extra request) — simpler than a one-off variant just for this call site.
  const handleSignupCompleted = (newToken: string) => adoptConfirmedSession(newToken);

  // Shared by handleLogout and the unauthorizedHandler effect below — cleared together so a
  // second person logging in on the same tab (or, if the tenant fetch below fails, the same
  // person indefinitely) never sees the previous account's tenant: its past_due/suspended
  // banner, its PlansModal dismissal state, etc. No explicit navigate('/login') needed —
  // isAuthenticated below is derived from token/user, so clearing them falls back to the
  // login screen on its own.
  const clearSession = () => {
    setToken(null);
    setUser(null);
    setPermissions(null);
    setTenant(null);
    if (getSupportToken()) {
      // Ending a support session must not log out whoever is signed in normally in this browser.
      sessionStorage.removeItem(SUPPORT_TOKEN_KEY);
      return;
    }
    localStorage.removeItem('token');
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await api.logout(token);
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    clearSession();
  };

  // Registered once so http.ts's apiFetch — a plain fetch wrapper with no access to React state —
  // can force a logout the moment ANY authenticated request comes back 401, instead of leaving a
  // dead session's UI silently showing misleading empty states on every page (found live,
  // 2026-09-10). The token is already invalid server-side, so there's nothing to call
  // DELETE /api/auth/logout for — this only ever needs to clear local state.
  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, []);

  if (checkingSession) {
    return (
      <div className="container">
        <TableSkeleton rows={4} />
      </div>
    );
  }

  const isAuthenticated = Boolean(token && user);
  // Plan-tier hiding (2026-10-01) — a Starter tenant guessing a Growth-only URL is sent back
  // instead of landing on a page whose "no permission / owner only" copy would misread as a
  // role problem. Sidebar/sections already hide the links themselves (see PermissionsContext).
  // Money and hours follow the company's country (lib/currencies.ts). Set during render, not in an
  // effect, so the first paint after the tenant loads already uses it.
  setNumberCountry(tenant?.country);
  setTenantCountry(tenant?.country);
  const growthPlan = isGrowthFeatureEnabled(tenant);
  // Per module since 2026-10-03 (plan + Admin Center agreement, from GET /api/auth/me).
  const features = planFeaturesFor(tenant, permissions);
  const featureOnly = (feature: keyof typeof features, element: React.ReactElement, fallback: string) =>
    features[feature] ? element : <Navigate to={fallback} replace />;

  return (
    <PermissionsProvider payload={permissions} growthPlan={growthPlan} features={features}>
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <AfterLogin />
          ) : (
            <LoginPage
              onLogin={handleLogin}
              twoStep={twoStep}
              onTwoStepDone={adoptLoginSession}
              onTwoStepCancel={(message) => {
                setTwoStep(null);
                if (message) toast.error(message);
              }}
              onSwitchToRegister={() => navigate('/register')}
              onForgotPassword={() => navigate('/forgot-password')}
              loading={loading}
            />
          )
        }
      />
      <Route
        path="/register"
        element={
          isAuthenticated ? (
            <Navigate to="/overview" replace />
          ) : (
            <RegisterPage onSwitchToLogin={() => navigate('/login')} />
          )
        }
      />
      <Route path="/register/complete" element={<CompleteSignupPage onRegistered={handleSignupCompleted} />} />
      <Route
        path="/forgot-password"
        element={
          isAuthenticated ? (
            <Navigate to="/overview" replace />
          ) : (
            <ForgotPasswordPage onBackToLogin={() => navigate('/login')} />
          )
        }
      />
      <Route path="/reset-password/:token" element={<ResetPasswordPage onReset={handlePasswordReset} />} />
      {/* OAuth consent for AI assistants (spec-mcp-server.md §4.1) — signed out, sign in first and come back. */}
      <Route
        path="/oauth/authorize"
        element={isAuthenticated ? <OAuthConsentPage token={token!} user={user!} tenantName={tenant?.name ?? null} /> : <OAuthSignInFirst />}
      />
      <Route
        path="/accept-invite/:token"
        element={<AcceptInvitePage onAccepted={handleInvitationAccepted} />}
      />
      <Route
        path="/confirm-contract/:token"
        element={<ContractConfirmationPage onConfirmed={handleContractConfirmed} />}
      />
      {/* Shifts: the emailed one-click answer page — public, the token is the credential. */}
      <Route path="/shift-response/:token" element={<ShiftResponsePage />} />
      {/* Shifts phase 2: the hours report shared with a client — public, the token is the credential. */}
      <Route path="/client-report/:token" element={<ClientReportPage />} />
      {/* Payroll v2: the QR / code printed on a payslip — public, shows no amounts. */}
      <Route path="/verify/:code" element={<VerifyPayslipPage />} />
      <Route
        path="/apply/:tenantSlug/:formSlug"
        element={
          isPublicFormsEnabled() ? <PublicFormPage /> : <Navigate to={isAuthenticated ? '/overview' : '/login'} replace />
        }
      />
      {/* Private API reference (spec-private-api-webhooks.md §8) — authenticated-only (Alejandro,
          2026-09-08: not public, only reachable by someone already logged into the workspace),
          linked from Settings -> Integrations -> API & Webhooks. Deliberately NOT nested under
          AppLayout below (which would render it squeezed next to Northstack's own sidebar) — Redoc
          needs the full viewport for its own 3-panel layout, so this route does its own
          isAuthenticated redirect instead, same ternary pattern as /login above. The token lives
          in localStorage (read fresh on mount), so opening this in a new tab — the link opens
          target="_blank" — still authenticates correctly against the same browser session.
          Deliberately NOT under /api-docs — the dev server's Vite proxy (vite.config.ts) matches
          any path starting with "/api" (including "/api-docs", no slash needed) and forwards it
          to the Express backend, which has no route for it ("Cannot GET /api-docs"). Vercel's own
          production rewrite (/api/(.*)) needs a literal trailing slash so it wouldn't have hit
          this in prod, but /developers avoids the footgun in both environments instead of relying
          on that regex boundary. */}
      <Route path="/developers" element={isAuthenticated ? featureOnly('apiAccess', <ApiDocsPage />, '/settings/integrations') : <Navigate to="/login" replace />} />

      <Route
        element={
          <AppLayout user={user} token={token} tenant={tenant} onTenantUpdated={setTenant} onLogout={handleLogout} />
        }
      >
        <Route path="/overview" element={<OverviewPage token={token ?? ''} user={user} />} />
        <Route path="/tasks" element={<MyTasksPage token={token ?? ''} user={user} />} />
        <Route path="/projects" element={<ProjectsPage token={token ?? ''} />} />
        <Route path="/shifts" element={<ShiftsHome token={token ?? ''} />} />
        <Route path="/shifts/mine" element={<MyShiftsPage token={token ?? ''} />} />
        <Route path="/shifts/timesheet" element={<TimesheetPage token={token ?? ''} />} />
        <Route path="/shifts/approvals" element={<TimesheetApprovalsPage token={token ?? ''} />} />
        <Route path="/shifts/reports" element={<HoursReportPage token={token ?? ''} />} />
        <Route path="/shifts/requests" element={<ShiftRequestsPage token={token ?? ''} />} />
        <Route path="/shifts/today" element={<TodayBoardPage token={token ?? ''} />} />
        <Route path="/clock/:code" element={<ClockPage token={token ?? ''} />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage token={token ?? ''} user={user} />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/hr/dashboard" element={<Navigate to="/dashboards/hr" replace />} />
        <Route path="/dashboards" element={<DashboardsLayout token={token ?? ''} />}>
          <Route index element={<DashboardsHomePage />} />
          <Route path="hr" element={<DashboardsHrPage />} />
          <Route path="time-off" element={<DashboardsTimeOffPage />} />
          <Route path="payroll" element={featureOnly('payroll', <DashboardsPayrollPage />, '/dashboards')} />
          <Route path="payments" element={featureOnly('payments', <DashboardsPaymentsPage />, '/dashboards')} />
          <Route path="sales" element={<DashboardsSalesPage />} />
          <Route path="tasks" element={<DashboardsTasksPage />} />
          <Route path="adoption" element={<DashboardsAdoptionPage />} />
        </Route>
        <Route path="/hr/people" element={<EmployeesPage user={user} token={token ?? ''} />} />
        <Route path="/hr/employees" element={<Navigate to="/hr/people" replace />} />
        <Route path="/hr/time-off" element={<TimeOffOverviewPage user={user} token={token ?? ''} />} />
        {/* Payroll v2 (spec-payroll-v2.md §1): its own sidebar under /payroll; the old /hr/payroll links redirect. */}
        <Route path="/payroll" element={featureOnly('payroll', <PayrollHome token={token ?? ''} />, '/')} />
        <Route path="/payroll/runs" element={featureOnly('payroll', <PayrollPage token={token ?? ''} section="runs" />, '/')} />
        <Route path="/payroll/runs/:runId" element={featureOnly('payroll', <PayrollRunDetailPage token={token ?? ''} />, '/')} />
        <Route path="/payroll/one-off" element={featureOnly('payroll', <PayrollPage token={token ?? ''} section="oneoff" />, '/')} />
        <Route path="/payroll/people" element={featureOnly('payroll', <PayrollPage token={token ?? ''} section="people" />, '/')} />
        <Route path="/payroll/payslips" element={featureOnly('payroll', <PayslipsPage token={token ?? ''} />, '/')} />
        <Route path="/payroll/mine" element={featureOnly('payroll', <MyPayslipsPage token={token ?? ''} />, '/')} />
        <Route path="/hr/payroll" element={<Navigate to="/payroll" replace />} />
        <Route path="/hr/payroll/runs/:runId" element={<LegacyRunRedirect />} />
        <Route path="/companies" element={<CompaniesPage user={user} token={token ?? ''} />} />
        <Route path="/contacts" element={<ContactsPage user={user} token={token ?? ''} />} />
        <Route path="/opportunities" element={<OpportunitiesPage user={user} token={token ?? ''} />} />
        <Route path="/payments" element={featureOnly('payments', <PaymentsOverviewPage token={token ?? ''} />, '/')} />
        <Route path="/referrals" element={<ReferralsPage token={token ?? ''} />} />
        <Route path="/profile" element={<Navigate to="/settings/profile" replace />} />
        <Route path="/company" element={<Navigate to="/settings/company" replace />} />
        <Route path="/settings" element={<WorkspaceSettingsLayout />}>
          <Route index element={<SettingsHomePage />} />
          <Route
            path="profile"
            element={<ProfileSettingsPage user={user} token={token ?? ''} onUserUpdated={setUser} />}
          />
          <Route
            path="integrations"
            element={<IntegrationsSettingsPage token={token ?? ''} tenant={tenant} />}
          />
          <Route path="company" element={<CompanyPage token={token ?? ''} onTenantUpdated={setTenant} />} />
          <Route path="time-off" element={<TimeOffSettingsPage token={token ?? ''} />} />
          <Route path="shifts" element={<ShiftsSettingsPage token={token ?? ''} />} />
          <Route path="payroll" element={<PayrollPage token={token ?? ''} section="settings" />} />
          {/* Old Settings → Appearance URL — currency now lives in Company, theme in Profile. */}
          <Route path="appearance" element={<Navigate to="/settings/company" replace />} />
          <Route
            path="users"
            element={<CompanyUsersPage user={user} token={token ?? ''} onUserUpdated={setUser} />}
          />
          <Route
            path="public-forms"
            element={isPublicFormsEnabled() ? <PublicFormsSettingsPage token={token ?? ''} /> : <Navigate to="/settings" replace />}
          />
          <Route path="pipelines" element={<PipelinesSettingsPage token={token ?? ''} />} />
          <Route path="activity" element={<ActivityLogSettingsPage token={token ?? ''} />} />
          <Route path="roles" element={<RolesPermissionsPage token={token ?? ''} />} />
          <Route path="billing" element={<BillingPage token={token ?? ''} tenant={tenant} onTenantUpdated={setTenant} />} />
          <Route path="referrals" element={<Navigate to="/referrals" replace />} />
        </Route>
      </Route>

      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? '/overview' : '/login'} replace />}
      />
    </Routes>
    </PermissionsProvider>
  );
}

// Payroll v2: /payroll opens the overview for whoever runs payroll, and everyone else's own payslips.
function PayrollHome({ token }: { token: string }) {
  const permissions = usePermissions();
  return permissions.has('manage_payroll') ? <PayrollOverviewPage token={token} /> : <Navigate to="/payroll/mine" replace />;
}

function LegacyRunRedirect() {
  const { runId } = useParams();
  return <Navigate to={`/payroll/runs/${runId}`} replace />;
}

// /shifts opens the schedule for whoever can plan or see shifts, and everyone else's own shifts.
function ShiftsHome({ token }: { token: string }) {
  const canSchedule = useCanSchedule(token);
  if (canSchedule === null) return null;
  return canSchedule ? <ShiftsSchedulePage token={token} /> : <Navigate to="/shifts/mine" replace />;
}

// Back to the page that sent you to the login (read once), or the overview.
function OAuthSignInFirst() {
  // Remembered during render like AppLayout does, so AfterLogin returns here with the same query.
  rememberReturnTo(`${window.location.pathname}${window.location.search}`);
  return <Navigate to="/login" replace />;
}

function AfterLogin() {
  const [to] = useState(() => peekReturnTo() ?? '/overview');
  useEffect(() => clearReturnTo(), []);
  return <Navigate to={to} replace />;
}
