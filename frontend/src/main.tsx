import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { ToastProvider } from './components/common/ToastProvider'
import { initTheme } from './theme'
import { redeemSupportEntry } from './lib/supportSession'
import './lib/i18n'
import './index.css'

initTheme();

// Admin Center v2 (2026-10-03): Northstack's internal tool ships in this same bundle but loads
// separately (lazy chunk), so customers never download it. It only ever opens on an admin.* host:
// admin.joinnorthstack.com in production, admin-staging.joinnorthstack.com on staging (same staging
// database), admin.localhost:5173 locally. Never under the customer app's domain (Alejandro, 2026-10-03).
const host = window.location.hostname;
const isAdminHost = host.startsWith('admin.') || host.startsWith('admin-staging.');
const AdminApp = lazy(() => import('./admin/AdminApp'));

// Admin Center v2, stage 5: Northstack support opening this account (with the customer's consent)
// lands on /support-session#<one-time code>; exchange it, then open the app in this tab.
if (window.location.pathname === '/support-session') {
  const code = window.location.hash.slice(1);
  history.replaceState(null, '', '/support-session');
  redeemSupportEntry(code)
    .then(() => window.location.replace('/overview'))
    .catch((err: Error) => {
      document.body.innerHTML = '';
      const p = document.createElement('p');
      p.style.cssText = 'font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#1b1733';
      p.textContent = err.message;
      document.body.appendChild(p);
    });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAdminHost ? (
      <BrowserRouter>
        <Suspense fallback={null}>
          <AdminApp />
        </Suspense>
      </BrowserRouter>
    ) : (
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>
    )}
  </React.StrictMode>,
)
