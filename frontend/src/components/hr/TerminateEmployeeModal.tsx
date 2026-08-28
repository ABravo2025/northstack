import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useToast } from '../common/ToastProvider';
import Modal from '../common/Modal';
import Field from '../common/Field';
import SearchableSelect from '../common/SearchableSelect';
import { CURRENCY_CODES } from '../../lib/currencies';

interface TerminateEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  employee: { id: string; firstName: string; lastName: string; userId?: string | null };
  employees: any[]; // full tenant roster, for reassignment pickers (same shape EmployeeOverviewPanel already gets)
  canIncludeFinalPayment: boolean; // Payroll is owner-only elsewhere in the app — mirrored here
  defaultCurrency?: string;
  onTerminated: () => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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
  const toast = useToast();
  const [lastDay, setLastDay] = useState(todayIso());
  const [directReports, setDirectReports] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [reassignments, setReassignments] = useState<Record<string, string>>({}); // reportId -> newManagerId ('' = none)
  const [revokeAccess, setRevokeAccess] = useState(false);
  const [includeFinalPayment, setIncludeFinalPayment] = useState(false);
  const [finalAmount, setFinalAmount] = useState('');
  const [finalCurrency, setFinalCurrency] = useState(defaultCurrency || 'USD');
  const [finalPaymentDate, setFinalPaymentDate] = useState(todayIso());
  const [finalLabel, setFinalLabel] = useState('Final payment');
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
    setFinalLabel('Final payment');
    api
      .getTerminationOptions(token, employee.id)
      .then((options) => setDirectReports(options.directReports))
      .catch(() => setDirectReports([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee.id]);

  const isFuture = lastDay > todayIso();
  const managerOptions = [
    { value: '', label: '-- no manager --' },
    ...employees.filter((e) => e.id !== employee.id).map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName}` })),
  ];

  const handleSubmit = async () => {
    if (includeFinalPayment) {
      const cents = Math.round(parseFloat(finalAmount) * 100);
      if (!finalAmount || Number.isNaN(cents) || cents <= 0) {
        toast.error('Enter a valid final payment amount.');
        return;
      }
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
        finalPayment: includeFinalPayment
          ? {
              amountCents: Math.round(parseFloat(finalAmount) * 100),
              currency: finalCurrency,
              paymentDate: finalPaymentDate,
              label: finalLabel || null,
            }
          : undefined,
      });
      toast.success(result.executedNow ? 'Employee terminated.' : `Termination scheduled for ${lastDay}.`);
      onTerminated();
      onClose();
    } catch (error) {
      toast.error('Failed to terminate employee: ' + (error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Terminate ${employee.firstName} ${employee.lastName}`}
      onClose={onClose}
      footer={
        <button type="button" className="btn-danger btn-md" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Saving…' : isFuture ? 'Schedule termination' : 'Terminate now'}
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Last day">
          <input type="date" value={lastDay} onChange={(e) => setLastDay(e.target.value)} />
        </Field>
        <p className="text-xs text-ink-faint">
          {isFuture
            ? `This will take effect on ${lastDay}.`
            : 'This will take effect immediately once confirmed.'}
        </p>

        {directReports.length > 0 && (
          <div className="field-group-body" style={{ padding: 0 }}>
            <p className="text-sm font-medium mb-1">
              Direct reports ({directReports.length})
            </p>
            <p className="text-xs text-ink-faint mb-2">
              These people report to {employee.firstName}. Optionally reassign each one to a new
              manager — anyone left unassigned will have no manager after this takes effect.
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
                      placeholder="-- no manager --"
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
            Also revoke their access to Northstack
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
              Include a final payment
            </label>
            {includeFinalPayment && (
              <div className="flex flex-col gap-3 pl-6">
                <div className="flex gap-2">
                  <Field label="Amount">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={finalAmount}
                      onChange={(e) => setFinalAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </Field>
                  <Field label="Currency">
                    <select value={finalCurrency} onChange={(e) => setFinalCurrency(e.target.value)}>
                      {CURRENCY_CODES.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Payment date">
                  <input type="date" value={finalPaymentDate} onChange={(e) => setFinalPaymentDate(e.target.value)} />
                </Field>
                <Field label="Label">
                  <input type="text" value={finalLabel} onChange={(e) => setFinalLabel(e.target.value)} />
                </Field>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
