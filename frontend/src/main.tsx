import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { ToastProvider } from './components/common/ToastProvider'
import { initTheme } from './theme'
import './lib/i18n'
import './index.css'

initTheme();

// Admin Center v2 (2026-10-03): Northstack's internal tool ships in this same bundle but loads
// separately (lazy chunk), so customers never download it. It takes over on admin.joinnorthstack.com
// and on /admin of any other host (staging, local dev).
const isAdminHost = window.location.hostname.startsWith('admin.');
const isAdminPath = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
const AdminApp = lazy(() => import('./admin/AdminApp'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isAdminHost || isAdminPath ? (
      <BrowserRouter basename={isAdminHost ? '/' : '/admin'}>
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
