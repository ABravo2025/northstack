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
// separately (lazy chunk), so customers never download it. It only ever opens on an admin.* host:
// admin.joinnorthstack.com in production, admin.localhost:5173 locally. Never under the customer
// app's domain (Alejandro, 2026-10-03).
const isAdminHost = window.location.hostname.startsWith('admin.');
const AdminApp = lazy(() => import('./admin/AdminApp'));

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
