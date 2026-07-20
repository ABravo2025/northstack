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
  XIcon,
} from './Icons';

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `sidebar-link${isActive ? ' active' : ''}${collapsed ? ' justify-center' : ''}`;

  const label = (text: string) => (collapsed ? undefined : text);

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onMobileClose} />}
      <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <button
          className="sidebar-toggle-desktop"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronLeftIcon className={`h-4 w-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
        </button>
        <button className="sidebar-toggle-mobile" onClick={onMobileClose} aria-label="Close menu">
          <XIcon className="h-4 w-4" />
        </button>

        <div>
          <NavLink to="/overview" className={linkClass} title="Overview" onClick={onMobileClose}>
            <HomeIcon className="h-4 w-4 shrink-0" />
            {label('Overview')}
          </NavLink>
        </div>

        <div className="sidebar-divider">
          {!collapsed && <p className="sidebar-group-label">Human Resources</p>}
          <NavLink to="/hr/employees" className={linkClass} title="Employees" onClick={onMobileClose}>
            <PeopleIcon className="h-4 w-4 shrink-0" />
            {label('Employees')}
          </NavLink>
          <NavLink to="/hr/time-off" className={linkClass} title="Human Resources – Time Off" onClick={onMobileClose}>
            <CalendarIcon className="h-4 w-4 shrink-0" />
            {label('Time Off')}
          </NavLink>
          <NavLink to="/hr/dashboard" className={linkClass} title="Human Resources – Dashboard" onClick={onMobileClose}>
            <DashboardIcon className="h-4 w-4 shrink-0" />
            {label('Dashboard')}
          </NavLink>
        </div>

        <div className="sidebar-divider">
          {!collapsed && <p className="sidebar-group-label">Clients</p>}
          <NavLink to="/clients" className={linkClass} title="Clients" onClick={onMobileClose}>
            <BriefcaseIcon className="h-4 w-4 shrink-0" />
            {label('Clients')}
          </NavLink>
          <NavLink to="/clients/dashboard" className={linkClass} title="Clients – Dashboard" onClick={onMobileClose}>
            <TrendingIcon className="h-4 w-4 shrink-0" />
            {label('Dashboard')}
          </NavLink>
        </div>

        <div className="sidebar-footer">
          <NavLink to="/settings" className={linkClass} title="Settings" onClick={onMobileClose}>
            <GearIcon className="h-4 w-4 shrink-0" />
            {label('Settings')}
          </NavLink>
        </div>
      </aside>
    </>
  );
}
