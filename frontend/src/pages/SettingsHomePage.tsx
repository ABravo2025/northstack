import { Link } from 'react-router-dom';
import {
  BriefcaseIcon,
  BuildingIcon,
  GridIcon,
  ListIcon,
  TeamIcon,
  TrendingIcon,
  UserCircleIcon,
} from '../components/common/Icons';

interface SettingsHomePageProps {
  user: any;
}

interface Tile {
  to: string;
  label: string;
  icon: React.ReactNode;
  color: string;
}

export default function SettingsHomePage({ user }: SettingsHomePageProps) {
  const isAdmin = user.role === 'owner' || user.role === 'admin';

  const accountTiles: Tile[] = [
    { to: 'profile', label: 'Profile', icon: <UserCircleIcon />, color: 'bg-brand-blue' },
  ];

  const companyTiles: Tile[] = [
    { to: 'appearance', label: 'Appearance', icon: <BuildingIcon />, color: 'bg-purple-500' },
    { to: 'users', label: 'Users', icon: <TeamIcon />, color: 'bg-teal-500' },
    { to: 'public-forms', label: 'Public Forms', icon: <ListIcon />, color: 'bg-orange-500' },
    { to: 'pipelines', label: 'Pipelines', icon: <TrendingIcon />, color: 'bg-pink-500' },
  ];

  return (
    <>
      <div className="settings-grid-section">
        <p className="settings-grid-section-title">My account</p>
        <div className="settings-grid">
          {accountTiles.map((tile) => (
            <Link key={tile.to} to={tile.to} className="settings-tile">
              <span className={`settings-tile-icon ${tile.color}`}>{tile.icon}</span>
              <span className="settings-tile-label">{tile.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {isAdmin && (
        <>
          <div className="settings-grid-section">
            <p className="settings-grid-section-title">Company</p>
            <div className="settings-grid">
              {companyTiles.map((tile) => (
                <Link key={tile.to} to={tile.to} className="settings-tile">
                  <span className={`settings-tile-icon ${tile.color}`}>{tile.icon}</span>
                  <span className="settings-tile-label">{tile.label}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="settings-grid-section">
            <p className="settings-grid-section-title">Coming soon</p>
            <div className="settings-grid">
              <span className="settings-tile disabled" aria-disabled="true">
                <span className="settings-tile-icon bg-gray-400">
                  <GridIcon />
                </span>
                <span className="settings-tile-label">Integrations</span>
              </span>
              <span className="settings-tile disabled" aria-disabled="true">
                <span className="settings-tile-icon bg-gray-400">
                  <BriefcaseIcon />
                </span>
                <span className="settings-tile-label">Billing</span>
              </span>
            </div>
          </div>
        </>
      )}
    </>
  );
}
