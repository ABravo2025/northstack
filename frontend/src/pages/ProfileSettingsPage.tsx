import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useToast } from '../components/common/ToastProvider';
import PasswordInput from '../components/common/PasswordInput';
import PasswordChecklist from '../components/common/PasswordChecklist';
import { SUPPORTED_LOCALES, type SupportedLocale } from '../lib/i18n';
import { getStoredThemePreference, setThemePreference, type ThemePreference } from '../theme';

// Moved here from the old Settings → Appearance page (2026-09-25): the theme is stored per
// device, not per tenant, so it belongs with the user's own preferences — and every user can
// reach Profile, whereas Appearance sat behind manage_tenant_settings.
const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

interface ProfileSettingsPageProps {
  user: any;
  token: string;
  onUserUpdated: (user: any) => void;
}

export default function ProfileSettingsPage({ user, token, onUserUpdated }: ProfileSettingsPageProps) {
  const toast = useToast();
  const { t } = useTranslation();
  const { t: tSettings } = useTranslation('settingsPages');
  const [theme, setTheme] = useState<ThemePreference>(getStoredThemePreference());
  const [profileForm, setProfileForm] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
  });
  const [profileError, setProfileError] = useState<{ message: string; field?: string } | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [localeSaving, setLocaleSaving] = useState(false);

  const handleLocaleChange = async (locale: SupportedLocale) => {
    setLocaleSaving(true);
    try {
      const result = await api.updateLocale(token, locale);
      onUserUpdated(result.user);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLocaleSaving(false);
    }
  };

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [passwordError, setPasswordError] = useState<{ message: string; field?: string } | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSaving(true);
    try {
      const result = await api.updateProfile(token, profileForm);
      onUserUpdated(result.user);
      toast.success(t('profile.toastProfileUpdated'));
    } catch (error) {
      const field = (error as any).field;
      if (field) {
        setProfileError({ message: (error as Error).message, field });
      } else {
        toast.error((error as Error).message);
      }
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSaving(true);
    try {
      await api.changePassword(token, passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      toast.success(t('profile.toastPasswordUpdated'));
    } catch (error) {
      const field = (error as any).field;
      if (field) {
        setPasswordError({ message: (error as Error).message, field });
      } else {
        toast.error((error as Error).message);
      }
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="max-w-6xl">
      <div className="card">
        <h3 className="card-title">{t('profile.cardTitle')}</h3>
        <form onSubmit={handleProfileSubmit}>
          <div className="form-group">
            <label htmlFor="profile-firstName">{t('profile.firstName')}</label>
            <input
              id="profile-firstName"
              value={profileForm.firstName}
              onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
            />
            {profileError?.field === 'firstName' && (
              <p className="field-error">{profileError.message}</p>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="profile-lastName">{t('profile.lastName')}</label>
            <input
              id="profile-lastName"
              value={profileForm.lastName}
              onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
            />
            {profileError?.field === 'lastName' && (
              <p className="field-error">{profileError.message}</p>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="profile-phone">{t('profile.phone')}</label>
            <input
              id="profile-phone"
              value={profileForm.phone}
              onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
            />
            {profileError?.field === 'phone' && <p className="field-error">{profileError.message}</p>}
          </div>
          <div className="form-group">
            <label htmlFor="profile-email">{t('profile.email')}</label>
            <input id="profile-email" value={user.email} disabled />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={profileSaving}>
              {profileSaving ? t('profile.saving') : t('profile.saveChanges')}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3 className="card-title">{t('language.label')}</h3>
        <div className="form-group">
          <label htmlFor="profile-locale">{t('language.label')}</label>
          <select
            id="profile-locale"
            value={user.locale ?? ''}
            disabled={localeSaving}
            onChange={(e) => handleLocaleChange(e.target.value as SupportedLocale)}
          >
            {!user.locale && <option value="" disabled>—</option>}
            {SUPPORTED_LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {t(`language.${locale}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">{tSettings('appearance.appearanceCardTitle')}</h3>
        <p className="mb-3 text-sm text-ink-muted dark:text-dark-ink-muted">{tSettings('appearance.appearanceHelp')}</p>
        <div className="nav">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={theme === option ? 'active' : ''}
              onClick={() => {
                setTheme(option);
                setThemePreference(option);
              }}
            >
              {tSettings(`appearance.theme.${option}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="card-title">{t('profile.changePassword')}</h3>
        <form onSubmit={handlePasswordSubmit}>
          <div className="form-group">
            <label htmlFor="profile-currentPassword">{t('profile.currentPassword')}</label>
            <PasswordInput
              id="profile-currentPassword"
              value={passwordForm.currentPassword}
              onChange={(value) => setPasswordForm({ ...passwordForm, currentPassword: value })}
              autoComplete="current-password"
            />
            {passwordError?.field === 'currentPassword' && (
              <p className="field-error">{passwordError.message}</p>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="profile-newPassword">{t('profile.newPassword')}</label>
            <PasswordInput
              id="profile-newPassword"
              value={passwordForm.newPassword}
              onChange={(value) => setPasswordForm({ ...passwordForm, newPassword: value })}
              autoComplete="new-password"
            />
            <PasswordChecklist password={passwordForm.newPassword} />
            {passwordError?.field === 'newPassword' && (
              <p className="field-error">{passwordError.message}</p>
            )}
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={passwordSaving}>
              {passwordSaving ? t('profile.updating') : t('profile.updatePassword')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
