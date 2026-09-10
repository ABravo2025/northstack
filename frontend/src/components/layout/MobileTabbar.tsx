import { NavLink, useLocation } from 'react-router-dom';
import { CalendarIcon, HomeIcon, PeopleIcon, TargetIcon } from '../common/Icons';
import { usePermissions } from '../../contexts/PermissionsContext';

// Bottom nav (< md only) for the sections used daily — the rest (Dashboard,
// Contacts, Opportunities, Settings) stays reachable via the sidebar drawer.
// "Sales" covers Companies/Contacts/Opportunities as one tab; it links to
// Opportunities (the main sales workspace) and highlights for any of the three.
const SALES_PATHS = ['/companies', '/contacts', '/opportunities'];

export default function MobileTabbar() {
  const location = useLocation();
  const permissions = usePermissions();
  const salesActive = SALES_PATHS.some((path) => location.pathname.startsWith(path));
  // "Protect internal company data" rework — Sales is no longer default Member access (see
  // Sidebar.tsx's same gating), so this tab drops out entirely rather than linking to a 403 for
  // a plain Member. `justify-around` on .mobile-tabbar redistributes the remaining tabs cleanly,
  // no fixed slot count to preserve.
  const showSalesTab = permissions.has('view_company') && permissions.has('view_contact');

  return (
    <nav className="mobile-tabbar">
      <NavLink to="/overview" className={({ isActive }) => (isActive ? 'active' : '')}>
        <HomeIcon className="h-5 w-5" />
        Overview
      </NavLink>
      <NavLink to="/hr/people" className={({ isActive }) => (isActive ? 'active' : '')}>
        <PeopleIcon className="h-5 w-5" />
        People
      </NavLink>
      <NavLink to="/hr/time-off" className={({ isActive }) => (isActive ? 'active' : '')}>
        <CalendarIcon className="h-5 w-5" />
        Time Off
      </NavLink>
      {showSalesTab && (
        <NavLink to="/opportunities" className={salesActive ? 'active' : ''}>
          <TargetIcon className="h-5 w-5" />
          Sales
        </NavLink>
      )}
    </nav>
  );
}
