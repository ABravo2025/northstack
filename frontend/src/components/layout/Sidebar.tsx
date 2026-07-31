import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BuildingIcon,
  CalendarIcon,
  ChevronLeftIcon,
  DashboardIcon,
  DollarIcon,
  GearIcon,
  HomeIcon,
  PeopleIcon,
  TargetIcon,
  UserCircleIcon,
  XIcon,
} from '../common/Icons';

interface SidebarProps {
  user: any;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ user, mobileOpen, onMobileClose }: SidebarProps) {
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
          {user.role === 'owner' && (
            <NavLink to="/hr/payroll" className={linkClass} title="Human Resources – Payroll" onClick={onMobileClose}>
              <DollarIcon className="h-4 w-4 shrink-0" />
              {label('Payroll')}
            </NavLink>
          )}
          <NavLink to="/hr/dashboard" className={linkClass} title="Human Resources – Dashboard" onClick={onMobileClose}>
            <DashboardIcon className="h-4 w-4 shrink-0" />
            {label('Dashboard')}
          </NavLink>
        </div>

        <div className="sidebar-divider">
          {!collapsed && <p className="sidebar-group-label">Sales</p>}
          <NavLink to="/companies" className={linkClass} title="Companies" onClick={onMobileClose}>
            <BuildingIcon className="h-4 w-4 shrink-0" />
            {label('Companies')}
          </NavLink>
          <NavLink to="/contacts" className={linkClass} title="Contacts" onClick={onMobileClose}>
            <UserCircleIcon className="h-4 w-4 shrink-0" />
            {label('Contacts')}
          </NavLink>
          <NavLink to="/opportunities" className={linkClass} title="Opportunities" onClick={onMobileClose}>
            <TargetIcon className="h-4 w-4 shrink-0" />
            {label('Opportunities')}
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
