import { useState, useEffect } from 'react';
import { api, ApiError } from './api';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import './App.css';


type Page = 'login' | 'register' | 'dashboard';

export interface FormError {
  message: string;
  field?: string;
}

export default function App() {
  const [page, setPage] = useState<Page>('login');
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(false);
  const [authError, setAuthError] = useState<FormError | null>(null);

  useEffect(() => {
    if (token) {
      setCheckingSession(true);
      api
        .getCurrentUser(token)
        .then((response) => {
          setUser(response.user);
          setPage('dashboard');
        })
        .catch(() => {
          setToken(null);
          localStorage.removeItem('token');
          setPage('login');
        })
        .finally(() => setCheckingSession(false));
    }
  }, [token]);

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
        setPage('dashboard');
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
    setPage('login');
  };

  if (checkingSession) {
    return <div className="container"><p>Loading...</p></div>;
  }

  return (
    <div className="app">
      {page === 'login' && (
        <LoginPage
          onLogin={handleLogin}
          onSwitchToRegister={() => {
            setAuthError(null);
            setPage('register');
          }}
          loading={loading}
          error={authError}
        />
      )}

      {page === 'register' && (
        <RegisterPage
          onRegister={handleRegister}
          onSwitchToLogin={() => {
            setAuthError(null);
            setPage('login');
          }}
          loading={loading}
          error={authError}
        />
      )}


      {page === 'dashboard' && token && user && (
        <DashboardPage user={user} token={token} onLogout={handleLogout} />
      )}
    </div>
  );
}
