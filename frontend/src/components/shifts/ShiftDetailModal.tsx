import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, type Shift, type ShiftCandidate, type ShiftWarning } from '../../api';
import Modal from '../common/Modal';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../common/ToastProvider';
import { AlertCircleIcon, AlertTriangleIcon, TrashIcon } from '../common/Icons';
import { formatDay, formatDuration, formatMinute, shiftDurationMinutes } from '../../lib/shiftDates';

interface ShiftDetailModalProps {
  token: string;
  shift: Shift | null;
  canManage: boolean;
  onClose: () => void;
  onChanged: (shift: Shift | null, removedId?: string) => void;
  onEdit: (shift: Shift) => void;
}

type Confirm = 'delete' | 'cancel' | null;

const CHIP: Record<string, string> = {
  pending: 'to-chip-pending',
  accepted: 'to-chip-approved',
  declined: 'to-chip-rejected',
  draft: 'to-chip-cancelled',
};

export default function ShiftDetailModal({ token, shift, canManage, onClose, onChanged, onEdit }: ShiftDetailModalProps) {
  const { t, i18n } = useTranslation('shifts');
  const toast = useToast();
  const [picking, setPicking] = useState(false);
  const [candidates, setCandidates] = useState<ShiftCandidate[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [pendingWarnings, setPendingWarnings] = useState<Record<string, ShiftWarning[]> | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  useEffect(() => {
    setPicking(false);
    setCandidates(null);
    setSelected([]);
    setSearch('');
    setPendingWarnings(null);
  }, [shift?.id]);

  const fail = (error: unknown) => toast.error(t('detail.actionFailed', { message: (error as Error).message }));

  const openPicker = () => {
    if (!shift) return;
    setPicking(true);
    setCandidates(null);
    api.listShiftCandidates(token, shift.id).then(setCandidates).catch(fail);
  };

  const visibleCandidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (candidates ?? []).filter((c) => !c.blocks.includes('already_assigned') && (!q || `${c.firstName} ${c.lastName}`.toLowerCase().includes(q)));
  }, [candidates, search]);

  const assign = async (force: boolean) => {
    if (!shift || selected.length === 0) return;
    setBusy(true);
    try {
      const updated = await api.assignToShift(token, shift.id, selected, force);
      onChanged(updated);
      setPicking(false);
      setSelected([]);
      setPendingWarnings(null);
    } catch (error) {
      const body = error instanceof ApiError ? (error.body as { code?: string; details?: Record<string, { warnings: ShiftWarning[] }> }) : null;
      if (error instanceof ApiError && error.status === 409 && body?.code === 'warnings' && body.details) {
        setPendingWarnings(Object.fromEntries(Object.entries(body.details).map(([id, d]) => [id, d.warnings])));
      } else {
        fail(error);
      }
    } finally {
      setBusy(false);
    }
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  if (!shift) return null;

  const date = formatDay(shift.date, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' });
  const time = `${formatMinute(shift.startMinute)}–${formatMinute(shift.endMinute)}`;
  const editable = canManage && shift.status !== 'cancelled';
  const nameOf = (id: string) => {
    const c = candidates?.find((x) => x.id === id);
    return c ? `${c.firstName} ${c.lastName}` : id;
  };

  const footer = editable ? (
    <>
      {shift.status === 'draft' ? (
        <button type="button" className="btn-secondary mr-auto" disabled={busy} onClick={() => setConfirm('delete')}>
          {t('detail.deleteDraft')}
        </button>
      ) : (
        <button type="button" className="btn-secondary mr-auto" disabled={busy} onClick={() => setConfirm('cancel')}>
          {t('detail.cancelShift')}
        </button>
      )}
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => onEdit(shift)}>
        {t('detail.edit')}
      </button>
      {shift.status === 'draft' && (
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await api.publishShifts(token, [shift.id]);
              toast.success(t('schedule.published', { count: r.published }));
              onChanged(r.shifts[0] ?? null);
            })
          }
        >
          {t('detail.publish')}
        </button>
      )}
    </>
  ) : undefined;

  return (
    <>
      <Modal open={!!shift} title={shift.position ?? shift.location.name} onClose={onClose} wide footer={footer}>
        <div className="sh-detail">
          {shift.status === 'draft' && <p className="sh-note-box">{t('detail.draftHint')}</p>}
          {shift.status === 'cancelled' && <p className="sh-note-box">{t('detail.cancelledHint')}</p>}
          <dl className="sh-detail-meta">
            <dt>{t('form.date')}</dt>
            <dd className="capitalize">{date}</dd>
            <dt>{t('detail.duration')}</dt>
            <dd>
              {time} · {formatDuration(shiftDurationMinutes(shift.startMinute, shift.endMinute))}
              {shift.endsNextDay && ` (${t('detail.endsNextDay')})`}
            </dd>
            <dt>{t('detail.location')}</dt>
            <dd>
              {shift.location.name}
              {shift.location.address && <span className="block text-xs text-ink-faint dark:text-dark-ink-faint">{shift.location.address}</span>}
            </dd>
            <dt>{t('form.headcount')}</dt>
            <dd>{shift.headcount}</dd>
            {shift.notes && (
              <>
                <dt>{t('detail.notes')}</dt>
                <dd className="whitespace-pre-line">{shift.notes}</dd>
              </>
            )}
          </dl>

          <div>
            <p className="rules-label">{t('detail.people')}</p>
            {shift.assignments.length === 0 && <p className="to-hint">{t('detail.noPeople')}</p>}
            {shift.assignments.map((a) => {
              const state = shift.status === 'draft' ? 'draft' : a.status;
              return (
                <div key={a.id} className="sh-assignee">
                  <span className="avatar">{`${a.employee.firstName[0] ?? ''}${a.employee.lastName[0] ?? ''}`}</span>
                  <div className="sh-assignee-name">
                    {a.employee.firstName} {a.employee.lastName}
                    {a.status === 'declined' && a.declineReason && <small>{t('detail.reason', { reason: a.declineReason })}</small>}
                  </div>
                  <span className={`to-chip ${CHIP[state]}`}>{t(`status.${state === 'draft' ? 'notNotified' : state}`)}</span>
                  {editable && (
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={busy}
                      aria-label={t('detail.removeAria', { name: `${a.employee.firstName} ${a.employee.lastName}` })}
                      onClick={() => run(async () => onChanged(await api.unassignFromShift(token, shift.id, a.id)))}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              );
            })}
            {editable && !picking && (
              <button type="button" className="to-link mt-2" onClick={openPicker}>
                + {t('detail.addPeople')}
              </button>
            )}
          </div>

          {picking && (
            <div className="flex flex-col gap-2">
              <input
                id="shift-candidate-search"
                type="search"
                placeholder={t('detail.searchPeople')}
                aria-label={t('detail.searchPeople')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="sh-candidates">
                {candidates === null && <p className="to-hint p-3">…</p>}
                {visibleCandidates.map((c) => {
                  const blocked = c.blocks.length > 0;
                  const checked = selected.includes(c.id);
                  return (
                    <label key={c.id} className={`sh-candidate ${blocked ? 'sh-blocked' : ''}`}>
                      <input
                        type="checkbox"
                        disabled={blocked}
                        checked={checked}
                        onChange={() => {
                          setPendingWarnings(null);
                          setSelected((prev) => (checked ? prev.filter((x) => x !== c.id) : [...prev, c.id]));
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        {c.firstName} {c.lastName}
                        {c.blocks.map((b) => (
                          <span key={b} className="sh-issue sh-issue-block">
                            <AlertCircleIcon className="h-3.5 w-3.5 shrink-0" />
                            {t(`blocks.${b}`)}
                          </span>
                        ))}
                        {c.warnings.map((w) => (
                          <span key={w} className="sh-issue sh-issue-warn">
                            <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0" />
                            {t(`warnings.${w}`)}
                          </span>
                        ))}
                      </span>
                    </label>
                  );
                })}
              </div>
              {pendingWarnings && (
                <div className="sh-note-box">
                  <b>{t('detail.warningsTitle')}</b>
                  {Object.entries(pendingWarnings)
                    .filter(([, ws]) => ws.length > 0)
                    .map(([id, ws]) => (
                      <div key={id} className="mt-1">
                        {nameOf(id)}: {ws.map((w) => t(`warnings.${w}`)).join(' · ')}
                      </div>
                    ))}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" onClick={() => setPicking(false)}>
                  {t('form.cancel')}
                </button>
                <button type="button" className="btn-primary" disabled={busy || selected.length === 0} onClick={() => assign(!!pendingWarnings)}>
                  {pendingWarnings ? t('detail.assignAnyway') : t('detail.assign')}
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {confirm === 'delete' && (
        <ConfirmDialog
          title={t('detail.deleteTitle')}
          message={t('detail.deleteBody')}
          confirmLabel={t('detail.deleteDraft')}
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            run(async () => {
              await api.deleteShift(token, shift.id);
              onChanged(null, shift.id);
            });
          }}
        />
      )}
      {confirm === 'cancel' && (
        <ConfirmDialog
          title={t('detail.cancelTitle')}
          message={t('detail.cancelBody')}
          confirmLabel={t('detail.cancelShift')}
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setConfirm(null);
            run(async () => {
              onChanged(await api.cancelShift(token, shift.id));
              toast.success(t('detail.cancelled'));
            });
          }}
        />
      )}
    </>
  );
}
