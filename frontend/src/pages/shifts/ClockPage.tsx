import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type ClockCodeView } from '../../api';
import ClockPanel from '../../components/shifts/ClockPanel';

interface ClockPageProps {
  token: string;
}

// /clock/<code> — what the printed QR at a location opens on the person's own phone
// (spec-shifts-fase2.md §B.1). Signed-out visitors go through the login and come back here.
export default function ClockPage({ token }: ClockPageProps) {
  const { t, i18n } = useTranslation('shifts');
  const { code = '' } = useParams();
  const [view, setView] = useState<ClockCodeView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .getClockCode(token, code)
      .then((v) => {
        setView(v);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, code]);

  const time = (iso: string) => new Date(iso).toLocaleTimeString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="container sh-page mx-auto max-w-lg">
      <section className="card rules-card items-start">
        {error ? (
          <>
            <h2 className="card-title">{t('clock.invalidTitle')}</h2>
            <p className="m-0">{error}</p>
            <Link to="/shifts/mine" className="to-link">
              {t('clock.goMine')}
            </Link>
          </>
        ) : !view ? (
          <p className="to-hint m-0">{t('clock.loading')}</p>
        ) : (
          <>
            <p className="m-0 text-xs font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">{t('clock.title')}</p>
            <h2 className="m-0 text-2xl font-semibold">{view.location.name}</h2>
            {!view.open && (
              <p className="m-0 text-sm text-ink-muted dark:text-dark-ink-muted">
                {view.shiftStartsAt && view.shiftEndsAt ? t('clock.yourShift', { from: time(view.shiftStartsAt), to: time(view.shiftEndsAt) }) : t('clock.noShiftHere')}
              </p>
            )}
            {view.open && view.open.location.id !== view.location.id ? (
              <p className="sh-note-box sh-note-warn m-0">{t('clock.openElsewhere', { location: view.open.location.name })}</p>
            ) : null}
            <ClockPanel token={token} open={view.open} clockIn={{ code, requireLocation: view.requireLocation }} onChange={() => void load()} />
            {view.requireLocation && !view.open && <p className="rules-hint m-0">{t('clock.locationHint')}</p>}
          </>
        )}
      </section>
    </div>
  );
}
