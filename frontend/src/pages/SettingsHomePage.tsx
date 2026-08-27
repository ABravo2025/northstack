import { Link } from 'react-router-dom';
import { getSettingsSections } from '../lib/settingsSections';

interface SettingsHomePageProps {
  user: any;
}

export default function SettingsHomePage({ user }: SettingsHomePageProps) {
  const sections = getSettingsSections(user);

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
