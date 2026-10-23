import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { PayslipSettingsView } from '../../api';
import { useToast } from '../common/ToastProvider';

// Settings → Payroll → Payslip (spec-payroll-v2.md, unit 5): numbering prefix ("0001-000248"), who
// signs and the signature image printed on every payslip. The layout follows the company's country
// (Argentina, or the US pay stub for everyone else).
const MAX_BYTES = 300_000;

export default function PayslipSettingsCard({ token }: { token: string }) {
  const { t } = useTranslation('hr');
  const toast = useToast();
  const [view, setView] = useState<PayslipSettingsView | null>(null);
  const [prefix, setPrefix] = useState('1');
  const [signerName, setSignerName] = useState('');
  const [signature, setSignature] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .getPayslipSettings(token)
      .then((v) => {
        setView(v);
        setPrefix(String(v.prefix));
        setSignerName(v.signerName ?? '');
      })
      .catch(() => setView(null));
  }, [token]);

  if (!view) return null;
  const shownSignature = signature === undefined ? view.signature : signature;

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) return toast.error(t('payroll.payslipSettings.badType'));
    if (file.size > MAX_BYTES) return toast.error(t('payroll.payslipSettings.tooBig'));
    const reader = new FileReader();
    reader.onload = () => setSignature(String(reader.result));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.savePayslipSettings(token, { prefix: Number(prefix), signerName: signerName.trim() || null, ...(signature !== undefined ? { signature } : {}) });
      const v = await api.getPayslipSettings(token);
      setView(v);
      setSignature(undefined);
      toast.success(t('payroll.payslipSettings.saved'));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card mt-6" id="payslip">
      <h3 className="card-title mb-1">{t('payroll.payslipSettings.title')}</h3>
      <p className="mb-3 text-sm text-ink-muted dark:text-dark-ink-muted">{t(`payroll.payslipSettings.lead.${view.layout}`)}</p>
      <div className="flex flex-wrap gap-4">
        <div className="form-group !mb-0">
          <label htmlFor="payslip-prefix">{t('payroll.payslipSettings.prefix')}</label>
          <input id="payslip-prefix" type="number" min={1} max={9999} className="!w-28" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </div>
        <div className="form-group !mb-0">
          <span className="block text-sm font-medium">{t('payroll.payslipSettings.next')}</span>
          <span className="mt-2 block font-mono text-sm">{`${String(Number(prefix) || 1).padStart(4, '0')}-${String(view.nextNumber).padStart(6, '0')}`}</span>
        </div>
        <div className="form-group !mb-0 min-w-[14rem] flex-1">
          <label htmlFor="payslip-signer">{t('payroll.payslipSettings.signer')}</label>
          <input id="payslip-signer" value={signerName} maxLength={80} placeholder={t('payroll.payslipSettings.signerPlaceholder')} onChange={(e) => setSignerName(e.target.value)} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t('payroll.payslipSettings.signature')}</span>
          <div className="grid h-16 w-52 place-items-center rounded-lg border border-dashed border-line bg-white dark:border-dark-line">
            {shownSignature ? <img src={shownSignature} alt={t('payroll.payslipSettings.signature')} className="max-h-14 max-w-48 object-contain" /> : <span className="text-xs text-ink-faint">{t('payroll.payslipSettings.noSignature')}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <label className="btn-secondary cursor-pointer" htmlFor="payslip-signature-file">
            {t('payroll.payslipSettings.upload')}
            <input id="payslip-signature-file" type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {shownSignature && (
            <button type="button" className="btn-secondary" onClick={() => setSignature(null)}>
              {t('payroll.payslipSettings.remove')}
            </button>
          )}
        </div>
      </div>
      <div className="mt-4">
        <button type="button" className="btn-primary" disabled={busy} onClick={save}>
          {busy ? t('payroll.overtime.saving') : t('payroll.overtime.save')}
        </button>
      </div>
    </div>
  );
}
