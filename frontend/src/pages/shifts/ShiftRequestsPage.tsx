import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type ShiftRequest } from '../../api';
import { useToast } from '../../components/common/ToastProvider';
import Modal from '../../components/common/Modal';
import TableBody from '../../components/common/TableBody';
import TableSkeleton from '../../components/common/TableSkeleton';
import { CopyIcon } from '../../components/common/Icons';
import { REQUEST_CHIP, ShiftRequestText } from '../../components/shifts/ShiftRequestText';

interface ShiftRequestsPageProps {
  token: string;
}

// Shifts → Requests (spec-shifts-fase2.md, block A): claims, hand-overs and swaps waiting for a
// scheduler's approval at the locations this person schedules, plus the last 30 days of decisions.
export default function ShiftRequestsPage({ token }: ShiftRequestsPageProps) {
  const { t, i18n } = useTranslation('shifts');
  const toast = useToast();
  const [rows, setRows] = useState<ShiftRequest[] | null>(null);
  const [canManage, setCanManage] = useState(true);
  const [declining, setDeclining] = useState<ShiftRequest | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .listShiftRequests(token, 'manage')
      .then((r) => {
        setCanManage(r.canManage !== false);
        setRows(r.requests);
      })
      .catch((error) => toast.error(t('requests.failed', { message: (error as Error).message })));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const decide = async (r: ShiftRequest, approve: boolean, why?: string) => {
    setBusy(true);
    try {
      await api.decideShiftRequest(token, r.id, approve, why);
      toast.success(approve ? t('requests.approvedToast') : t('requests.declinedToast'));
      setDeclining(null);
      await load();
    } catch (error) {
      toast.error(t('requests.failed', { message: (error as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  const when = (iso: string) => new Date(iso).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short' });
  const pending = (rows ?? []).filter((r) => r.status === 'pending_manager');
  const decided = (rows ?? []).filter((r) => r.status !== 'pending_manager');

  return (
    <div className="container sh-page">
      <div>
        <h2 className="to-title">{t('requests.title')}</h2>
        <p className="to-subtitle">{t('requests.subtitle')}</p>
      </div>

      {!canManage ? (
        <p className="sh-note-box">{t('requests.notScheduler')}</p>
      ) : rows === null ? (
        <TableSkeleton />
      ) : (
        <>
          <div className="full-table-wrap">
            <table className="table full-table !mt-0 to-table">
              <thead>
                <tr>
                  <th>{t('requests.col.what')}</th>
                  <th>{t('requests.col.warnings')}</th>
                  <th>{t('requests.col.asked')}</th>
                  <th aria-label={t('requests.col.actions')} />
                </tr>
              </thead>
              <TableBody colSpan={4} isEmpty={pending.length === 0} empty={{ icon: <CopyIcon />, title: t('requests.emptyPending') }}>
                {pending.map((r) => (
                  <tr key={r.id}>
                    <td className="!whitespace-normal">
                      <div className="font-medium">
                        <ShiftRequestText request={r} />
                      </div>
                      {r.reason && <small className="text-ink-muted dark:text-dark-ink-muted">{t('requests.reason', { reason: r.reason })}</small>}
                    </td>
                    <td className={`!whitespace-normal ${r.warnings.length ? 'text-amber-700 dark:text-amber-300' : ''}`}>{r.warnings.length ? r.warnings.map((w) => t(`warnings.${w}`)).join(' · ') : '—'}</td>
                    <td className="whitespace-nowrap">{when(r.createdAt)}</td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busy}
                          onClick={() => {
                            setNote('');
                            setDeclining(r);
                          }}
                        >
                          {t('requests.decline')}
                        </button>
                        <button type="button" className="btn-primary" disabled={busy} onClick={() => decide(r, true)}>
                          {t('requests.approve')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </TableBody>
            </table>
          </div>

          {decided.length > 0 && (
            <section className="card rules-card">
              <h3 className="card-title">{t('requests.recentTitle')}</h3>
              <div className="flex flex-col">
                {decided.map((r) => (
                  <div key={r.id} className="sh-assignee items-start">
                    <div className="sh-assignee-name">
                      <span className={`to-chip ${REQUEST_CHIP[r.status]} w-fit`}>{t(`requests.status.${r.status}`)}</span>
                      <small className="mt-1">
                        <ShiftRequestText request={r} />
                      </small>
                      {r.decisionNote && <small>{t('requests.note', { note: r.decisionNote })}</small>}
                    </div>
                    <small className="whitespace-nowrap text-ink-faint dark:text-dark-ink-faint">{r.decidedAt ? when(r.decidedAt) : ''}</small>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <Modal
        open={declining !== null}
        title={t('requests.declineTitle')}
        onClose={() => setDeclining(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDeclining(null)}>
              {t('form.cancel')}
            </button>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => declining && decide(declining, false, note.trim() || undefined)}>
              {t('requests.decline')}
            </button>
          </>
        }
      >
        {declining && (
          <div className="flex flex-col gap-3">
            <p className="m-0">
              <ShiftRequestText request={declining} />
            </p>
            {declining.type === 'give' && <p className="rules-hint m-0">{t('requests.declineGiveHint')}</p>}
            <div className="form-group !mb-0">
              <label htmlFor="decline-note">{t('requests.noteLabel')}</label>
              <input id="decline-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} autoFocus />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
