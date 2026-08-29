import { NavLink, Outlet } from 'react-router-dom';

interface DashboardsLayoutProps {
  user: any;
}

const CATEGORIES = [
  { to: '/dashboards/hr', label: 'HR' },
  { to: '/dashboards/time-off', label: 'Time Off' },
  { to: '/dashboards/payroll', label: 'Payroll', ownerOnly: true },
  { to: '/dashboards/sales', label: 'Sales' },
  { to: '/dashboards/tasks', label: 'Tasks' },
  { to: '/dashboards/adoption', label: 'Adoption' },
];

// Mirrors WorkspaceSettingsLayout's parent-route-with-Outlet pattern, but with
// route-driven tabs (.view-tab, same class Opportunities uses for its
// per-Pipeline tabs) instead of a tile grid — each category is its own URL,
// not local component state, so a link to /dashboards/sales lands directly
// on Sales.
export default function DashboardsLayout({ user }: DashboardsLayoutProps) {
  const isOwner = user?.role === 'owner';
  const categories = CATEGORIES.filter((c) => !c.ownerOnly || isOwner);

  return (
    <div className="page-full">
      <h2 className="mb-4 text-xl font-semibold">Dashboards</h2>
      <div className="mb-4 flex gap-1 border-b border-line dark:border-dark-line">
        {categories.map((c) => (
          <NavLink key={c.to} to={c.to} className={({ isActive }) => `view-tab${isActive ? ' active' : ''}`}>
            {c.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
