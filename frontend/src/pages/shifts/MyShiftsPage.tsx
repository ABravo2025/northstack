import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Shift, type SwapTarget } from '../../api';
import { useToast } from '../../components/common/ToastProvider';
import TableSkeleton from '../../components/common/TableSkeleton';
import AvailabilityEditor from '../../components/shifts/AvailabilityEditor';
import Modal from '../../components/common/Modal';
import ShiftMarketplace from '../../components/shifts/ShiftMarketplace';
import { useShiftLabel } from '../../components/shifts/ShiftRequestText';
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
  // Phase 2, block A: hand over or swap one of my shifts.
  const [allowSwaps, setAllowSwaps] = useState(false);
  const [change, setChange] = useState<{ type: 'give' | 'swap'; shift: Shift; assignmentId: string } | null>(null);
  const [changeReason, setChangeReason] = useState('');
  const [targets, setTargets] = useState<SwapTarget[] | null>(null);
  const [target, setTarget] = useState('');
  const [version, setVersion] = useState(0);
  const label = useShiftLabel();

  useEffect(() => {
    api
      .getShiftsSettings(token)
      .then((s) => setAllowSwaps(s.allowSwaps))
      .catch(() => setAllowSwaps(false));
  }, [token]);

  const reload = () => {
    const from = todayString();
    api
      .listMyShifts(token, from, addDays(from, RANGE_DAYS))
      .then(setShifts)
      .catch(() => undefined);
  };

  const openChange = (type: 'give' | 'swap', shift: Shift, assignmentId: string) => {
    setChange({ type, shift, assignmentId });
    setChangeReason('');
    setTarget('');
    setTargets(null);
    if (type === 'swap') {
      api
        .listSwapTargets(token, assignmentId)
        .then((r) => setTargets(r.targets))
        .catch(() => setTargets([]));
    }
  };

  const sendChange = async () => {
    if (!change) return;
    setBusy(true);
    try {
      if (change.type === 'give') await api.giveShift(token, change.assignmentId, changeReason.trim() || undefined);
      else await api.proposeSwap(token, change.assignmentId, target, changeReason.trim() || undefined);
      toast.success(change.type === 'give' ? t('requests.giveSent') : t('requests.swapSent'));
      setChange(null);
      setVersion((v) => v + 1);
    } catch (error) {
      toast.error(t('requests.failed', { message: (error as Error).message }));
    } finally {
      setBusy(false);
    }
  };

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
                    <span className="block text-3xs font-semibold tracking-wide text-ink-faint uppercase dark:text-dark-ink-faint">
                      {formatDay(s.date, i18n.language, { weekday: 'short' })}
                    </span>
                    <span className="block text-lg leading-tight font-semibold">{Number(s.date.slice(8, 10))}</span>
                    <span className="block text-3xs text-ink-faint dark:text-dark-ink-faint">{formatDay(s.date, i18n.language, { month: 'short' })}</span>
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
                    {!cancelled && mine && !started && allowSwaps && mine.status !== 'declined' && (
                      <div className="mt-1 flex flex-wrap gap-3">
                        <button type="button" className="to-link text-xs" onClick={() => openChange('give', s, mine.id)}>
                          {t('requests.giveAction')}
                        </button>
                        <button type="button" className="to-link text-xs" onClick={() => openChange('swap', s, mine.id)}>
                          {t('requests.swapAction')}
                        </button>
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

      <ShiftMarketplace token={token} version={version} onChanged={reload} />

      <AvailabilityEditor token={token} />

      <Modal
        open={change !== null}
        title={change?.type === 'give' ? t('requests.giveTitle') : t('requests.swapTitle')}
        onClose={() => setChange(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setChange(null)}>
              {t('form.cancel')}
            </button>
            <button type="button" className="btn-primary" disabled={busy || (change?.type === 'swap' && !target)} onClick={sendChange}>
              {change?.type === 'give' ? t('requests.giveConfirm') : t('requests.swapConfirm')}
            </button>
          </>
        }
      >
        {change && (
          <div className="flex flex-col gap-3">
            <p className="m-0">
              {change.type === 'give'
                ? t('requests.giveBody', { shift: label({ ...change.shift, location: change.shift.location }) })
                : t('requests.swapBody', { shift: label({ ...change.shift, location: change.shift.location }) })}
            </p>
            {change.type === 'swap' &&
              (targets === null ? null : targets.length === 0 ? (
                <p className="to-hint m-0">{t('requests.noTargets')}</p>
              ) : (
                <div className="form-group !mb-0">
                  <label htmlFor="swap-target">{t('requests.pickTarget')}</label>
                  <select id="swap-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">{t('requests.pickTargetPlaceholder')}</option>
                    {targets.map((x) => (
                      <option key={x.assignmentId} value={x.assignmentId}>
                        {x.employee.firstName} {x.employee.lastName} — {label(x.shift)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            <div className="form-group !mb-0">
              <label htmlFor="change-reason">{t('requests.reasonLabel')}</label>
              <input id="change-reason" value={changeReason} maxLength={300} placeholder={t('requests.reasonPlaceholder')} onChange={(e) => setChangeReason(e.target.value)} />
            </div>
            <p className="rules-hint m-0">{change.type === 'give' ? t('requests.giveHint') : t('requests.swapHint')}</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
