import { useState, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from './api';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AcceptInvitePage from './pages/AcceptInvitePage';
import HrDashboardPage from './pages/HrDashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import ClientsDashboardPage from './pages/ClientsDashboardPage';
import ClientsPage from './pages/ClientsPage';
import CustomFieldsSettingsPage from './pages/CustomFieldsSettingsPage';
import ProfileSettingsPage from './pages/ProfileSettingsPage';
import CompanyAppearancePage from './pages/CompanyAppearancePage';
import CompanyUsersPage from './pages/CompanyUsersPage';
import AppLayout from './layouts/AppLayout';
import CompanySettingsLayout from './layouts/CompanySettingsLayout';
import ModuleSettingsLayout from './layouts/ModuleSettingsLayout';
import './App.css';

export interface FormError {
  message: string;
  field?: string;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAcceptInviteRoute = location.pathname.startsWith('/accept-invite');

  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(false);
  const [authError, setAuthError] = useState<FormError | null>(null);

  useEffect(() => {
    if (isAcceptInviteRoute) {
      // Handling an invite link: never auto-restore a stored session, the invited
      // person may not be whoever last used this browser.
      return;
    }

    if (token) {
      setCheckingSession(true);
      api
        .getCurrentUser(token)
        .then((response) => {
          setUser(response.user);
        })
        .catch(() => {
          setToken(null);
          localStorage.removeItem('token');
        })
        .finally(() => setCheckingSession(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleInvitationAccepted = (newToken: string, newUser: any) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
    setUser(newUser);
    navigate('/hr/dashboard');
  };

  const handleLogin = async (email: string, password: string) => {
    setLoading(true);
    setAuthError(null);
    try {
      const response = await api.login({ email, password });
      const newToken = response.session?.token;
      if (newToken) {
        setToken(newToken);
        localStorage.setItem('token', newToken);
        setUser(response.user);
      }
    } catch (error) {
      setAuthError({
        message: (error as Error).message,
        field: error instanceof ApiError ? error.field : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (data: {
    tenantName: string;
    ownerFirstName: string;
    ownerLastName: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerPhone: string;
  }) => {
    setLoading(true);
    setAuthError(null);
    try {
      const response = await api.registerTenant(data);
      const newToken = response.session?.token;
      if (newToken) {
        setToken(newToken);
        localStorage.setItem('token', newToken);
        setUser(response.user);
      }
    } catch (error) {
      setAuthError({
        message: (error as Error).message,
        field: error instanceof ApiError ? error.field : undefined,
      });
    } finally {
      setLoading(false);
    }
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
        <p>Loading...</p>
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
            <Navigate to="/hr/dashboard" replace />
          ) : (
            <LoginPage
              onLogin={handleLogin}
              onSwitchToRegister={() => navigate('/register')}
              loading={loading}
              error={authError}
            />
          )
        }
      />
      <Route
        path="/register"
        element={
          isAuthenticated ? (
            <Navigate to="/hr/dashboard" replace />
          ) : (
            <RegisterPage
              onRegister={handleRegister}
              onSwitchToLogin={() => navigate('/login')}
              loading={loading}
              error={authError}
            />
          )
        }
      />
      <Route
        path="/accept-invite/:token"
        element={<AcceptInvitePage onAccepted={handleInvitationAccepted} />}
      />

      <Route element={<AppLayout user={user} token={token} onLogout={handleLogout} />}>
        <Route path="/hr/dashboard" element={<HrDashboardPage />} />
        <Route path="/hr/employees" element={<EmployeesPage user={user} token={token ?? ''} />} />
        <Route path="/clients/dashboard" element={<ClientsDashboardPage />} />
        <Route path="/clients" element={<ClientsPage token={token ?? ''} />} />
        <Route
          path="/profile"
          element={<ProfileSettingsPage user={user} token={token ?? ''} onUserUpdated={setUser} />}
        />
        <Route path="/settings" element={<ModuleSettingsLayout />}>
          <Route index element={<Navigate to="custom-fields" replace />} />
          <Route path="custom-fields" element={<CustomFieldsSettingsPage token={token ?? ''} />} />
        </Route>
        <Route path="/company" element={<CompanySettingsLayout />}>
          <Route index element={<Navigate to="appearance" replace />} />
          <Route path="appearance" element={<CompanyAppearancePage />} />
          <Route
            path="users"
            element={<CompanyUsersPage user={user} token={token ?? ''} onUserUpdated={setUser} />}
          />
        </Route>
      </Route>

      <Route
        path="*"
        element={<Navigate to={isAuthenticated ? '/hr/dashboard' : '/login'} replace />}
      />
    </Routes>
  );
}
