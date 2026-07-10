import { NavLink, Outlet } from 'react-router-dom';

export default function SettingsLayout() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'active' : '';

  return (
    <div>
      <h2 className="mb-5 text-xl font-semibold">Settings</h2>
      <div className="nav mb-5">
        <NavLink to="custom-fields" className={linkClass}>
          Custom Fields
        </NavLink>
        <NavLink to="company" className={linkClass}>
          Company
        </NavLink>
      </div>
      <Outlet />
    </div>
  );
}
