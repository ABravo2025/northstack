import { useEffect, useState } from 'react';
import { api, type EmployeeCompensation } from '../../api';
import { useToast } from '../common/ToastProvider';
import Modal from '../common/Modal';
import { formatMoney } from '../../lib/currencies';

interface CompensationConfirmationBannerProps {
  token: string;
}

const CADENCE_LABELS: Record<string, string> = { weekly: 'Weekly', semimonthly: 'Semimonthly', monthly: 'Monthly' };

// Unidad 5.3 — shown on Overview to whoever has a first-ever compensation
// contract still unconfirmed. Until they confirm, they're excluded from
// payroll runs (Unidad 6) and can't submit a Time Off request
// (timeOffRequestService.ts's cross-module check).
export default function CompensationConfirmationBanner({ token }: CompensationConfirmationBannerProps) {
  const toast = useToast();
  const [pending, setPending] = useState<EmployeeCompensation | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    api
      .getPendingCompensationConfirmation(token)
      .then(setPending)
      .catch(() => {
        // Non-critical — the banner just won't show if this fails.
      });
  }, [token]);

  if (!pending) return null;

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await api.confirmEmployeeCompensation(token, pending.employeeId, pending.id);
      toast.success('Contract confirmed.');
      setModalOpen(false);
      setPending(null);
    } catch (error) {
      toast.error('Failed to confirm: ' + (error as Error).message);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 rounded-md bg-amber-100 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-400">
        <span>You have a compensation contract pending confirmation.</span>
        <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => setModalOpen(true)}>
          Review &amp; Confirm
        </button>
      </div>

      <Modal
        open={modalOpen}
        title="Confirm your compensation"
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)} disabled={confirming}>
              Not now
            </button>
            <button type="button" className="btn-primary" onClick={handleConfirm} disabled={confirming}>
              {confirming ? 'Confirming…' : 'Confirm'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label>Type</label>
          <p className="text-sm text-ink">{pending.compensationType === 'hourly' ? 'Hourly' : 'Fixed'}</p>
        </div>
        <div className="form-group">
          <label>Rate</label>
          <p className="text-sm text-ink">
            {formatMoney(pending.rateCents, pending.currency)}
            {pending.compensationType === 'hourly' ? ' / hour' : ''}
          </p>
        </div>
        <div className="form-group">
          <label>Pay frequency</label>
          <p className="text-sm text-ink">
            {pending.payFrequency.name} ({CADENCE_LABELS[pending.payFrequency.cadence] ?? pending.payFrequency.cadence})
          </p>
        </div>
        <div className="form-group">
          <label>Effective from</label>
          <p className="text-sm text-ink">{pending.effectiveFrom.slice(0, 10)}</p>
        </div>
      </Modal>
    </>
  );
}
