import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useToast } from '../components/common/ToastProvider';
import { CURRENCY_CODES, currencyLabel } from '../lib/currencies';
import { getStoredThemePreference, setThemePreference, type ThemePreference } from '../theme';

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

interface CompanyAppearancePageProps {
  token: string;
}

export default function CompanyAppearancePage({ token }: CompanyAppearancePageProps) {
  const toast = useToast();
  const { t } = useTranslation('settingsPages');
  const [theme, setTheme] = useState<ThemePreference>(getStoredThemePreference());
  const [currency, setCurrency] = useState('');
  const [savingCurrency, setSavingCurrency] = useState(false);

  useEffect(() => {
    api
      .getCurrentTenant(token)
      .then((tenant) => setCurrency(tenant.currency))
      .catch((error) => toast.error(t('appearance.loadError', { message: (error as Error).message })));
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
      toast.success(t('appearance.currencyUpdated'));
    } catch (error) {
      setCurrency(previous);
      toast.error(t('appearance.currencyUpdateError', { message: (error as Error).message }));
    } finally {
      setSavingCurrency(false);
    }
  };

  return (
    <div className="max-w-6xl flex flex-col gap-4">
      <div className="card">
        <h3 className="card-title">{t('appearance.companyCardTitle')}</h3>
        <p className="mb-3 text-sm text-ink-muted dark:text-dark-ink-muted">
          {t('appearance.currencyHelp')}
        </p>
        <div className="nv-field max-w-xs">
          <label htmlFor="company-currency">{t('appearance.currency')}</label>
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
        <h3 className="card-title">{t('appearance.appearanceCardTitle')}</h3>
        <p className="mb-3 text-sm text-ink-muted dark:text-dark-ink-muted">{t('appearance.appearanceHelp')}</p>
        <div className="nav">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={theme === option ? 'active' : ''}
              onClick={() => handleThemeChange(option)}
            >
              {t(`appearance.theme.${option}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
