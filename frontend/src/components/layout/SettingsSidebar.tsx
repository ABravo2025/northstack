import { NavLink, useNavigate } from 'react-router-dom';
import { getSettingsSections } from '../../lib/settingsSections';
import { ChevronLeftIcon, XIcon } from '../common/Icons';
import { usePermissions } from '../../contexts/PermissionsContext';

interface SettingsSidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

// Swapped in for the main Sidebar while anywhere under /settings (see
// AppLayout.tsx) — the left panel becomes a list of the Settings sections
// instead of the app's global nav, so moving between them doesn't require
// going back to the tile grid each time (backlog QA, 2026-08-27).
export default function SettingsSidebar({ mobileOpen, onMobileClose }: SettingsSidebarProps) {
  const navigate = useNavigate();
  const permissions = usePermissions();
  const sections = getSettingsSections(permissions);

  const linkClass = ({ isActive }: { isActive: boolean }) => `sidebar-link${isActive ? ' active' : ''}`;

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onMobileClose} />}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <button className="sidebar-toggle-mobile" onClick={onMobileClose} aria-label="Close menu">
          <XIcon className="h-4 w-4" />
        </button>

        <div>
          {/* A fixed destination, not navigate(-1) — landing on a Settings page
              directly (bookmark, refresh, new tab) leaves no useful browser
              history to go back to, and this is the only way out of /settings
              back to the main app shell (backlog, 2026-08-28). */}
          <button type="button" className="sidebar-link w-full text-left" onClick={() => navigate('/overview')}>
            <ChevronLeftIcon className="h-4 w-4 shrink-0" />
            Back
          </button>
        </div>

        <div className="sidebar-divider">
          <p className="sidebar-group-label">Settings</p>
          <NavLink to="/settings" end className={linkClass} onClick={onMobileClose}>
            All settings
          </NavLink>
        </div>

        {sections.map((section) => (
          <div key={section.groupLabel} className="sidebar-divider">
            <p className="sidebar-group-label">{section.groupLabel}</p>
            {section.items.map((item) => (
              <NavLink key={item.to} to={`/settings/${item.to}`} className={linkClass} title={item.label} onClick={onMobileClose}>
                <span className="h-4 w-4 shrink-0 [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </aside>
    </>
  );
}
