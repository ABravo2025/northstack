import { useState } from 'react';
import { getStoredThemePreference, setThemePreference, type ThemePreference } from '../theme';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function CompanySettingsPage() {
  const [theme, setTheme] = useState<ThemePreference>(getStoredThemePreference());

  const handleThemeChange = (value: ThemePreference) => {
    setTheme(value);
    setThemePreference(value);
  };

  return (
    <>
      <div className="card">
        <h3>Appearance</h3>
        <p className="mb-3 text-sm text-gray-500">
          Choose how Northstack looks on this device.
        </p>
        <div className="nav">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={theme === option.value ? 'active' : ''}
              onClick={() => handleThemeChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Company (Users)</h3>
        <p className="text-sm text-gray-500">
          Viewing and managing everyone with access to your tenant (not just employees — their
          roles, active invitations, etc.) is coming in a follow-up round.
        </p>
      </div>
    </>
  );
}
