import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ClockBoardLocation, type ClockBoardState, type ClockEntry } from '../../api';
import { useToast } from '../../components/common/ToastProvider';
import Modal from '../../components/common/Modal';
import TableBody from '../../components/common/TableBody';
import TableSkeleton from '../../components/common/TableSkeleton';
import { ClockIcon } from '../../components/common/Icons';
import { formatDuration, formatMinute } from '../../lib/shiftDates';

interface TodayBoardPageProps {
  token: string;
}

const STATE_CHIP: Record<ClockBoardState, string> = {
  upcoming: 'to-chip-cancelled',
  missing: 'to-chip-rejected',
  in: 'to-chip-approved',
  on_break: 'to-chip-pending',
  out: 'to-chip-cancelled',
};

// datetime-local value in the browser's zone ↔ ISO.
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Shifts → Today (spec-shifts-fase2.md §B.3): who's in, who's missing and who already left, per
// location, computed when opened (no live alerts on a daily cron); plus punches to review
// (auto-closed, overtime, away from the location), each fixable with a reason.
export default function TodayBoardPage({ token }: TodayBoardPageProps) {
  const { t, i18n } = useTranslation('shifts');
  const toast = useToast();
  const [data, setData] = useState<{ canManage: boolean; locations: ClockBoardLocation[]; review: ClockEntry[] } | null>(null);
  const [fix, setFix] = useState<ClockEntry | null>(null);
  const [form, setForm] = useState({ in: '', out: '', breakMinutes: '', reason: '' });
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .getClockBoard(token)
      .then(setData)
      .catch((e) => toast.error(t('clock.failed', { message: (e as Error).message })));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—');
  const day = (iso: string) => new Date(iso).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short' });

  const openFix = (e: ClockEntry) => {
    setFix(e);
    setForm({ in: toLocalInput(e.clockInAt), out: toLocalInput(e.clockOutAt), breakMinutes: String(e.breakMinutes), reason: '' });
  };

  const save = async () => {
    if (!fix) return;
    setBusy(true);
    try {
      const body: Parameters<typeof api.correctClockEntry>[2] = { reason: form.reason.trim(), markReviewed: true };
      if (form.in && form.in !== toLocalInput(fix.clockInAt)) body.clockInAt = new Date(form.in).toISOString();
      if (form.out && form.out !== toLocalInput(fix.clockOutAt)) body.clockOutAt = new Date(form.out).toISOString();
      if (form.breakMinutes !== '' && Number(form.breakMinutes) !== fix.breakMinutes) body.breakMinutes = Number(form.breakMinutes);
      await api.correctClockEntry(token, fix.id, body);
      toast.success(t('clock.corrected'));
      setFix(null);
      await load();
    } catch (e) {
      toast.error(t('clock.failed', { message: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const reviewReason = (e: ClockEntry) =>
    e.status === 'auto_closed' ? t('clock.review.autoClosed') : !e.shiftAssignmentId || e.needsReview ? (e.awayFromLocation ? t('clock.review.away') : t('clock.review.overtime')) : '';

  return (
    <div className="container sh-page">
      <div>
        <h2 className="to-title">{t('clock.boardTitle')}</h2>
        <p className="to-subtitle">{t('clock.boardSubtitle')}</p>
      </div>

      {!data ? (
        <TableSkeleton />
      ) : !data.canManage ? (
        <p className="sh-note-box">{t('requests.notScheduler')}</p>
      ) : (
        <>
          {data.review.length > 0 && (
            <section className="card rules-card">
              <h3 className="card-title">{t('clock.reviewTitle')}</h3>
              <div className="flex flex-col">
                {data.review.map((e) => (
                  <div key={e.id} className="sh-assignee items-start">
                    <div className="sh-assignee-name">
                      <div className="font-semibold">
                        {e.employee.firstName} {e.employee.lastName} · {e.location.name}
                      </div>
                      <small>
                        {day(e.clockInAt)} · {hhmm(e.clockInAt)}–{hhmm(e.clockOutAt)} · {formatDuration(e.workedMinutes)}
                      </small>
                      <small className="text-amber-700 dark:text-amber-300">{reviewReason(e)}</small>
                    </div>
                    <button type="button" className="btn-secondary" onClick={() => openFix(e)}>
                      {t('clock.reviewAction')}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.locations.map((l) => (
            <section key={l.location.id} className="card rules-card">
              <h3 className="card-title">{l.location.name}</h3>
              {l.location.clockMethod === 'off' && <p className="rules-hint m-0">{t('clock.locationOff')}</p>}
              <div className="full-table-wrap">
                <table className="table full-table !mt-0 to-table">
                  <thead>
                    <tr>
                      <th>{t('clock.col.person')}</th>
                      <th>{t('clock.col.shift')}</th>
                      <th>{t('clock.col.state')}</th>
                      <th>{t('clock.col.in')}</th>
                      <th>{t('clock.col.out')}</th>
                      <th>{t('clock.col.worked')}</th>
                    </tr>
                  </thead>
                  <TableBody colSpan={6} isEmpty={l.rows.length === 0 && l.unscheduled.length === 0} empty={{ icon: <ClockIcon />, title: t('clock.noShiftsToday') }}>
                    {l.rows.map((r) => (
                      <tr key={`${r.shift.id}:${r.employee.id}`} className={r.entry ? 'to-row' : ''} onClick={() => r.entry && openFix(r.entry)}>
                        <td className="font-medium">
                          {r.employee.firstName} {r.employee.lastName}
                        </td>
                        <td>
                          {formatMinute(r.shift.startMinute)}–{formatMinute(r.shift.endMinute)}
                          {r.shift.isOvertime && <span className="to-chip to-chip-pending ml-2">{t('clock.overtime')}</span>}
                        </td>
                        <td>
                          <span className={`to-chip ${STATE_CHIP[r.state]}`}>{t(`clock.state.${r.state}`)}</span>
                          {r.late && <span className="to-chip to-chip-rejected ml-1">{t('clock.late')}</span>}
                          {r.entry?.awayFromLocation && <span className="to-chip to-chip-pending ml-1">{t('clock.away')}</span>}
                        </td>
                        <td>{hhmm(r.entry?.clockInAt ?? null)}</td>
                        <td>{hhmm(r.entry?.clockOutAt ?? null)}</td>
                        <td>{r.entry ? formatDuration(r.entry.workedMinutes) : '—'}</td>
                      </tr>
                    ))}
                    {l.unscheduled.map((e) => (
                      <tr key={e.id} className="to-row" onClick={() => openFix(e)}>
                        <td className="font-medium">
                          {e.employee.firstName} {e.employee.lastName}
                        </td>
                        <td>
                          <span className="to-chip to-chip-pending">{t('clock.noShift')}</span>
                        </td>
                        <td>
                          <span className={`to-chip ${STATE_CHIP[e.onBreakSince ? 'on_break' : 'in']}`}>{t(`clock.state.${e.onBreakSince ? 'on_break' : 'in'}`)}</span>
                        </td>
                        <td>{hhmm(e.clockInAt)}</td>
                        <td>—</td>
                        <td>{formatDuration(e.workedMinutes)}</td>
                      </tr>
                    ))}
                  </TableBody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}

      <Modal
        open={fix !== null}
        title={fix ? t('clock.fixTitle', { name: `${fix.employee.firstName} ${fix.employee.lastName}` }) : ''}
        onClose={() => setFix(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setFix(null)}>
              {t('form.cancel')}
            </button>
            <button type="button" className="btn-primary" disabled={busy || !form.reason.trim()} onClick={save}>
              {t('clock.fixSave')}
            </button>
          </>
        }
      >
        {fix && (
          <div className="flex flex-col gap-1">
            <div className="form-group">
              <label htmlFor="fix-in">{t('clock.col.in')}</label>
              <input id="fix-in" type="datetime-local" value={form.in} onChange={(e) => setForm({ ...form, in: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="fix-out">{t('clock.col.out')}</label>
              <input id="fix-out" type="datetime-local" value={form.out} onChange={(e) => setForm({ ...form, out: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="fix-break">{t('clock.breakMinutes')}</label>
              <input id="fix-break" type="number" min={0} max={720} className="!w-28" value={form.breakMinutes} onChange={(e) => setForm({ ...form, breakMinutes: e.target.value })} />
            </div>
            <div className="form-group">
              <label htmlFor="fix-reason">{t('clock.fixReason')}</label>
              <input id="fix-reason" value={form.reason} maxLength={300} onChange={(e) => setForm({ ...form, reason: e.target.value })} autoFocus />
            </div>
            <p className="rules-hint m-0">{t('clock.fixHint')}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
