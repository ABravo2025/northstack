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
  desc: string;
  icon: React.ReactNode;
}

export default function SettingsHomePage({ user }: SettingsHomePageProps) {
  const isAdmin = user.role === 'owner' || user.role === 'admin';
  const isOwner = user.role === 'owner';

  const accountTiles: Tile[] = [
    { to: 'profile', label: 'Profile', desc: 'Name, phone and password.', icon: <UserCircleIcon /> },
  ];

  // Owner-only visibility (matches canManageBilling on the backend — every mutating endpoint
  // under it already rejects a non-owner with 403), placed alongside Profile per Alejandro's
  // explicit placement call (2026-08-19) — "My account" itself still renders for every role,
  // this tile is just conditionally appended to it for owners.
  if (isOwner) {
    accountTiles.push({ to: 'billing', label: 'Billing', desc: 'Plan, invoices and payment method.', icon: <BriefcaseIcon /> });
  }

  const companyTiles: Tile[] = [
    { to: 'appearance', label: 'Appearance', desc: 'Currency and theme for the workspace.', icon: <BuildingIcon /> },
    { to: 'users', label: 'Users', desc: 'Invite people and manage roles.', icon: <TeamIcon /> },
    { to: 'public-forms', label: 'Public Forms', desc: 'External intake forms per module.', icon: <ListIcon /> },
    { to: 'pipelines', label: 'Pipelines', desc: 'Sales stages and their outcomes.', icon: <TrendingIcon /> },
  ];

  return (
    <>
      <div className="settings-grid-section">
        <p className="settings-grid-section-title">My account</p>
        <div className="settings-grid">
          {accountTiles.map((tile) => (
            <Link key={tile.to} to={tile.to} className="settings-tile">
              <span className="settings-tile-icon">{tile.icon}</span>
              <span className="settings-tile-label">{tile.label}</span>
              <span className="settings-tile-desc">{tile.desc}</span>
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
                  <span className="settings-tile-icon">{tile.icon}</span>
                  <span className="settings-tile-label">{tile.label}</span>
                  <span className="settings-tile-desc">{tile.desc}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="settings-grid-section">
            <p className="settings-grid-section-title">Coming soon</p>
            <div className="settings-grid">
              <span className="settings-tile disabled" aria-disabled="true">
                <span className="settings-tile-icon">
                  <GridIcon />
                </span>
                <span className="settings-tile-label">Integrations</span>
                <span className="settings-tile-desc">Connect Northstack to other tools.</span>
              </span>
            </div>
          </div>
        </>
      )}
    </>
  );
}
