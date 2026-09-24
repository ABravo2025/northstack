import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { PayrollEntryType } from '../../api';
import { useToast } from '../common/ToastProvider';
import Modal from '../common/Modal';
import Field from '../common/Field';
import SearchableSelect from '../common/SearchableSelect';
import { TrashIcon } from '../common/Icons';
import { CURRENCY_CODES } from '../../lib/currencies';

type AdjustmentType = Exclude<PayrollEntryType, 'base'>;

interface AdditionalLine {
  type: AdjustmentType;
  amount: string;
  label: string;
}

interface TerminateEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  employee: { id: string; firstName: string; lastName: string; userId?: string | null };
  employees: any[]; // the unscoped directory (api.listEmployeeDirectory, Custom Roles Fase E), for
  // reassignment pickers — any direct report must be reassignable to anyone company-wide,
  // regardless of the acting user's own HR scope (same array EmployeeOverviewPanel already gets)
  canIncludeFinalPayment: boolean; // Payroll is owner-only elsewhere in the app — mirrored here
  defaultCurrency?: string;
  onTerminated: () => void;
}

// Local calendar date, not `toISOString().slice(0, 10)` — the latter is the *UTC* date, which for
// a negative-UTC-offset user (e.g. Argentina, UTC-3) between 9pm and midnight local time has
// already rolled to tomorrow, defaulting "Last day" to the wrong date and mislabeling the
// immediate-vs-scheduled copy below before the request even reaches the backend.
function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Standalone modal, not folded into EmployeeOverviewPanel directly — same instinct as
// PayslipPreviewModal/NewTaskFromCalendarPopover: a self-contained multi-field flow gets its own
// component rather than growing an already-large panel further.
export default function TerminateEmployeeModal({
  open,
  onClose,
  token,
  employee,
  employees,
  canIncludeFinalPayment,
  defaultCurrency,
  onTerminated,
}: TerminateEmployeeModalProps) {
  const { t } = useTranslation('hr');
  const toast = useToast();
  // Backend enum codes (bonus/commission/reimbursement/deduction) as keys, computed inside the
  // component (not a module-level const) so it recomputes with the active language on every
  // render — shares its copy with payroll.common.entryTypeLabels (payslip/run-detail/PayrollPage
  // all draw from the same translated set).
  const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentType, string> = {
    bonus: t('payroll.common.entryTypeLabels.bonus'),
    commission: t('payroll.common.entryTypeLabels.commission'),
    reimbursement: t('payroll.common.entryTypeLabels.reimbursement'),
    deduction: t('payroll.common.entryTypeLabels.deduction'),
  };
  const [lastDay, setLastDay] = useState(todayIso());
  const [directReports, setDirectReports] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [reassignments, setReassignments] = useState<Record<string, string>>({}); // reportId -> newManagerId ('' = none)
  const [revokeAccess, setRevokeAccess] = useState(false);
  const [includeFinalPayment, setIncludeFinalPayment] = useState(false);
  const [finalAmount, setFinalAmount] = useState('');
  const [finalCurrency, setFinalCurrency] = useState(defaultCurrency || 'USD');
  const [finalPaymentDate, setFinalPaymentDate] = useState(todayIso());
  const [finalLabel, setFinalLabel] = useState(t('terminateModal.finalPaymentDefaultLabel'));
  const [additionalLines, setAdditionalLines] = useState<AdditionalLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLastDay(todayIso());
    setReassignments({});
    setRevokeAccess(false);
    setIncludeFinalPayment(false);
    setFinalAmount('');
    setFinalCurrency(defaultCurrency || 'USD');
    setFinalPaymentDate(todayIso());
    setFinalLabel(t('terminateModal.finalPaymentDefaultLabel'));
    setAdditionalLines([]);
    api
      .getTerminationOptions(token, employee.id)
      .then((options) => setDirectReports(options.directReports))
      .catch(() => setDirectReports([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee.id]);

  const addLine = () => setAdditionalLines((prev) => [...prev, { type: 'bonus', amount: '', label: '' }]);
  const removeLine = (index: number) => setAdditionalLines((prev) => prev.filter((_, i) => i !== index));
  const updateLine = (index: number, patch: Partial<AdditionalLine>) =>
    setAdditionalLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));

  const isFuture = lastDay > todayIso();
  const managerOptions = [
    { value: '', label: t('common.noManagerPlaceholder') },
    ...employees.filter((e) => e.id !== employee.id).map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })),
  ];

  const handleSubmit = async () => {
    // Parsed once per field here and reused for the payload below (instead of recomputing the
    // identical Math.round(parseFloat(...) * 100) a second time) — the validated amount and the
    // submitted amount are now provably the same value, not two separately-typed expressions that
    // happen to agree today.
    let finalPayment: Parameters<typeof api.createTermination>[2]['finalPayment'];
    if (includeFinalPayment) {
      const cents = Math.round(parseFloat(finalAmount) * 100);
      if (!finalAmount || Number.isNaN(cents) || cents <= 0) {
        toast.error(t('terminateModal.toasts.invalidFinalAmount'));
        return;
      }
      const lineCentsByIndex: number[] = [];
      for (const line of additionalLines) {
        const lineCents = Math.round(parseFloat(line.amount) * 100);
        if (!line.amount || Number.isNaN(lineCents) || lineCents <= 0) {
          toast.error(t('terminateModal.toasts.invalidLineAmount'));
          return;
        }
        lineCentsByIndex.push(lineCents);
      }
      finalPayment = {
        amountCents: cents,
        currency: finalCurrency,
        paymentDate: finalPaymentDate,
        label: finalLabel || null,
        additionalLines: additionalLines.map((line, i) => ({
          type: line.type,
          amountCents: line.type === 'deduction' ? -Math.abs(lineCentsByIndex[i]) : lineCentsByIndex[i],
          label: line.label || null,
        })),
      };
    }

    setSubmitting(true);
    try {
      const result = await api.createTermination(token, employee.id, {
        terminationDate: lastDay,
        revokeAccess,
        reassignments: directReports.map((report) => ({
          reportEmployeeId: report.id,
          newManagerId: reassignments[report.id] || null,
        })),
        finalPayment,
      });
      toast.success(
        result.executedNow
          ? t('terminateModal.toasts.terminatedSuccess')
          : t('terminateModal.toasts.terminationScheduled', { date: lastDay }),
      );
      onTerminated();
      onClose();
    } catch (error) {
      toast.error(t('terminateModal.toasts.terminateFailed', { error: (error as Error).message }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('terminateModal.title', { name: `${employee.firstName} ${employee.lastName}` })}
      onClose={onClose}
      wide
      footer={
        <button type="button" className="btn-danger btn-md" onClick={handleSubmit} disabled={submitting}>
          {submitting ? t('terminateModal.saving') : isFuture ? t('terminateModal.scheduleTermination') : t('terminateModal.terminateNow')}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="alert alert-info">{t('terminateModal.alertInfo', { name: employee.firstName })}</div>

        <Field label={t('terminateModal.fields.lastDay')}>
          <input type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
        </Field>
        <p className="text-xs text-ink-faint">
          {isFuture
            ? t('terminateModal.effectFuture', { date: lastDay })
            : t('terminateModal.effectImmediate')}
        </p>

        {directReports.length > 0 && (
          <div className="field-group-body" style={{ padding: 0 }}>
            <p className="text-sm font-medium mb-1">
              {t('terminateModal.directReportsCount', { count: directReports.length })}
            </p>
            <p className="text-xs text-ink-faint mb-2">
              {t('terminateModal.directReportsHelp', { name: employee.firstName })}
            </p>
            <div className="flex flex-col gap-2">
              {directReports.map((report) => (
                <div key={report.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm">
                    {report.firstName} {report.lastName}
                  </span>
                  <div style={{ minWidth: 220 }}>
                    <SearchableSelect
                      options={managerOptions}
                      value={reassignments[report.id] || ''}
                      onChange={(v) => setReassignments((prev) => ({ ...prev, [report.id]: v }))}
                      placeholder={t('common.noManagerPlaceholder')}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {employee.userId && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={revokeAccess} onChange={(e) => setRevokeAccess(e.target.checked)} />
            {t('terminateModal.revokeAccessLabel')}
          </label>
        )}

        {canIncludeFinalPayment && (
          <div>
            <label className="flex items-center gap-2 text-sm mb-2">
              <input
                type="checkbox"
                checked={includeFinalPayment}
                onChange={(e) => setIncludeFinalPayment(e.target.checked)}
              />
              {t('terminateModal.includeFinalPaymentLabel')}
            </label>
            {includeFinalPayment && (
              <div className="flex flex-col gap-3 pl-6">
                <div className="flex gap-2">
                  <Field label={t('terminateModal.fields.amount')}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={finalAmount}
                      onChange={(e) => setFinalAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label={t('terminateModal.fields.currency')}>
                    <select value={finalCurrency} onChange={(e) => setFinalCurrency(e.target.value)}>
                      {CURRENCY_CODES.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label={t('terminateModal.fields.paymentDate')}>
                  <input type="date" value={finalPaymentDate} onChange={(e) => setFinalPaymentDate(e.target.value)} />
                </Field>
                <Field label={t('terminateModal.fields.label')}>
                  <input type="text" value={finalLabel} onChange={(e) => setFinalLabel(e.target.value)} />
                </Field>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-ink-muted">
                      {t('terminateModal.additionalPaymentsNote')}
                    </span>
                    <button type="button" className="btn-secondary btn-sm" onClick={addLine}>
                      {t('terminateModal.addLine')}
                    </button>
                  </div>
                  {additionalLines.map((line, index) => (
                    <div key={index} className="flex items-end gap-2">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>{t('terminateModal.fields.type')}</label>
                        <select
                          value={line.type}
                          onChange={(e) => updateLine(index, { type: e.target.value as AdjustmentType })}
                        >
                          {(Object.keys(ADJUSTMENT_TYPE_LABELS) as AdjustmentType[]).map((type) => (
                            <option key={type} value={type}>
                              {ADJUSTMENT_TYPE_LABELS[type]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>{t('terminateModal.fields.amount')}</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          style={{ width: 100 }}
                          value={line.amount}
                          onChange={(e) => updateLine(index, { amount: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>{t('terminateModal.fields.note')}</label>
                        <input type="text" value={line.label} onChange={(e) => updateLine(index, { label: e.target.value })} />
                      </div>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => removeLine(index)}
                        aria-label={t('terminateModal.removeLineAriaLabel')}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
