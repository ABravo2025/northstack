import { Link } from 'react-router-dom';
import { getSettingsSections } from '../lib/settingsSections';
import { usePermissions } from '../contexts/PermissionsContext';

export default function SettingsHomePage() {
  const permissions = usePermissions();
  const sections = getSettingsSections(permissions);

  return (
    <>
      {sections.map((section) => (
        <div key={section.groupLabel} className="settings-grid-section">
          <p className="settings-grid-section-title">{section.groupLabel}</p>
          <div className="settings-grid">
            {section.items.map((tile) => (
              <Link key={tile.to} to={tile.to} className="settings-tile">
                <span className="settings-tile-icon">{tile.icon}</span>
                <span className="settings-tile-label">{tile.label}</span>
                <span className="settings-tile-desc">{tile.desc}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
