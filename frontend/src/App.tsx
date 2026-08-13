import { useState, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import type { Tenant } from './api';
import { useToast } from './components/common/ToastProvider';
import TableSkeleton from './components/common/TableSkeleton';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CompleteSignupPage from './pages/CompleteSignupPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AcceptInvitePage from './pages/AcceptInvitePage';
import ContractConfirmationPage from './pages/ContractConfirmationPage';
import OverviewPage from './pages/OverviewPage';
import HelpPage from './pages/HelpPage';
import HrDashboardPage from './pages/HrDashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import TimeOffOverviewPage from './pages/TimeOffOverviewPage';
import CompaniesPage from './pages/CompaniesPage';
import ContactsPage from './pages/ContactsPage';
import PipelinesSettingsPage from './pages/PipelinesSettingsPage';
import OpportunitiesPage from './pages/OpportunitiesPage';
import ProfileSettingsPage from './pages/ProfileSettingsPage';
import CompanyAppearancePage from './pages/CompanyAppearancePage';
import CompanyUsersPage from './pages/CompanyUsersPage';
import PublicFormsSettingsPage from './pages/PublicFormsSettingsPage';
import PublicFormPage from './pages/PublicFormPage';
import PayrollPage from './pages/PayrollPage';
import PayrollRunDetailPage from './pages/PayrollRunDetailPage';
import AppLayout from './layouts/AppLayout';
import WorkspaceSettingsLayout from './layouts/WorkspaceSettingsLayout';
import SettingsHomePage from './pages/SettingsHomePage';
import './App.css';

export default function App() {
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const isAcceptInviteRoute = location.pathname.startsWith('/accept-invite');
  const isConfirmContractRoute = location.pathname.startsWith('/confirm-contract');
  const isResetPasswordRoute = location.pathname.startsWith('/reset-password');
  const isRegisterCompleteRoute = location.pathname.startsWith('/register/complete');

  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(
    () =>
      !isAcceptInviteRoute &&
      !isConfirmContractRoute &&
      !isResetPasswordRoute &&
      !isRegisterCompleteRoute &&
      Boolean(localStorage.getItem('token')),
  );

  useEffect(() => {
    if (isAcceptInviteRoute || isConfirmContractRoute || isResetPasswordRoute || isRegisterCompleteRoute) {
      // Handling an invite/contract-confirmation/password-reset/signup-completion link: never
      // auto-restore a stored session, whoever clicked it may not be whoever last used this
      // browser.
      return;
    }

    if (token) {
      setCheckingSession(true);
      api
        .getCurrentUser(token)
        .then((response) => {
          setUser(response.user);
          // Best-effort, alongside the user — powers PlansModal (shown once, right after
          // signup) and the past_due grace-period banner, both in AppLayout. A failure here
          // shouldn't block being logged in, so it's swallowed rather than logging the user out.
          return api.getCurrentTenant(token).then(setTenant).catch(() => {});
        })
        .catch(() => {
          setToken(null);
          localStorage.removeItem('token');
        })
        .finally(() => setCheckingSession(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleContractConfirmed = (newToken: string, newUser: any) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
    setUser(newUser);
    navigate('/overview');
  };

  const handlePasswordReset = (newToken: string, newUser: any) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
    setUser(newUser);
    navigate('/overview');
  };

  const handleInvitationAccepted = (newToken: string, newUser: any) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
    setUser(newUser);
    navigate('/overview');
  };

  const handleLogin = async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await api.login({ email, password });
      const newToken = response.session?.token;
      if (newToken) {
        setToken(newToken);
        localStorage.setItem('token', newToken);
        setUser(response.user);
      }
    } catch (error) {
      // /api/auth/login never returns a `field` (unlike registration) — always a toast.
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // CompleteSignupPage already called POST /api/tenants/register itself (it owns the 3-step
  // survey's own loading/error state) — this just adopts the resulting session, same shape as
  // handleContractConfirmed/handlePasswordReset/handleInvitationAccepted above. Lands on
  // /overview directly — PlansModal (AppLayout) shows itself automatically over that screen
  // for a fresh trialing tenant, it isn't a route of its own (2026-08-13 correction).
  const handleSignupCompleted = (newToken: string, newUser: any) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
    setUser(newUser);
    navigate('/overview');
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await api.logout(token);
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
  };

  if (checkingSession) {
    return (
      <div className="container">
        <TableSkeleton rows={4} />
      </div>
    );
  }

  const isAuthenticated = Boolean(token && user);

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to="/overview" replace />
          ) : (
            <LoginPage
              onLogin={handleLogin}
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
      <Route
        path="/accept-invite/:token"
        element={<AcceptInvitePage onAccepted={handleInvitationAccepted} />}
      />
      <Route
        path="/confirm-contract/:token"
        element={<ContractConfirmationPage onConfirmed={handleContractConfirmed} />}
      />
      <Route path="/apply/:tenantSlug/:formSlug" element={<PublicFormPage />} />

      <Route
        element={
          <AppLayout user={user} token={token} tenant={tenant} onTenantUpdated={setTenant} onLogout={handleLogout} />
        }
      >
        <Route path="/overview" element={<OverviewPage token={token ?? ''} user={user} />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/hr/dashboard" element={<HrDashboardPage />} />
        <Route path="/hr/people" element={<EmployeesPage user={user} token={token ?? ''} />} />
        <Route path="/hr/employees" element={<Navigate to="/hr/people" replace />} />
        <Route path="/hr/time-off" element={<TimeOffOverviewPage user={user} token={token ?? ''} />} />
        <Route path="/hr/payroll" element={<PayrollPage user={user} token={token ?? ''} />} />
        <Route path="/hr/payroll/runs/:runId" element={<PayrollRunDetailPage user={user} token={token ?? ''} />} />
        <Route path="/companies" element={<CompaniesPage user={user} token={token ?? ''} />} />
        <Route path="/contacts" element={<ContactsPage user={user} token={token ?? ''} />} />
        <Route path="/opportunities" element={<OpportunitiesPage user={user} token={token ?? ''} />} />
        <Route path="/profile" element={<Navigate to="/settings/profile" replace />} />
        <Route path="/company" element={<Navigate to="/settings/appearance" replace />} />
        <Route path="/settings" element={<WorkspaceSettingsLayout />}>
          <Route index element={<SettingsHomePage user={user} />} />
          <Route
            path="profile"
            element={<ProfileSettingsPage user={user} token={token ?? ''} onUserUpdated={setUser} />}
          />
          <Route path="appearance" element={<CompanyAppearancePage token={token ?? ''} />} />
          <Route
            path="users"
            element={<CompanyUsersPage user={user} token={token ?? ''} onUserUpdated={setUser} />}
          />
          <Route path="public-forms" element={<PublicFormsSettingsPage token={token ?? ''} />} />
          <Route path="pipelines" element={<PipelinesSettingsPage token={token ?? ''} />} />
        </Route>
      </Route>

      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? '/overview' : '/login'} replace />}
      />
    </Routes>
  );
}
