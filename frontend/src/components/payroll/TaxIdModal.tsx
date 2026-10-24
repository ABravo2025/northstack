import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';
import { useToast } from '../common/ToastProvider';
import { api } from '../../api';
import { isTaxIdValid, type TaxIdKind } from '../../lib/taxId';

// Payroll v2 (2026-10-24): change a person's tax ID (CUIL / SSN / other) from Payroll → People.
// The current value is never shown — only its last 4 in the table — so this always types a new one.
export default function TaxIdModal({
  token,
  employeeId,
  name,
  kind,
  onClose,
  onSaved,
}: {
  token: string;
  employeeId: string;
  name: string;
  kind: TaxIdKind;
  onClose: () => void;
  onSaved: (masked: string) => void;
}) {
  const { t } = useTranslation('common');
  const toast = useToast();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const label = t(`taxId.label.${kind}`);
  const invalid = value.trim() !== '' && !isTaxIdValid(kind, value);

  const save = async () => {
    setSaving(true);
    try {
      const { taxIdMasked } = await api.setEmployeeTaxId(token, employeeId, value.trim());
      toast.success(t('taxId.saved', { label }));
      onSaved(taxIdMasked);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={t('taxId.editTitle', { label, name })}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('taxId.cancel')}
          </button>
          <button type="button" className="btn-primary" disabled={saving || !value.trim() || invalid} onClick={save}>
            {t('taxId.save')}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label htmlFor="tax-id-input">{label}</label>
        <input id="tax-id-input" value={value} onChange={(e) => setValue(e.target.value)} maxLength={30} autoComplete="off" autoFocus />
        <small className={invalid ? 'field-error' : 'text-ink-faint dark:text-dark-ink-faint'}>{invalid ? t(`taxId.invalid.${kind}`) : t(`taxId.hint.${kind}`)}</small>
      </div>
    </Modal>
  );
}
