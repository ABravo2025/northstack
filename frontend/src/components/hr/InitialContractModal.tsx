import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type PayFrequency } from '../../api';
import Modal from '../common/Modal';
import Field from '../common/Field';
import { useToast } from '../common/ToastProvider';
import { CURRENCY_CODES, currencyLabel } from '../../lib/currencies';

interface InitialContractModalProps {
  open: boolean;
  token: string;
  employee: { id: string; firstName: string; lastName: string; userId: string | null };
  targetType: 'contractor' | 'employee';
  onClose: () => void;
  // null when the contract was created but the Type change after it failed — the caller still has
  // to reload, or a retry would create (and send) a second contract.
  onDone: (updatedEmployee: any | null) => void;
}

// Switching a Profile to Contractor/Employee from the detail panel (2026-10-26): same initial
// contract as the Add form asks for — creating it is what sends the person their contract to sign
// (an invitation, or a "sign it in the app" email if they already have a login).
export default function InitialContractModal({ open, token, employee, targetType, onClose, onDone }: InitialContractModalProps) {
  const { t } = useTranslation('hr');
  const toast = useToast();
  const [payFrequencies, setPayFrequencies] = useState<PayFrequency[]>([]);
  const [assignableRoles, setAssignableRoles] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    compensationType: '',
    rateAmount: '',
    currency: 'USD',
    payFrequencyId: '',
    jobTitle: '',
    description: '',
    effectiveFrom: new Date().toISOString().slice(0, 10),
    note: '',
    inviteRoleId: '',
  });

  useEffect(() => {
    if (!open) return;
    api.listPayFrequencies(token).then(setPayFrequencies).catch(() => setPayFrequencies([]));
    // Only matters for an invitation (no login yet); listAssignableRoles fails for someone who
    // can't invite, which just leaves the server's default (Member).
    if (!employee.userId) {
      api.listAssignableRoles(token).then(setAssignableRoles).catch(() => setAssignableRoles([]));
    }
  }, [open, token, employee.userId]);

  const defaultRoleId = assignableRoles.find((r) => r.name === 'Member')?.id ?? assignableRoles[0]?.id ?? '';
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    let contractCreated = false;
    try {
      // Contract first: if it fails, the person stays a Profile instead of becoming a
      // Contractor/Employee with no contract.
      await api.createCompensation(token, {
        employeeId: employee.id,
        compensationType: form.compensationType as 'hourly' | 'fixed',
        rateCents: Math.round(Number.parseFloat(form.rateAmount) * 100),
        currency: form.currency.trim().toUpperCase(),
        payFrequencyId: form.payFrequencyId,
        jobTitle: form.jobTitle.trim(),
        description: form.description.trim(),
        effectiveFrom: form.effectiveFrom,
        note: form.note || undefined,
        inviteRoleId: employee.userId ? undefined : form.inviteRoleId || defaultRoleId || undefined,
      });
      contractCreated = true;
      const updated = await api.updateEmployee(token, employee.id, { personType: targetType } as any);
      toast.success(t(employee.userId ? 'employeeOverview.initialContract.sentToSignInApp' : 'employeeOverview.initialContract.sentInvitation'));
      onDone(updated);
    } catch (error) {
      toast.error((error as Error).message);
      if (contractCreated) onDone(null);
    } finally {
      setSaving(false);
    }
  };

  const typeLabel = t(`employees.personTypeOptions.${targetType}`);

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title={t('employeeOverview.initialContract.title', { type: typeLabel })}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="initial-contract-form" className="btn btn-primary" disabled={saving}>
            {saving ? t('employeeOverview.initialContract.saving') : t('employeeOverview.initialContract.submit')}
          </button>
        </div>
      }
    >
      <p className="text-sm text-ink-muted dark:text-dark-ink-muted mb-3">
        {t(employee.userId ? 'employeeOverview.initialContract.introSignInApp' : 'employeeOverview.initialContract.introInvitation', {
          name: `${employee.firstName} ${employee.lastName}`,
          type: typeLabel,
        })}
      </p>
      <form id="initial-contract-form" onSubmit={handleSubmit}>
        <div className="field-group-body">
          <Field label={t('employees.fields.compensationType')} required>
            <select className="overview-field-input" value={form.compensationType} onChange={(e) => set({ compensationType: e.target.value })} required>
              <option value="">{t('common.selectPlaceholder')}</option>
              <option value="hourly">{t('employees.compensationTypeOptions.hourly')}</option>
              <option value="fixed">{t('employees.compensationTypeOptions.fixed')}</option>
            </select>
          </Field>
          <Field label={t('employees.fields.rate', { currency: form.currency || 'USD' })} required>
            <input className="overview-field-input" type="number" step="0.01" min="0" value={form.rateAmount} onChange={(e) => set({ rateAmount: e.target.value })} required />
          </Field>
          <Field label={t('employees.fields.currency')} required>
            <select className="overview-field-input" value={form.currency} onChange={(e) => set({ currency: e.target.value })} required>
              <option value="">{t('common.selectPlaceholder')}</option>
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {currencyLabel(code)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('employees.fields.payFrequency')} required>
            <select className="overview-field-input" value={form.payFrequencyId} onChange={(e) => set({ payFrequencyId: e.target.value })} required>
              <option value="">{t('common.selectPlaceholder')}</option>
              {payFrequencies.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('employees.fields.contractJobTitle')} required>
            <input className="overview-field-input" type="text" value={form.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} required />
          </Field>
          <Field label={t('employees.fields.effectiveFrom')} required>
            <input className="overview-field-input" type="date" value={form.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} required />
          </Field>
          <Field label={t('employees.fields.roleDescription')} required full>
            <textarea className="overview-field-input" value={form.description} onChange={(e) => set({ description: e.target.value })} required />
          </Field>
          <Field label={t('employees.fields.note')} full>
            <input className="overview-field-input" type="text" value={form.note} onChange={(e) => set({ note: e.target.value })} />
          </Field>
          {assignableRoles.length > 0 && (
            <Field label={t('employees.fields.platformRole')}>
              <select className="overview-field-input" value={form.inviteRoleId || defaultRoleId} onChange={(e) => set({ inviteRoleId: e.target.value })}>
                {assignableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </form>
    </Modal>
  );
}
