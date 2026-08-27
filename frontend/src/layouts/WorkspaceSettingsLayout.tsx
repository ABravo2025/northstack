import { Outlet, useLocation } from 'react-router-dom';

export default function WorkspaceSettingsLayout() {
  const { pathname } = useLocation();
  const isIndex = pathname === '/settings' || pathname === '/settings/';

  return (
    <div className="page-full">
      {isIndex && <h2 className="mb-5 text-xl font-semibold">Settings</h2>}
      <div className="settings-content">
        <Outlet />
      </div>
    </div>
  );
}
