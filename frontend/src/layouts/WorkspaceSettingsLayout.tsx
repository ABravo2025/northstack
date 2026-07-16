import { NavLink, Outlet } from 'react-router-dom';

interface WorkspaceSettingsLayoutProps {
  user: any;
}

export default function WorkspaceSettingsLayout({ user }: WorkspaceSettingsLayoutProps) {
  const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');
  const isAdmin = user.role === 'owner' || user.role === 'admin';

  return (
    <div>
      <h2 className="mb-5 text-xl font-semibold">Settings</h2>
      <div className="settings-shell">
        <nav className="settings-nav">
          <p className="sidebar-group-label">Mi cuenta</p>
          <NavLink to="profile" className={linkClass}>
            Profile
          </NavLink>
          {isAdmin && (
            <>
              <p className="sidebar-group-label">Empresa</p>
              <NavLink to="appearance" className={linkClass}>
                Appearance
              </NavLink>
              <NavLink to="users" className={linkClass}>
                Users
              </NavLink>
            </>
          )}
        </nav>
        <div className="settings-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
