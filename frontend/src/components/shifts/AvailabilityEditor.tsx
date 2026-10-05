import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ShiftAvailability } from '../../api';
import { useToast } from '../common/ToastProvider';
import { TrashIcon } from '../common/Icons';
import { formatDay, formatMinute, parseTimeInput, todayString } from '../../lib/shiftDates';

interface AvailabilityEditorProps {
  token: string;
}

// Monday-first, the way people read a week.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Draft = { mode: 'weekly' | 'date'; weekday: number; date: string; from: string; to: string; kind: 'available' | 'unavailable'; note: string };

// 1440 (midnight, the end of the day) shows as 24:00.
const showMinute = (m: number) => (m === 1440 ? '24:00' : formatMinute(m));

// "My availability" (spec-shifts.md, Unidad 6): recurring weekly stretches plus one-off dates.
// The scheduler sees these as warnings when assigning, never as blocks.
export default function AvailabilityEditor({ token }: AvailabilityEditorProps) {
  const { t, i18n } = useTranslation('shifts');
  const toast = useToast();
  const [rows, setRows] = useState<ShiftAvailability[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const weekdays = t('settings.weekdays', { returnObjects: true }) as string[];

  useEffect(() => {
    api.listMyAvailability(token).then(setRows).catch(() => setRows([]));
  }, [token]);

  const fail = (error: unknown) => toast.error(t('availability.failed', { message: (error as Error).message }));

  const start = (mode: Draft['mode']) =>
    setDraft({ mode, weekday: 1, date: todayString(), from: '08:00', to: '17:00', kind: mode === 'weekly' ? 'available' : 'unavailable', note: '' });

  const from = draft ? parseTimeInput(draft.from) : null;
  // "00:00" as an end means midnight at the end of the day.
  const to = draft ? (draft.to === '00:00' ? 1440 : parseTimeInput(draft.to)) : null;
  const valid = draft !== null && from !== null && to !== null && to > from && (draft.mode === 'weekly' || !!draft.date);

  const save = async () => {
    if (!draft || !valid) return;
    try {
      const created = await api.createMyAvailability(token, {
        weekday: draft.mode === 'weekly' ? draft.weekday : null,
        date: draft.mode === 'date' ? draft.date : null,
        startMinute: from!,
        endMinute: to!,
        kind: draft.kind,
        note: draft.note.trim() || null,
      });
      setRows((prev) => [...(prev ?? []), created]);
      setDraft(null);
      toast.success(t('availability.saved'));
    } catch (error) {
      fail(error);
    }
  };

  const remove = async (id: string) => {
    const previous = rows;
    setRows((prev) => prev?.filter((r) => r.id !== id) ?? prev);
    try {
      await api.deleteMyAvailability(token, id);
    } catch (error) {
      setRows(previous);
      fail(error);
    }
  };

  const weekly = (rows ?? []).filter((r) => r.weekday !== null).sort((a, b) => WEEK_ORDER.indexOf(a.weekday!) - WEEK_ORDER.indexOf(b.weekday!) || a.startMinute - b.startMinute);
  const dated = (rows ?? []).filter((r) => r.date !== null && r.date >= todayString()).sort((a, b) => a.date!.localeCompare(b.date!) || a.startMinute - b.startMinute);

  const row = (r: ShiftAvailability, label: string) => (
    <div key={r.id} className="sh-assignee">
      <div className="sh-assignee-name">
        <span className="capitalize">{label}</span> · {r.startMinute === 0 && r.endMinute === 1440 ? t('availability.allDay') : `${showMinute(r.startMinute)}–${showMinute(r.endMinute)}`}
        {r.note && <small>{r.note}</small>}
      </div>
      <span className={`to-chip ${r.kind === 'available' ? 'to-chip-approved' : 'to-chip-rejected'}`}>
        {r.kind === 'available' ? t('availability.kindAvailable') : t('availability.kindUnavailable')}
      </span>
      <button type="button" className="icon-btn" onClick={() => remove(r.id)} aria-label={t('availability.removeAria')}>
        <TrashIcon />
      </button>
    </div>
  );

  return (
    <section className="card rules-card">
      <h3 className="card-title">{t('availability.title')}</h3>
      <p className="rules-lead">{t('availability.lead')}</p>

      <div className="rules-grid">
        <div>
          <p className="rules-subtitle">{t('availability.weekly')}</p>
          {rows !== null && weekly.length === 0 && <p className="to-hint mt-1">{t('availability.emptyWeekly')}</p>}
          {weekly.map((r) => row(r, weekdays[r.weekday!]))}
          {!draft && (
            <button type="button" className="to-link mt-2" onClick={() => start('weekly')}>
              + {t('availability.addWeekly')}
            </button>
          )}
        </div>
        <div>
          <p className="rules-subtitle">{t('availability.oneOff')}</p>
          {rows !== null && dated.length === 0 && <p className="to-hint mt-1">{t('availability.emptyDates')}</p>}
          {dated.map((r) => row(r, formatDay(r.date!, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })))}
          {!draft && (
            <button type="button" className="to-link mt-2" onClick={() => start('date')}>
              + {t('availability.addDate')}
            </button>
          )}
        </div>
      </div>

      {draft && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-line p-3 dark:border-dark-line">
          {draft.mode === 'weekly' ? (
            <div className="form-group !mb-0">
              <label htmlFor="avail-day">{t('availability.day')}</label>
              <select id="avail-day" value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}>
                {WEEK_ORDER.map((d) => (
                  <option key={d} value={d}>
                    {weekdays[d]}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="form-group !mb-0">
              <label htmlFor="avail-date">{t('availability.date')}</label>
              <input id="avail-date" type="date" min={todayString()} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </div>
          )}
          <div className="form-group !mb-0">
            <label htmlFor="avail-from">{t('availability.from')}</label>
            <input id="avail-from" type="time" step={300} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
          </div>
          <div className="form-group !mb-0">
            <label htmlFor="avail-to">{t('availability.to')}</label>
            <input id="avail-to" type="time" step={300} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </div>
          <div className="mini-toggle-row" role="group">
            <button type="button" className={`mini-toggle-opt ${draft.kind === 'available' ? 'active' : ''}`} onClick={() => setDraft({ ...draft, kind: 'available' })}>
              {t('availability.kindAvailable')}
            </button>
            <button type="button" className={`mini-toggle-opt ${draft.kind === 'unavailable' ? 'active' : ''}`} onClick={() => setDraft({ ...draft, kind: 'unavailable' })}>
              {t('availability.kindUnavailable')}
            </button>
          </div>
          <div className="form-group !mb-0 min-w-[12rem] flex-1">
            <label htmlFor="avail-note">{t('availability.note')}</label>
            <input id="avail-note" value={draft.note} maxLength={200} placeholder={t('availability.notePlaceholder')} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </div>
          <button type="button" className="btn-secondary" onClick={() => setDraft(null)}>
            {t('form.cancel')}
          </button>
          <button type="button" className="btn-primary" disabled={!valid} onClick={save}>
            {t('availability.add')}
          </button>
        </div>
      )}
    </section>
  );
}
