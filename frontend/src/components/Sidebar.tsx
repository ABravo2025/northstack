import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BriefcaseIcon,
  CalendarIcon,
  ChevronLeftIcon,
  DashboardIcon,
  GearIcon,
  HomeIcon,
  PeopleIcon,
  TrendingIcon,
} from './Icons';

interface SidebarProps {
  showSettings: boolean;
}

export default function Sidebar({ showSettings }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `sidebar-link${isActive ? ' active' : ''}${collapsed ? ' justify-center' : ''}`;

  const label = (text: string) => (collapsed ? undefined : text);

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <button
        className="sidebar-toggle"
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        <ChevronLeftIcon className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
      </button>

      <div>
        <NavLink to="/overview" className={linkClass} title="Overview">
          <HomeIcon className="h-4 w-4 shrink-0" />
          {label('Overview')}
        </NavLink>
      </div>

      <div className="sidebar-divider">
        {!collapsed && <p className="sidebar-group-label">Human Resources</p>}
        <NavLink to="/hr/employees" className={linkClass} title="Employees">
          <PeopleIcon className="h-4 w-4 shrink-0" />
          {label('Employees')}
        </NavLink>
        <NavLink to="/hr/pto" className={linkClass} title="Human Resources – PTO">
          <CalendarIcon className="h-4 w-4 shrink-0" />
          {label('PTO')}
        </NavLink>
        <NavLink to="/hr/dashboard" className={linkClass} title="Human Resources – Dashboard">
          <DashboardIcon className="h-4 w-4 shrink-0" />
          {label('Dashboard')}
        </NavLink>
      </div>

      <div className="sidebar-divider">
        {!collapsed && <p className="sidebar-group-label">Clients</p>}
        <NavLink to="/clients" className={linkClass} title="Clients">
          <BriefcaseIcon className="h-4 w-4 shrink-0" />
          {label('Clients')}
        </NavLink>
        <NavLink to="/clients/dashboard" className={linkClass} title="Clients – Dashboard">
          <TrendingIcon className="h-4 w-4 shrink-0" />
          {label('Dashboard')}
        </NavLink>
      </div>

      {showSettings && (
        <div className="sidebar-footer">
          <NavLink to="/settings" className={linkClass} title="Settings">
            <GearIcon className="h-4 w-4 shrink-0" />
            {label('Settings')}
          </NavLink>
        </div>
      )}
    </aside>
  );
}
