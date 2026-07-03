import { useState, useEffect } from 'react';
import { api } from './api';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import './App.css';

type Page = 'login' | 'register' | 'dashboard';

export default function App() {
  const [page, setPage] = useState<Page>('login');
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      setLoading(true);
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
        .finally(() => setLoading(false));
    }
  }, [token]);

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
      alert('Login failed: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    tenantId?: string;
    tenantName?: string;
    tenantSlug?: string;
  }) => {
    setLoading(true);
    try {
      const response = await api.register(data);
      const newToken = response.session?.token;
      if (newToken) {
        setToken(newToken);
        localStorage.setItem('token', newToken);
        setUser(response.user);
        setPage('dashboard');
      } else {
        alert('Registration successful! Please login.');
        setPage('login');
      }
    } catch (error) {
      alert('Registration failed: ' + (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTenant = async (data: {
    name: string;
    slug: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerFirstName: string;
    ownerLastName: string;
  }) => {
    setLoading(true);
    try {
      const response = await api.createTenant(data);
      const newToken = response.session?.token;
      if (newToken) {
        setToken(newToken);
        localStorage.setItem('token', newToken);
        setUser(response.user);
      }
    } catch (error) {
      alert('Tenant creation failed: ' + (error as Error).message);
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

  if (loading && page !== 'dashboard') {
    return <div className="container"><p>Loading...</p></div>;
  }

  return (
    <div className="app">
      {page === 'login' && (
        <LoginPage
          onLogin={handleLogin}
          onSwitchToRegister={() => setPage('register')}
          loading={loading}
        />
      )}

      {page === 'register' && (
        <RegisterPage
          onRegister={handleRegister}
          onSwitchToLogin={() => setPage('login')}
          loading={loading}
        />
      )}


      {page === 'dashboard' && token && user && (
        <DashboardPage user={user} token={token} onLogout={handleLogout} />
      )}
    </div>
  );
}
