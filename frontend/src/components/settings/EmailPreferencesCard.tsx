import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type EmailCategory, type EmailPreference } from '../../api';
import { useToast } from '../common/ToastProvider';
import { usePermissions } from '../../contexts/PermissionsContext';

interface EmailPreferencesCardProps {
  token: string;
}

// Settings → Profile → Email notifications (spec-shifts.md Unidad 13): each person picks which
// optional emails they get. The bell keeps showing everything; emails about the account itself
// (password, invitations, billing, legal) always arrive. Saves on every toggle.
const GROUPS: { key: string; categories: EmailCategory[] }[] = [
  { key: 'shifts', categories: ['shifts', 'shiftReminders', 'shiftSwaps', 'shiftDeclined', 'attendance', 'skillsExpiring', 'timesheet'] },
  { key: 'timeOff', categories: ['timeOff'] },
  { key: 'sales', categories: ['opportunityStage', 'opportunityStalled'] },
];

export default function EmailPreferencesCard({ token }: EmailPreferencesCardProps) {
  const { t } = useTranslation('settingsPages');
  const toast = useToast();
  const permissions = usePermissions();
  const [prefs, setPrefs] = useState<EmailPreference[] | null>(null);

  useEffect(() => {
    api
      .getEmailPreferences(token)
      .then((r) => setPrefs(r.categories))
      .catch(() => setPrefs(null));
  }, [token]);

  if (!prefs) return null;

  const toggle = async (key: EmailCategory, email: boolean) => {
    setPrefs((prev) => prev?.map((p) => (p.key === key ? { ...p, email } : p)) ?? prev);
    try {
      setPrefs((await api.updateEmailPreferences(token, { [key]: email })).categories);
    } catch (error) {
      setPrefs((prev) => prev?.map((p) => (p.key === key ? { ...p, email: !email } : p)) ?? prev);
      toast.error(t('emailPreferences.failed', { message: (error as Error).message }));
    }
  };

  // Sales emails only matter to people who own deals.
  const groups = GROUPS.filter((g) => g.key !== 'sales' || permissions.has('manage_opportunity'));

  return (
    <div className="card" id="email-notifications">
      <h3 className="card-title">{t('emailPreferences.title')}</h3>
      <p className="mb-3 text-sm text-ink-muted dark:text-dark-ink-muted">{t('emailPreferences.lead')}</p>
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.key}>
            <span className="rules-label">{t(`emailPreferences.group.${g.key}`)}</span>
            <div className="mt-1.5 flex flex-col gap-2">
              {g.categories.map((c) => {
                const on = prefs.find((p) => p.key === c)?.email ?? true;
                return (
                  <label key={c} className="rules-switch">
                    <input type="checkbox" checked={on} onChange={() => toggle(c, !on)} />
                    {t(`emailPreferences.category.${c}`)}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-faint dark:text-dark-ink-faint">{t('emailPreferences.always')}</p>
    </div>
  );
}
