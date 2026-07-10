import { Navigate, Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';

interface AppLayoutProps {
  user: any;
  token: string | null;
  onLogout: () => void;
}

export default function AppLayout({ user, token, onLogout }: AppLayoutProps) {
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  const canManageCustomFields = user.role === 'owner' || user.role === 'admin';

  return (
    <div className="app">
      <TopBar user={user} onLogout={onLogout} />
      <div className="app-shell">
        <Sidebar showSettings={canManageCustomFields} />
        <main className="app-main">
          <div className="container">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
