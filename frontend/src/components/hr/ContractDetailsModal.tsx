import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { EmployeeContractEntry } from '../../api';
import Modal from '../common/Modal';
import StatusChip from '../common/StatusChip';
import PayslipPreviewModal from '../payroll/PayslipPreviewModal';
import { useToast } from '../common/ToastProvider';
import { formatMoney } from '../../lib/currencies';
import { CONTRACT_GROUP_COLORS } from './contractGroups';

interface ContractDetailsModalProps {
  token: string;
  employeeId: string;
  contract: EmployeeContractEntry;
  onClose: () => void;
}

// One contract from the Contracts tab (2026-10-26): its terms, signature evidence, its own PDF, and
// "Resend" — only for the current contract, the one the resend endpoint acts on, and never for a
// raise/reassignment (those are never signed, so there's nothing to resend).
export default function ContractDetailsModal({ token, employeeId, contract, onClose }: ContractDetailsModalProps) {
  const { t } = useTranslation('hr');
  const toast = useToast();
  const [pdfOpen, setPdfOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const canResend = contract.isCurrent && contract.signature !== 'not_required' && contract.hasContractPdf;
  const dt = (iso: string) => iso.replace('T', ' ').slice(0, 16);

  const handleResend = async () => {
    setResending(true);
    try {
      await api.resendContract(token, employeeId);
      toast.success(t('employeeOverview.toasts.resendContractSuccess'));
    } catch (error) {
      toast.error(t('employeeOverview.toasts.resendContractFailed', { error: (error as Error).message }));
    } finally {
      setResending(false);
    }
  };

  const row = (label: string, value: React.ReactNode, full = false) => (
    <div className={`overview-field ${full ? 'overview-field-full' : ''}`}>
      <span className="overview-field-label">{label}</span>
      <span className="overview-field-value">{value}</span>
    </div>
  );

  return (
    <>
      <Modal
        open
        onClose={onClose}
        wide
        title={contract.jobTitle}
        footer={
          <div className="flex justify-end gap-2">
            {canResend && (
              <button type="button" className="btn-secondary" onClick={handleResend} disabled={resending}>
                {resending ? t('employeeOverview.resending') : t('employeeOverview.resendContract')}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={() => setPdfOpen(true)} disabled={!contract.hasContractPdf}>
              {t('employeeOverview.viewContract')}
            </button>
          </div>
        }
      >
        <div className="flex items-center gap-1.5 mb-3">
          <StatusChip color={CONTRACT_GROUP_COLORS[contract.group]} label={t(`employeeOverview.contracts.groups.${contract.group}`)} />
          <StatusChip color="#6b7280" label={t(`employeeOverview.contracts.signature.${contract.signature}`)} />
        </div>

        <div className="field-group">
          <h4 className="field-group-title">{t('employeeOverview.contracts.termsSection')}</h4>
          <div className="field-group-body">
            {row(t('employeeOverview.compensation.typeLabel'), contract.compensationType === 'hourly' ? t('payroll.common.compensationTypeLabels.hourly') : t('payroll.common.compensationTypeLabels.fixed'))}
            {row(t('employeeOverview.compensation.rateLabel'), formatMoney(contract.rateCents, contract.currency))}
            {row(t('employeeOverview.compensation.payFrequencyLabel'), contract.payFrequencyName)}
            {row(t('employeeOverview.contracts.columns.period'), `${contract.effectiveFrom.slice(0, 10)} → ${contract.effectiveTo ? contract.effectiveTo.slice(0, 10) : t('employeeOverview.contracts.openEnded')}`)}
            {row(t('employeeOverview.compensation.roleDescriptionLabel'), contract.description, true)}
            {contract.note && row(t('employeeOverview.compensation.noteLabel'), contract.note, true)}
          </div>
        </div>

        <div className="field-group">
          <h4 className="field-group-title">{t('employeeOverview.contracts.evidenceSection')}</h4>
          <div className="field-group-body">
            {row(t('employeeOverview.contracts.createdBy'), `${contract.createdByName ?? '—'} · ${dt(contract.createdAt)} UTC`, true)}
            {contract.signature === 'not_required' ? (
              row(t('employeeOverview.contracts.signedOn'), t('employeeOverview.contracts.signatureNotRequired'), true)
            ) : (
              <>
                {row(t('employeeOverview.contracts.signedOn'), contract.confirmedAt ? `${dt(contract.confirmedAt)} UTC` : t(`employeeOverview.contracts.signature.${contract.signature}`))}
                {row(t('employeeOverview.contracts.signedIp'), contract.confirmedIp ?? '—')}
                {row(t('employeeOverview.contracts.paymentMethod'), contract.paymentMethodName ?? '—')}
              </>
            )}
          </div>
        </div>
      </Modal>
      {pdfOpen && (
        <PayslipPreviewModal
          open={pdfOpen}
          onClose={() => setPdfOpen(false)}
          fetchPdf={() => api.getContractPdfById(token, employeeId, contract.id)}
          title={t('employeeOverview.payslipModal.contractTitle')}
          downloadFilename="contract.pdf"
          helperText={t('employeeOverview.payslipModal.contractHelperText')}
        />
      )}
    </>
  );
}
