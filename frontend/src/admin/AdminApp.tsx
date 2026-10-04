import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ADMIN_TOKEN_KEY, AdminApiError, adminApi } from './adminApi';
import AdminHome from './AdminHome';
import AdminClients from './AdminClients';
import AdminClientDetail from './AdminClientDetail';
import AdminAudit from './AdminAudit';
import AdminBilling from './AdminBilling';
import AdminAnnouncements from './AdminAnnouncements';
import { AdminFeedbackDetail, AdminFeedbackList } from './AdminFeedback';
import PasswordInput from '../components/common/PasswordInput';
import '../App.css';

// Admin Center v2 (2026-10-03) — Northstack's own tool for its staff, rebuilt inside the app's
// frontend so it shares the design system. Rendered instead of <App/> only on an admin.* host
// (admin.joinnorthstack.com; see main.tsx). Only users with a platformRole get past login.

function readToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export interface AdminSession {
  token: string;
  name: string;
  role: string;
  onUnauthorized: () => void;
}

export default function AdminApp() {
  const [token, setToken] = useState<string | null>(readToken);
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [checking, setChecking] = useState(!!token);

  const logout = useCallback(() => {
    if (token) void adminApi.logout(token);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken(null);
    setMe(null);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setChecking(true);
    adminApi
      .me(token)
      .then(({ user }) => {
        if (!user.platformRole) throw new AdminApiError('Esta cuenta no es del equipo de Northstack.', 403);
        setMe({ name: `${user.firstName} ${user.lastName}`.trim(), role: user.platformRole });
      })
      .catch(() => {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setChecking(false));
  }, [token]);

  if (checking) return <div className="grid min-h-screen place-items-center bg-surface-0 text-sm text-ink-faint dark:bg-dark-page">Cargando…</div>;
  if (!token || !me) return <AdminLogin onLoggedIn={(t) => { localStorage.setItem(ADMIN_TOKEN_KEY, t); setToken(t); }} />;

  const session: AdminSession = { token, name: me.name, role: me.role, onUnauthorized: logout };
  return (
    <div className="flex min-h-screen bg-surface-0 text-ink dark:bg-dark-page dark:text-dark-ink">
      <AdminSidebar name={me.name} role={me.role} onLogout={logout} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-[90rem]">
          <Routes>
            <Route path="/" element={<AdminHome session={session} />} />
            <Route path="/clients" element={<AdminClients session={session} />} />
            <Route path="/clients/:id" element={<AdminClientDetail session={session} />} />
            <Route path="/tickets" element={<AdminFeedbackList session={session} kind="tickets" />} />
            <Route path="/tickets/:id" element={<AdminFeedbackDetail session={session} kind="tickets" />} />
            <Route path="/ideas" element={<AdminFeedbackList session={session} kind="ideas" />} />
            <Route path="/ideas/:id" element={<AdminFeedbackDetail session={session} kind="ideas" />} />
            <Route path="/audit" element={<AdminAudit session={session} />} />
            <Route path="/billing" element={<AdminBilling session={session} />} />
            <Route path="/announcements" element={<AdminAnnouncements session={session} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function AdminSidebar({ name, role, onLogout }: { name: string; role: string; onLogout: () => void }) {
  const link = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-white/10 font-semibold text-white' : 'text-[#c9c4e0] hover:bg-white/5 hover:text-white'}`;
  return (
    <aside className="sticky top-0 hidden h-screen w-56 flex-none flex-col bg-[#17142b] px-3 py-4 md:flex">
      <div className="mb-5 flex items-center gap-2 px-2">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-xs font-bold text-white">N</span>
        <div className="leading-tight">
          <div className="text-sm font-bold text-white">Northstack</div>
          <div className="text-[11px] text-[#c9c4e0]">Admin Center</div>
        </div>
      </div>
      <div className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-widest text-[#c9c4e0]/70">Negocio</div>
      <NavLink to="/" end className={link}>Inicio</NavLink>
      <NavLink to="/clients" className={link}>Clientes</NavLink>
      <NavLink to="/billing" className={link}>Facturación</NavLink>
      <div className="px-3 pb-1 pt-4 text-[10px] uppercase tracking-widest text-[#c9c4e0]/70">Soporte</div>
      <NavLink to="/tickets" className={link}>Tickets</NavLink>
      <NavLink to="/ideas" className={link}>Ideas</NavLink>
      <NavLink to="/announcements" className={link}>Anuncios</NavLink>
      <div className="px-3 pb-1 pt-4 text-[10px] uppercase tracking-widest text-[#c9c4e0]/70">Sistema</div>
      <NavLink to="/audit" className={link}>Registro de acciones</NavLink>
      <div className="mt-auto border-t border-white/10 px-3 pt-3 text-xs text-[#c9c4e0]">
        <div className="font-medium text-white">{name}</div>
        <div className="opacity-70">{role}</div>
        <button type="button" onClick={onLogout} className="mt-2 text-[#c9c4e0] underline-offset-2 hover:underline">Cerrar sesión</button>
      </div>
    </aside>
  );
}

function AdminLogin({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi.login(email.trim(), password);
      const t = res.session?.token;
      if (!t) throw new Error('No se pudo iniciar sesión.');
      const { user } = await adminApi.me(t);
      if (!user.platformRole) {
        void adminApi.logout(t);
        throw new Error('Esta cuenta no es del equipo de Northstack.');
      }
      onLoggedIn(t);
    } catch (err) {
      setError(err instanceof AdminApiError && err.status === 401 ? 'Email o contraseña incorrectos.' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-[#17142b] px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl bg-surface-1 p-6 shadow-xl dark:bg-dark-surface">
        <div className="mb-5 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-sm font-bold text-white">N</span>
          <div>
            <h1 className="text-base font-bold">Admin Center</h1>
            <p className="text-xs text-ink-faint dark:text-dark-ink-faint">Solo para el equipo de Northstack</p>
          </div>
        </div>
        <label className="mb-3 block text-sm font-medium" htmlFor="admin-email">
          Email
          <input id="admin-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full" />
        </label>
        <label className="mb-4 block text-sm font-medium" htmlFor="admin-password">
          Contraseña
          <div className="mt-1">
            <PasswordInput id="admin-password" autoComplete="current-password" required value={password} onChange={setPassword} />
          </div>
        </label>
        {error && <p className="mb-3 text-sm text-rose-600">{error}</p>}
        <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
