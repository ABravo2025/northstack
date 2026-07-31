import { NavLink, useLocation } from 'react-router-dom';
import { CalendarIcon, HomeIcon, PeopleIcon, TargetIcon } from '../common/Icons';

// Bottom nav (< md only) for the 4 sections used daily — the rest (Dashboard,
// Contacts, Opportunities, Settings) stays reachable via the sidebar drawer.
// "Sales" covers Companies/Contacts/Opportunities as one tab; it links to
// Opportunities (the main sales workspace) and highlights for any of the three.
const SALES_PATHS = ['/companies', '/contacts', '/opportunities'];

export default function MobileTabbar() {
  const location = useLocation();
  const salesActive = SALES_PATHS.some((path) => location.pathname.startsWith(path));

  return (
    <nav className="mobile-tabbar">
      <NavLink to="/overview" className={({ isActive }) => (isActive ? 'active' : '')}>
        <HomeIcon className="h-5 w-5" />
        Overview
      </NavLink>
      <NavLink to="/hr/employees" className={({ isActive }) => (isActive ? 'active' : '')}>
        <PeopleIcon className="h-5 w-5" />
        Employees
      </NavLink>
      <NavLink to="/hr/time-off" className={({ isActive }) => (isActive ? 'active' : '')}>
        <CalendarIcon className="h-5 w-5" />
        Time Off
      </NavLink>
      <NavLink to="/opportunities" className={salesActive ? 'active' : ''}>
        <TargetIcon className="h-5 w-5" />
        Sales
      </NavLink>
    </nav>
  );
}
