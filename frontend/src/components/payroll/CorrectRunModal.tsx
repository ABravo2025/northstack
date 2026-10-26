import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { RunDetailEmployeeRow } from '../../api';
import Modal from '../common/Modal';
import { useToast } from '../common/ToastProvider';
import { PlusIcon, TrashIcon } from '../common/Icons';

// Payroll v2 (Alejandro, 2026-10-26): fixing a confirmed pay run, two ways, the person picks.
// - Void and reissue: reason required; the run's payslips are marked void (numbers kept, people
//   emailed) and a draft copy opens to fix and confirm again.
// - Supplement: a small run linked to this one with only the missing / extra adjustments.

type Kind = 'void' | 'supplement';
type LineType = 'bonus' | 'commission' | 'reimbursement' | 'deduction';
interface Line {
  employeeId: string;
  type: LineType;
  amount: string;
  label: string;
}

interface Props {
  token: string;
  runId: string;
  periodLabel: string;
  payslipsIssued: number;
  rows: RunDetailEmployeeRow[];
  onClose: () => void;
  onDone: (newRunId: string) => void;
}

const emptyLine = (employeeId = ''): Line => ({ employeeId, type: 'bonus', amount: '', label: '' });

export default function CorrectRunModal({ token, runId, periodLabel, payslipsIssued, rows, onClose, onDone }: Props) {
  const { t } = useTranslation('hr');
  const toast = useToast();
  const [kind, setKind] = useState<Kind | null>(null);
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Line[]>([emptyLine(rows.length === 1 ? rows[0].employeeId : '')]);
  const [saving, setSaving] = useState(false);

  const setLine = (i: number, patch: Partial<Line>) => setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const linesReady = lines.length > 0 && lines.every((l) => l.employeeId && Number.parseFloat(l.amount) > 0);
  const canSubmit = !saving && (kind === 'void' ? reason.trim().length >= 3 : kind === 'supplement' ? linesReady : false);
  const currencyOf = (employeeId: string) => rows.find((r) => r.employeeId === employeeId)?.currency ?? '';

  const submit = async () => {
    setSaving(true);
    try {
      if (kind === 'void') {
        const r = await api.voidPayrollRun(token, runId, reason.trim());
        toast.success(t('payroll.correct.voidedToast', { count: r.payslipsVoided }));
        onDone(r.reissueRunId);
      } else {
        const r = await api.createSupplementRun(
          token,
          runId,
          lines.map((l) => ({ employeeId: l.employeeId, type: l.type, amountCents: Math.round(Number.parseFloat(l.amount) * 100), label: l.label.trim() || undefined })),
        );
        toast.success(t('payroll.correct.supplementToast'));
        onDone(r.supplementRunId);
      }
    } catch (error) {
      toast.error((error as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={t('payroll.correct.title', { period: periodLabel })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('payroll.correct.cancel')}
          </button>
          {kind && (
            <button type="button" className={kind === 'void' ? 'btn-danger' : 'btn-primary'} disabled={!canSubmit} onClick={submit}>
              {kind === 'void' ? t('payroll.correct.voidSubmit') : t('payroll.correct.supplementSubmit')}
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div role="radiogroup" aria-label={t('payroll.correct.title', { period: periodLabel })} className="grid gap-2 sm:grid-cols-2">
          {(['supplement', 'void'] as const).map((k) => (
            <label
              key={k}
              className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 ${
                kind === k ? 'border-accent bg-accent/5 dark:border-brand-blue-light dark:bg-brand-blue-light/10' : 'border-line dark:border-dark-line'
              }`}
            >
              <span className="flex items-center gap-2 font-semibold">
                <input type="radio" name="correct-kind" checked={kind === k} onChange={() => setKind(k)} />
                {t(`payroll.correct.${k}.title`)}
              </span>
              <span className="text-ink-muted dark:text-dark-ink-muted">{t(`payroll.correct.${k}.body`, { count: payslipsIssued })}</span>
            </label>
          ))}
        </div>

        {kind === 'void' && (
          <div className="form-group">
            <label htmlFor="void-reason">{t('payroll.correct.reason')}</label>
            <textarea id="void-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('payroll.correct.reasonPlaceholder')} />
            <small className="text-ink-faint dark:text-dark-ink-faint">{t('payroll.correct.reasonHint')}</small>
          </div>
        )}

        {kind === 'supplement' && (
          <div className="flex flex-col gap-2">
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-line p-2 sm:grid-cols-[1fr_1fr_auto] dark:border-dark-line [&>*]:min-w-0 [&>input]:!w-full [&>select]:!w-full">
                <select aria-label={t('payroll.correct.person')} className="select-compact" value={l.employeeId} onChange={(e) => setLine(i, { employeeId: e.target.value })}>
                  <option value="">{t('payroll.correct.person')}</option>
                  {rows.map((r) => (
                    <option key={r.employeeId} value={r.employeeId}>
                      {r.employeeFirstName} {r.employeeLastName}
                    </option>
                  ))}
                </select>
                <select aria-label={t('payroll.correct.type')} className="select-compact" value={l.type} onChange={(e) => setLine(i, { type: e.target.value as LineType })}>
                  {(['bonus', 'commission', 'reimbursement', 'deduction'] as const).map((type) => (
                    <option key={type} value={type}>
                      {t(`payroll.correct.types.${type}`)}
                    </option>
                  ))}
                </select>
                <button type="button" className="icon-btn self-center sm:row-span-2" aria-label={t('payroll.correct.removeLine')} disabled={lines.length === 1} onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>
                  <TrashIcon className="h-4 w-4" />
                </button>
                <input
                  aria-label={t('payroll.correct.amount', { currency: currencyOf(l.employeeId) })}
                  className="select-compact"
                  inputMode="decimal"
                  placeholder={currencyOf(l.employeeId) || t('payroll.correct.amountShort')}
                  value={l.amount}
                  onChange={(e) => setLine(i, { amount: e.target.value.replace(',', '.') })}
                />
                <input aria-label={t('payroll.correct.label')} className="select-compact" maxLength={120} placeholder={t('payroll.correct.label')} value={l.label} onChange={(e) => setLine(i, { label: e.target.value })} />
              </div>
            ))}
            <button type="button" className="to-link inline-flex items-center gap-1 self-start text-sm" onClick={() => setLines((prev) => [...prev, emptyLine()])}>
              <PlusIcon className="h-3.5 w-3.5" />
              {t('payroll.correct.addLine')}
            </button>
            <small className="text-ink-faint dark:text-dark-ink-faint">{t('payroll.correct.supplementHint')}</small>
          </div>
        )}
      </div>
    </Modal>
  );
}
