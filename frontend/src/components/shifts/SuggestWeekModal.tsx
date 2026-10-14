import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { ScheduleSuggestions } from '../../api/shifts';
import Modal from '../common/Modal';
import { useToast } from '../common/ToastProvider';
import { formatDay, formatMinute } from '../../lib/shiftDates';

interface SuggestWeekModalProps {
  token: string;
  weekStart: string;
  locationId?: string;
  onClose: () => void;
  onApplied: () => void;
}

// Schedule → "Suggest week" (spec-shifts-fase2.md §E, Growth): who could cover the week's draft
// shifts with free places. Each line can be unticked; applying assigns the ticked ones and the
// shifts stay drafts — nobody hears about it until the week is published.
export default function SuggestWeekModal({ token, weekStart, locationId, onClose, onApplied }: SuggestWeekModalProps) {
  const { t, i18n } = useTranslation('shifts');
  const toast = useToast();
  const [data, setData] = useState<ScheduleSuggestions | null>(null);
  const [off, setOff] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .suggestWeek(token, weekStart, locationId)
      .then(setData)
      .catch((e) => {
        toast.error(t('suggest.failed', { message: (e as Error).message }));
        onClose();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, weekStart, locationId]);

  const when = (s: ScheduleSuggestions['suggestions'][number]['shift']) =>
    `${formatDay(s.date, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })} · ${formatMinute(s.startMinute)}–${formatMinute(s.endMinute)}`;
  const kept = data ? data.suggestions.filter((_, i) => !off.has(i)) : [];

  const apply = async () => {
    setBusy(true);
    try {
      const r = await api.applySuggestions(
        token,
        kept.map((s) => ({ shiftId: s.shift.id, employeeId: s.employee.id })),
        locationId,
      );
      toast.success(r.skipped > 0 ? t('suggest.appliedSkipped', { count: r.applied, skipped: r.skipped }) : t('suggest.applied', { count: r.applied }));
      onApplied();
    } catch (e) {
      toast.error(t('suggest.failed', { message: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={t('suggest.title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('form.cancel')}
          </button>
          <button type="button" className="btn-primary" disabled={busy || kept.length === 0} onClick={apply}>
            {t('suggest.apply', { count: kept.length })}
          </button>
        </>
      }
    >
      {!data ? (
        <p className="m-0 text-ink-muted dark:text-dark-ink-muted">{t('suggest.loading')}</p>
      ) : data.shifts === 0 ? (
        <p className="m-0">{t('suggest.nothing')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="m-0">{t('suggest.body')}</p>
          {data.suggestions.length > 0 && (
            <ul className="m-0 flex max-h-[50vh] list-none flex-col gap-1 overflow-y-auto p-0">
              {data.suggestions.map((s, i) => (
                <li key={`${s.shift.id}-${s.employee.id}`}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2 dark:hover:bg-dark-raised">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={!off.has(i)}
                      onChange={() =>
                        setOff((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        })
                      }
                    />
                    <span className="flex flex-col">
                      <span className="font-semibold">{s.employee.name}</span>
                      <span className="text-sm text-ink-muted dark:text-dark-ink-muted">
                        {when(s.shift)} · {s.shift.location.name}
                        {s.shift.position && ` · ${s.shift.position}`}
                      </span>
                      {s.warnings.map((w) => (
                        <span key={w} className="text-xs text-amber-700 dark:text-amber-300">
                          {t(`warnings.${w}`)}
                        </span>
                      ))}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {data.unfilled.length > 0 && (
            <div className="rounded-lg border border-line p-3 text-sm dark:border-dark-line">
              <p className="m-0 font-semibold">{t('suggest.unfilledTitle')}</p>
              <ul className="m-0 mt-1 pl-4 text-ink-muted dark:text-dark-ink-muted">
                {data.unfilled.map((u) => (
                  <li key={u.shift.id}>
                    {when(u.shift)} · {u.shift.location.name} — {t('suggest.places', { count: u.places })}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="rules-hint m-0">{t('suggest.hint')}</p>
        </div>
      )}
    </Modal>
  );
}
