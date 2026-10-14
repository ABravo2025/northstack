import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ClockMe } from '../../api';
import { usePermissions } from '../../contexts/PermissionsContext';
import ClockPanel from './ClockPanel';

// My shifts → Clock in (spec-shifts-fase2.md §B): your running punch, or the locations that let
// you clock in from the app. Hidden on plans without clock-in and when nothing applies.
export default function ClockCard({ token }: { token: string }) {
  const { t } = useTranslation('shifts');
  const { features } = usePermissions();
  const [me, setMe] = useState<ClockMe | null>(null);

  const load = () =>
    api
      .getClockMe(token)
      .then(setMe)
      .catch(() => setMe(null));

  useEffect(() => {
    if (features.clockIn) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, features.clockIn]);

  if (!features.clockIn || !me || (!me.open && me.appLocations.length === 0)) return null;
  return (
    <section className="card rules-card">
      <h3 className="card-title">{t('clock.cardTitle')}</h3>
      <ClockPanel token={token} open={me.open} clockIn={{ locations: me.appLocations }} onChange={() => void load()} />
    </section>
  );
}
