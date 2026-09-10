import { Link } from 'react-router-dom';
import { getDashboardSections } from '../lib/dashboardsSections';
import { usePermissions } from '../contexts/PermissionsContext';

// Landing page for /dashboards — mirrors SettingsHomePage's tile grid.
// Reuses the .settings-grid/.settings-tile classes: they're generic tile
// styling, not Settings-specific (2026-09-09).
export default function DashboardsHomePage() {
  const permissions = usePermissions();
  const sections = getDashboardSections(permissions);

  return (
    <div className="settings-grid-section">
      <div className="settings-grid">
        {sections.map((tile) => (
          <Link key={tile.to} to={tile.to} className="settings-tile">
            <span className="settings-tile-icon">{tile.icon}</span>
            <span className="settings-tile-label">{tile.label}</span>
            <span className="settings-tile-desc">{tile.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
