import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';

interface AppLayoutProps {
  user: any;
  token: string | null;
  onLogout: () => void;
}

export default function AppLayout({ user, token, onLogout }: AppLayoutProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app">
      <TopBar user={user} onLogout={onLogout} onMenuClick={() => setMobileSidebarOpen(true)} />
      <div className="app-shell">
        <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
        <main className="app-main">
          <div className="container">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
