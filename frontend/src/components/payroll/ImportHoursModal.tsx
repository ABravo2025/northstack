import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { ImportHoursResult } from '../../api';
import Modal from '../common/Modal';
import { useToast } from '../common/ToastProvider';

interface ImportHoursModalProps {
  token: string;
  runId: string;
  cadence?: 'weekly' | 'semimonthly' | 'monthly';
  onClose: () => void;
  onImported: () => void;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

// The period a run most likely pays, from its frequency: the previous calendar month, the previous
// half month, or the previous Monday–Sunday week. Only a starting point — it can be changed.
export function defaultPeriod(cadence: ImportHoursModalProps['cadence'], today = new Date()): { from: string; to: string } {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const d = today.getUTCDate();
  if (cadence === 'weekly') {
    const dow = (today.getUTCDay() + 6) % 7; // Monday = 0
    const lastMonday = new Date(Date.UTC(y, m, d - dow - 7));
    return { from: iso(lastMonday), to: iso(new Date(Date.UTC(y, m, d - dow - 1))) };
  }
  if (cadence === 'semimonthly') {
    if (d > 15) return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m, 15))) };
    return { from: iso(new Date(Date.UTC(y, m - 1, 16))), to: iso(new Date(Date.UTC(y, m, 0))) };
  }
  return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
}

// Payroll run → "Bring approved hours" (Timesheet → Payroll, 2026-10-21): fills each hourly person's
// hours with their approved timesheet weeks in the period, then shows who still has weeks waiting
// for approval (those hours are not included).
export default function ImportHoursModal({ token, runId, cadence, onClose, onImported }: ImportHoursModalProps) {
  const { t, i18n } = useTranslation('hr');
  const toast = useToast();
  const initial = defaultPeriod(cadence);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [result, setResult] = useState<ImportHoursResult | null>(null);
  const [busy, setBusy] = useState(false);

  const day = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.importPayrollHours(token, runId, from, to);
      setResult(r);
      onImported();
      toast.success(t('payroll.runDetail.importHours.done', { count: r.updated.length }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={t('payroll.runDetail.importHours.title')}
      onClose={onClose}
      footer={
        result ? (
          <button type="button" className="btn-primary" onClick={onClose}>
            {t('payroll.runDetail.importHours.close')}
          </button>
        ) : (
          <>
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('payroll.runDetail.importHours.cancel')}
            </button>
            <button type="button" className="btn-primary" disabled={busy || !from || !to} onClick={run}>
              {busy ? t('payroll.runDetail.importHours.bringing') : t('payroll.runDetail.importHours.bring')}
            </button>
          </>
        )
      }
    >
      {!result ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm">{t('payroll.runDetail.importHours.body')}</p>
          <div className="flex flex-wrap gap-3">
            <div className="form-group !mb-0">
              <label htmlFor="import-hours-from">{t('payroll.runDetail.importHours.from')}</label>
              <input id="import-hours-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="form-group !mb-0">
              <label htmlFor="import-hours-to">{t('payroll.runDetail.importHours.to')}</label>
              <input id="import-hours-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <p className="rules-hint m-0">{t('payroll.runDetail.importHours.hint')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm">{t('payroll.runDetail.importHours.summary', { from: day(result.from), to: day(result.to) })}</p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {result.updated.map((u) => (
              <li key={u.employeeId} className="flex justify-between gap-3">
                <span>{u.name}</span>
                <span className="font-semibold tabular-nums">{t('payroll.runDetail.importHours.hours', { hours: u.hours.toLocaleString(i18n.language.startsWith('es') ? 'es-AR' : 'en-US') })}</span>
              </li>
            ))}
          </ul>
          {result.pending.length > 0 && (
            <div className="alert alert-warning m-0 flex flex-col gap-1 text-sm">
              <strong>{t('payroll.runDetail.importHours.pendingTitle')}</strong>
              {result.pending.map((p) => (
                <span key={p.employeeId}>
                  {p.name}: {p.weeks.map((w) => t('payroll.runDetail.importHours.week', { date: day(w.weekStart), status: t(`payroll.runDetail.importHours.status.${w.status}`) })).join(', ')}
                </span>
              ))}
              <span className="text-xs">{t('payroll.runDetail.importHours.pendingHint')}</span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
