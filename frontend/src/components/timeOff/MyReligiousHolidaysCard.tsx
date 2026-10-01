import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ReligionKey } from '../../api';
import { useToast } from '../common/ToastProvider';

// Settings → Profile: the person picks which of the company's enabled religious holidays apply to
// them (2026-10). Hidden when the company enabled none or the account isn't linked to an employee.
export default function MyReligiousHolidaysCard({ token }: { token: string }) {
  const { t } = useTranslation('tasks');
  const toast = useToast();
  const [data, setData] = useState<{ linked: boolean; enabledReligions: ReligionKey[]; religions: ReligionKey[] } | null>(null);

  useEffect(() => {
    api.getMyReligiousHolidays(token).then(setData).catch(() => setData(null));
  }, [token]);

  if (!data || !data.linked || data.enabledReligions.length === 0) return null;

  const toggle = async (religion: ReligionKey) => {
    const next = data.religions.includes(religion) ? data.religions.filter((r) => r !== religion) : [...data.religions, religion];
    const previous = data;
    setData({ ...data, religions: next });
    try {
      await api.setMyReligiousHolidays(token, next);
      toast.success(t('timeOff.rules.profile.saved'));
    } catch (error) {
      setData(previous);
      toast.error((error as Error).message);
    }
  };

  return (
    <div className="card">
      <h3 className="card-title">{t('timeOff.rules.profile.title')}</h3>
      <p className="rules-lead mb-3">{t('timeOff.rules.profile.lead')}</p>
      <div className="rules-chips">
        {data.enabledReligions.map((r) => {
          const on = data.religions.includes(r);
          return (
            <label key={r} className={`rules-pick ${on ? 'on' : ''}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(r)} />
              {t(`timeOff.rules.religions.${r}`)}
            </label>
          );
        })}
      </div>
    </div>
  );
}
