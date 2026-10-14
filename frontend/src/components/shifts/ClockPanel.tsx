import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ClockEntry } from '../../api';
import { useToast } from '../common/ToastProvider';
import { formatDuration } from '../../lib/shiftDates';
import { currentPosition } from '../../lib/geo';

interface ClockPanelProps {
  token: string;
  open: ClockEntry | null;
  // How clocking in happens from here: through a location's QR code, or from the app at a location.
  clockIn: { code: string; requireLocation: boolean } | { locations: { id: string; name: string; requireLocation: boolean; shiftStartsAt: string | null }[] } | null;
  onChange: (entry: ClockEntry | null) => void;
}

const time = (iso: string, lng: string) => new Date(iso).toLocaleTimeString(lng.startsWith('es') ? 'es-AR' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

// Clock in / out (spec-shifts-fase2.md §B): the big buttons, breaks (buttons, or minutes typed at
// clock-out when no button was used), and the running time. Shared by the QR page and My shifts.
export default function ClockPanel({ token, open, clockIn, onChange }: ClockPanelProps) {
  const { t, i18n } = useTranslation('shifts');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [breakMinutes, setBreakMinutes] = useState('');
  const [, tick] = useState(0);

  // Running time moves every 30 s while clocked in.
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [open]);

  const run = async (action: () => Promise<ClockEntry | null>, success: string) => {
    setBusy(true);
    try {
      onChange(await action());
      toast.success(success);
    } catch (error) {
      toast.error(t('clock.failed', { message: (error as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const doIn = (target: { code?: string; locationId?: string; requireLocation: boolean }) =>
    run(async () => {
      const geo = target.requireLocation ? await currentPosition() : null;
      const entry = await api.clockIn(token, { code: target.code, locationId: target.locationId, geo });
      if (entry.awayFromLocation) toast.error(t('clock.awayWarning'));
      return entry;
    }, t('clock.inToast'));

  if (open) {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(open.clockInAt).getTime()) / 60_000) - open.breakMinutes);
    return (
      <div className="flex flex-col gap-3">
        <div>
          <p className="m-0 text-sm text-ink-muted dark:text-dark-ink-muted">
            {t('clock.inSince', { time: time(open.clockInAt, i18n.language), location: open.location.name })}
          </p>
          <p className="m-0 text-3xl font-semibold">{formatDuration(minutes)}</p>
          {open.onBreakSince && <p className="m-0 text-sm text-amber-700 dark:text-amber-300">{t('clock.onBreakSince', { time: time(open.onBreakSince, i18n.language) })}</p>}
          {open.awayFromLocation && <p className="m-0 text-xs text-amber-700 dark:text-amber-300">{t('clock.awayFlag')}</p>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {open.onBreakSince ? (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => api.clockBreak(token, 'end'), t('clock.breakEnded'))}>
              {t('clock.endBreak')}
            </button>
          ) : (
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => api.clockBreak(token, 'start'), t('clock.breakStarted'))}>
              {t('clock.startBreak')}
            </button>
          )}
          {!open.breakButtonsUsed && (
            <div className="form-group !mb-0">
              <label htmlFor="clock-break">{t('clock.breakMinutes')}</label>
              <input id="clock-break" type="number" min={0} max={720} className="!w-28" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} />
            </div>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const out = await api.clockOut(token, { breakMinutes: open.breakButtonsUsed || breakMinutes === '' ? undefined : Number(breakMinutes) });
                if (out.overtime) toast.success(t('clock.overtimeToast'));
                setBreakMinutes('');
                return null;
              }, t('clock.outToast'))
            }
          >
            {t('clock.out')}
          </button>
        </div>
      </div>
    );
  }

  if (!clockIn) return <p className="to-hint m-0">{t('clock.noPlace')}</p>;
  if ('code' in clockIn) {
    return (
      <button type="button" className="btn-primary !px-6 !py-3 text-base" disabled={busy} onClick={() => doIn({ code: clockIn.code, requireLocation: clockIn.requireLocation })}>
        {t('clock.in')}
      </button>
    );
  }
  if (clockIn.locations.length === 0) return <p className="to-hint m-0">{t('clock.noAppLocations')}</p>;
  return (
    <div className="flex flex-col gap-2">
      {clockIn.locations.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn-primary" disabled={busy} onClick={() => doIn({ locationId: l.id, requireLocation: l.requireLocation })}>
            {t('clock.inAt', { location: l.name })}
          </button>
          <small className="text-ink-muted dark:text-dark-ink-muted">
            {l.shiftStartsAt ? t('clock.shiftAt', { time: time(l.shiftStartsAt, i18n.language) }) : t('clock.noShiftOvertime')}
          </small>
        </div>
      ))}
    </div>
  );
}
