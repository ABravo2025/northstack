import { NavLink, Outlet } from 'react-router-dom';

export default function ModuleSettingsLayout() {
  const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');

  return (
    <div>
      <h2 className="mb-5 text-xl font-semibold">Settings</h2>
      <div className="settings-shell">
        <nav className="settings-nav">
          <NavLink to="custom-fields" className={linkClass}>
            Custom Fields
          </NavLink>
        </nav>
        <div className="settings-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
