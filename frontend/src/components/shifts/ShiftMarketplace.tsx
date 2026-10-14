import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type AvailableShift, type ShiftRequest } from '../../api';
import { useToast } from '../common/ToastProvider';
import { REQUEST_CHIP, ShiftRequestText, useShiftLabel } from './ShiftRequestText';

interface ShiftMarketplaceProps {
  token: string;
  // Bumped by the page after a give/swap so the lists refresh.
  version: number;
  onChanged: () => void;
}

// My shifts → "Available to take" and "My requests" (spec-shifts-fase2.md, block A): free places on
// open shifts and shifts colleagues are handing over, each with the rules this person would hit;
// and every claim, hand-over and swap they're part of, with cancel / accept / decline.
export default function ShiftMarketplace({ token, version, onChanged }: ShiftMarketplaceProps) {
  const { t } = useTranslation('shifts');
  const toast = useToast();
  const label = useShiftLabel();
  const [available, setAvailable] = useState<AvailableShift[] | null>(null);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .listAvailableShifts(token)
      .then((r) => setAvailable(r.items))
      .catch(() => setAvailable([]));
    api
      .listShiftRequests(token, 'mine')
      .then((r) => {
        setMe(r.employeeId ?? null);
        setRequests(r.requests);
      })
      .catch(() => setRequests([]));
  }, [token]);

  useEffect(() => {
    load();
  }, [load, version]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      load();
      onChanged();
    } catch (error) {
      toast.error(t('requests.failed', { message: (error as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const take = async (item: AvailableShift) => {
    setBusy(true);
    try {
      const r = item.kind === 'open' ? await api.claimShift(token, item.shift.id) : await api.takeShift(token, item.request!.id);
      toast.success(r.status === 'approved' ? t('requests.taken') : t('requests.sentForApproval'));
      load();
      onChanged();
    } catch (error) {
      toast.error(t('requests.failed', { message: (error as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const activeOrRecent = requests.filter((r) => ['open', 'pending_peer', 'pending_manager'].includes(r.status) || Date.now() - new Date(r.decidedAt ?? r.createdAt).getTime() < 7 * 86_400_000);

  return (
    <>
      <section className="card rules-card">
        <h3 className="card-title">{t('requests.availableTitle')}</h3>
        <p className="rules-lead">{t('requests.availableLead')}</p>
        {available === null ? null : available.length === 0 ? (
          <p className="to-hint">{t('requests.availableEmpty')}</p>
        ) : (
          <div className="flex flex-col">
            {available.map((item) => {
              const blocked = item.blocks.length > 0;
              return (
                <div key={`${item.kind}:${item.request?.id ?? item.shift.id}`} className="sh-assignee items-start">
                  <div className="sh-assignee-name">
                    <div className="font-semibold">{label(item.shift)}</div>
                    <small>
                      {[
                        item.shift.position,
                        item.kind === 'open'
                          ? t('requests.places', { free: item.shift.headcount - item.shift.filled, total: item.shift.headcount })
                          : t('requests.handedOverBy', { name: `${item.request!.requestedBy.firstName} ${item.request!.requestedBy.lastName}` }),
                        item.request?.reason,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </small>
                    {blocked && <small className="text-red-700 dark:text-red-300">{item.blocks.map((b) => t(`blocks.${b}`)).join(' · ')}</small>}
                    {!blocked && item.warnings.length > 0 && (
                      <small className="text-amber-700 dark:text-amber-300">
                        {t('requests.needsApproval')}: {item.warnings.map((w) => t(`warnings.${w}`)).join(' · ')}
                      </small>
                    )}
                  </div>
                  <button type="button" className="btn-primary" disabled={busy || blocked} onClick={() => take(item)}>
                    {t('requests.take')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {activeOrRecent.length > 0 && (
        <section className="card rules-card">
          <h3 className="card-title">{t('requests.mineTitle')}</h3>
          <div className="flex flex-col">
            {activeOrRecent.map((r) => {
              const iAsked = r.requestedBy.id === me;
              const mustAnswer = r.status === 'pending_peer' && r.targetEmployee?.id === me;
              const canCancel = iAsked && ['open', 'pending_peer', 'pending_manager'].includes(r.status);
              return (
                <div key={r.id} className="sh-assignee items-start">
                  <div className="sh-assignee-name">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`to-chip ${REQUEST_CHIP[r.status]}`}>{t(`requests.status.${r.status}`)}</span>
                    </div>
                    <small className="mt-1">
                      <ShiftRequestText request={r} />
                    </small>
                    {r.reason && <small>{t('requests.reason', { reason: r.reason })}</small>}
                    {r.decisionNote && <small>{t('requests.note', { note: r.decisionNote })}</small>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {mustAnswer && (
                      <>
                        <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => api.answerSwap(token, r.id, false), t('requests.answered'))}>
                          {t('requests.decline')}
                        </button>
                        <button type="button" className="btn-primary" disabled={busy} onClick={() => run(() => api.answerSwap(token, r.id, true), t('requests.answered'))}>
                          {t('requests.accept')}
                        </button>
                      </>
                    )}
                    {canCancel && (
                      <button type="button" className="to-link" disabled={busy} onClick={() => run(() => api.cancelShiftRequest(token, r.id), t('requests.cancelled'))}>
                        {t('requests.cancel')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
