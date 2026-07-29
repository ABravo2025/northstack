import { Link, Outlet, useLocation } from 'react-router-dom';
import { ChevronLeftIcon } from '../components/Icons';

export default function WorkspaceSettingsLayout() {
  const { pathname } = useLocation();
  const isIndex = pathname === '/settings' || pathname === '/settings/';

  return (
    <div className="page-full">
      {isIndex ? (
        <h2 className="mb-5 text-xl font-semibold">Settings</h2>
      ) : (
        <Link to="/settings" className="settings-back-link">
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Settings
        </Link>
      )}
      <div className="settings-content">
        <Outlet />
      </div>
    </div>
  );
}
