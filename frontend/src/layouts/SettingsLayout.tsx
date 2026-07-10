import { NavLink, Outlet } from 'react-router-dom';

export default function SettingsLayout() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'active' : '';

  return (
    <div>
      <h2 className="mb-5 text-xl font-semibold">Settings</h2>

      <div className="mb-5 flex flex-wrap gap-8">
        <div>
          <p className="section-label">Company</p>
          <div className="nav">
            <NavLink to="company" className={linkClass}>
              Company
            </NavLink>
          </div>
        </div>

        <div>
          <p className="section-label">Modules</p>
          <div className="nav">
            <NavLink to="custom-fields" className={linkClass}>
              Custom Fields
            </NavLink>
          </div>
        </div>
      </div>

      <Outlet />
    </div>
  );
}
