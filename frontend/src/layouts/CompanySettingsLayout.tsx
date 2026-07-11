import { NavLink, Outlet } from 'react-router-dom';

export default function CompanySettingsLayout() {
  const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');

  return (
    <div>
      <h2 className="mb-5 text-xl font-semibold">Company Settings</h2>
      <div className="settings-shell">
        <nav className="settings-nav">
          <NavLink to="appearance" className={linkClass}>
            Appearance
          </NavLink>
          <NavLink to="users" className={linkClass}>
            Users
          </NavLink>
        </nav>
        <div className="settings-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
