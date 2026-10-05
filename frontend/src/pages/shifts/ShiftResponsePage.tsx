import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, type PublicShiftResponseView } from '../../api';
import { formatDay, formatDuration, formatMinute, shiftDurationMinutes } from '../../lib/shiftDates';

// The page behind the emailed "I'll be there" / "I can't make it" buttons (spec-shifts.md,
// Unidad 6) — public, no session; the token in the URL is the credential. Opening the link never
// answers by itself: email security scanners open links automatically, so the answer is only sent
// when the person presses the button here. ?answer= just preselects which button to show.
export default function ShiftResponsePage() {
  const { t, i18n } = useTranslation('shifts');
  const { token = '' } = useParams();
  const [params] = useSearchParams();
  const [view, setView] = useState<PublicShiftResponseView | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [choice, setChoice] = useState<'accepted' | 'declined'>(params.get('answer') === 'declined' ? 'declined' : 'accepted');
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null);
  const [changing, setChanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getPublicShiftResponse(token)
      .then(setView)
      .catch(() => setInvalid(true));
  }, [token]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.answerPublicShiftResponse(token, choice, choice === 'declined' ? reason.trim() || undefined : undefined);
      setView(updated);
      setDone(choice);
      setChanging(false);
    } catch (e) {
      setError(t('response.failed', { message: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const s = view?.shift;
  const answered = view && view.status !== 'pending' && !changing && !done;

  return (
    <div className="page">
      <div className="header">
        <img src="/logo-horizontal-light.svg" alt="Northstack" className="dark:hidden" />
        <img src="/logo-horizontal-dark.svg" alt="Northstack" className="hidden dark:block" />
      </div>
      <div className="container">
        <div className="card mx-auto mt-10 flex max-w-xl flex-col gap-4">
          <h2 className="m-0">{t('response.title')}</h2>

          {!view && !invalid && <p className="text-ink-muted dark:text-dark-ink-muted">{t('response.loading')}</p>}

          {invalid && (
            <>
              <p className="m-0 font-semibold">{t('response.invalid')}</p>
              <p className="m-0 text-ink-muted dark:text-dark-ink-muted">{t('response.invalidBody')}</p>
              <Link to="/shifts/mine" className="btn-secondary self-start">
                {t('response.openApp')}
              </Link>
            </>
          )}

          {view && s && (
            <>
              <p className="m-0 text-ink-muted dark:text-dark-ink-muted">{t('response.hi', { name: view.employeeFirstName, company: view.companyName })}</p>
              <div className="rounded-xl border border-line bg-surface-2 p-4 dark:border-dark-line dark:bg-dark-raised">
                <div className="text-base font-semibold capitalize">{formatDay(s.date, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                <div className="font-semibold">
                  {formatMinute(s.startMinute)} – {formatMinute(s.endMinute)} · {formatDuration(shiftDurationMinutes(s.startMinute, s.endMinute))}
                </div>
                {s.position && <div>{s.position}</div>}
                <div className="text-ink-muted dark:text-dark-ink-muted">{[s.location.name, s.location.address].filter(Boolean).join(' · ')}</div>
                {s.notes && <div className="mt-2 whitespace-pre-line text-ink-muted dark:text-dark-ink-muted">{s.notes}</div>}
              </div>

              {s.status === 'cancelled' ? (
                <p className="sh-note-box m-0">{t('response.cancelled')}</p>
              ) : done ? (
                <p className="sh-note-box m-0">{done === 'accepted' ? t('response.doneAccepted') : t('response.doneDeclined')}</p>
              ) : answered ? (
                <>
                  <p className="sh-note-box m-0">{view.status === 'accepted' ? t('response.currentAccepted') : t('response.currentDeclined')}</p>
                  <button
                    type="button"
                    className="to-link self-start"
                    onClick={() => {
                      setChoice(view.status === 'accepted' ? 'declined' : 'accepted');
                      setChanging(true);
                    }}
                  >
                    {t('response.changeAnswer')}
                  </button>
                </>
              ) : (
                <>
                  <div className="mini-toggle-row self-start" role="group">
                    <button type="button" className={`mini-toggle-opt ${choice === 'accepted' ? 'active' : ''}`} onClick={() => setChoice('accepted')}>
                      {t('mine.accept')}
                    </button>
                    <button type="button" className={`mini-toggle-opt ${choice === 'declined' ? 'active' : ''}`} onClick={() => setChoice('declined')}>
                      {t('mine.decline')}
                    </button>
                  </div>
                  {choice === 'declined' && (
                    <div className="form-group !mb-0">
                      <label htmlFor="shift-response-reason">{t('response.reasonLabel')}</label>
                      <textarea id="shift-response-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
                    </div>
                  )}
                  {error && <div className="alert alert-error">{error}</div>}
                  <button type="button" className="btn-primary self-start" disabled={busy} onClick={submit}>
                    {choice === 'accepted' ? t('response.confirmAccept') : t('response.confirmDecline')}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
