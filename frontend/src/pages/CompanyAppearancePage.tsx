import { useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../components/ToastProvider';
import { CURRENCY_CODES, currencyLabel } from '../lib/currencies';
import { getStoredThemePreference, setThemePreference, type ThemePreference } from '../theme';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

interface CompanyAppearancePageProps {
  token: string;
}

export default function CompanyAppearancePage({ token }: CompanyAppearancePageProps) {
  const toast = useToast();
  const [theme, setTheme] = useState<ThemePreference>(getStoredThemePreference());
  const [currency, setCurrency] = useState('');
  const [savingCurrency, setSavingCurrency] = useState(false);

  useEffect(() => {
    api
      .getCurrentTenant(token)
      .then((tenant) => setCurrency(tenant.currency))
      .catch((error) => toast.error('Failed to load company settings: ' + (error as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleThemeChange = (value: ThemePreference) => {
    setTheme(value);
    setThemePreference(value);
  };

  const handleCurrencyChange = async (value: string) => {
    const previous = currency;
    setCurrency(value);
    setSavingCurrency(true);
    try {
      await api.updateTenantCurrency(token, value);
      toast.success('Currency updated.');
    } catch (error) {
      setCurrency(previous);
      toast.error('Failed to update currency: ' + (error as Error).message);
    } finally {
      setSavingCurrency(false);
    }
  };

  return (
    <div className="max-w-6xl flex flex-col gap-4">
      <div className="card">
        <h3 className="card-title">Company</h3>
        <p className="mb-3 text-sm text-gray-500">
          Applies to compensation amounts across the company (Hourly/Monthly Rate on Employee).
        </p>
        <div className="nv-field max-w-xs">
          <label htmlFor="company-currency">Currency</label>
          <select
            id="company-currency"
            value={currency}
            onChange={(e) => handleCurrencyChange(e.target.value)}
            disabled={savingCurrency || !currency}
          >
            {CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>
                {currencyLabel(code)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="card">
        <h3 className="card-title">Appearance</h3>
        <p className="mb-3 text-sm text-gray-500">Choose how Northstack looks on this device.</p>
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
    </div>
  );
}
