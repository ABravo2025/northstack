import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Shift } from '../../api';
import { useToast } from '../../components/common/ToastProvider';
import TableSkeleton from '../../components/common/TableSkeleton';
import AvailabilityEditor from '../../components/shifts/AvailabilityEditor';
import { addDays, formatDay, formatDuration, formatMinute, shiftDurationMinutes, todayString } from '../../lib/shiftDates';

interface MyShiftsPageProps {
  token: string;
}

const CHIP = { pending: 'to-chip-pending', accepted: 'to-chip-approved', declined: 'to-chip-rejected' } as const;
const RANGE_DAYS = 27;

// Shifts → My shifts (spec-shifts.md, Unidad 6): everyone's own upcoming shifts with accept /
// decline, plus their availability. Same answers the emailed buttons give.
export default function MyShiftsPage({ token }: MyShiftsPageProps) {
  const { t, i18n } = useTranslation('shifts');
  const toast = useToast();
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const from = todayString();
    api
      .listMyShifts(token, from, addDays(from, RANGE_DAYS))
      .then(setShifts)
      .catch((error) => toast.error(t('mine.loadFailed', { message: (error as Error).message })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const answer = async (shift: Shift, response: 'accepted' | 'declined') => {
    const mine = shift.assignments[0];
    if (!mine) return;
    setBusy(true);
    try {
      const updated = await api.respondToShift(token, mine.id, response, response === 'declined' ? reason.trim() || undefined : undefined);
      setShifts((prev) => prev?.map((s) => (s.id === updated.id ? updated : s)) ?? prev);
      setDeclining(null);
      setReason('');
      toast.success(response === 'accepted' ? t('mine.accepted') : t('mine.declined'));
    } catch (error) {
      toast.error(t('mine.failed', { message: (error as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const now = Date.now();

  return (
    <div className="container sh-page">
      <div>
        <h2 className="to-title">{t('mine.title')}</h2>
        <p className="to-subtitle">{t('mine.subtitle')}</p>
      </div>

      <section className="card rules-card">
        <h3 className="card-title">{t('mine.upcoming')}</h3>
        {shifts === null ? (
          <TableSkeleton />
        ) : shifts.length === 0 ? (
          <p className="to-hint">{t('mine.empty')}</p>
        ) : (
          <div className="flex flex-col">
            {shifts.map((s) => {
              const mine = s.assignments[0];
              const started = new Date(s.startsAt).getTime() <= now;
              const cancelled = s.status === 'cancelled';
              return (
                <div key={s.id} className="sh-assignee items-start">
                  <div className="w-14 shrink-0 rounded-lg border border-line bg-surface-2 py-1 text-center dark:border-dark-line dark:bg-dark-raised">
                    <span className="block text-[10px] font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">
                      {formatDay(s.date, i18n.language, { weekday: 'short' })}
                    </span>
                    <span className="block text-lg leading-tight font-semibold">{Number(s.date.slice(8, 10))}</span>
                    <span className="block text-[10px] text-ink-faint dark:text-dark-ink-faint">{formatDay(s.date, i18n.language, { month: 'short' })}</span>
                  </div>
                  <div className="sh-assignee-name">
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      <span className={cancelled ? 'line-through' : ''}>
                        {formatMinute(s.startMinute)} – {formatMinute(s.endMinute)}
                        {s.endsNextDay && ' (+1)'}
                      </span>
                      {cancelled ? (
                        <span className="to-chip to-chip-cancelled">{t('status.cancelled')}</span>
                      ) : (
                        mine && <span className={`to-chip ${CHIP[mine.status]}`}>{t(`status.${mine.status}`)}</span>
                      )}
                    </div>
                    <small>
                      {[s.position, s.location.name, s.location.address, formatDuration(shiftDurationMinutes(s.startMinute, s.endMinute))].filter(Boolean).join(' · ')}
                    </small>
                    {s.notes && <small className="whitespace-pre-line">{s.notes}</small>}
                    {cancelled && <small>{t('mine.cancelledNote')}</small>}
                    {!cancelled && mine && !started && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {mine.status !== 'accepted' && (
                          <button type="button" className="btn-primary" disabled={busy} onClick={() => answer(s, 'accepted')}>
                            {t('mine.accept')}
                          </button>
                        )}
                        {mine.status !== 'declined' && declining !== s.id && (
                          <button type="button" className={mine.status === 'accepted' ? 'to-link' : 'btn-secondary'} disabled={busy} onClick={() => setDeclining(s.id)}>
                            {mine.status === 'accepted' ? t('mine.cantMakeIt') : t('mine.decline')}
                          </button>
                        )}
                      </div>
                    )}
                    {!cancelled && started && <small>{t('mine.startsSoon')}</small>}
                    {declining === s.id && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <input
                          id={`decline-reason-${s.id}`}
                          className="min-w-[14rem] flex-1"
                          value={reason}
                          maxLength={500}
                          placeholder={t('mine.reasonPlaceholder')}
                          aria-label={t('mine.reasonPlaceholder')}
                          onChange={(e) => setReason(e.target.value)}
                          autoFocus
                        />
                        <button type="button" className="btn-secondary" onClick={() => setDeclining(null)}>
                          {t('form.cancel')}
                        </button>
                        <button type="button" className="btn-primary" disabled={busy} onClick={() => answer(s, 'declined')}>
                          {t('mine.send')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <AvailabilityEditor token={token} />
    </div>
  );
}
