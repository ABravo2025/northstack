import { NavLink, useNavigate } from 'react-router-dom';
import { getDashboardSections } from '../../lib/dashboardsSections';
import { ChevronLeftIcon, XIcon } from '../common/Icons';
import { usePermissions } from '../../contexts/PermissionsContext';

interface DashboardsSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

// Swapped in for the main Sidebar while anywhere under /dashboards (see
// AppLayout.tsx) — same mechanism as SettingsSidebar, so moving between
// dashboard categories doesn't require going back to the tile grid each
// time (2026-09-09, mirrors the Settings pattern per Alejandro's request).
export default function DashboardsSidebar({ mobileOpen, onMobileClose }: DashboardsSidebarProps) {
  const navigate = useNavigate();
  const permissions = usePermissions();
  const sections = getDashboardSections(permissions);

  const linkClass = ({ isActive }: { isActive: boolean }) => `sidebar-link${isActive ? ' active' : ''}`;

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onMobileClose} />}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <button className="sidebar-toggle-mobile" onClick={onMobileClose} aria-label="Close menu">
          <XIcon className="h-4 w-4" />
        </button>

        <div>
          {/* Fixed destination, not navigate(-1) — same reasoning as SettingsSidebar: landing
              here directly leaves no useful browser history to go back to. */}
          <button type="button" className="sidebar-link w-full text-left" onClick={() => navigate('/overview')}>
            <ChevronLeftIcon className="h-4 w-4 shrink-0" />
            Back
          </button>
        </div>

        <div className="sidebar-divider">
          <p className="sidebar-group-label">Dashboards</p>
          <NavLink to="/dashboards" end className={linkClass} onClick={onMobileClose}>
            All dashboards
          </NavLink>
          {sections.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass} title={item.label} onClick={onMobileClose}>
              <span className="h-4 w-4 shrink-0 [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </aside>
    </>
  );
}
