import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import type { ContractConfirmationDetails } from '../api/contractConfirmationPublic';
import { useToast } from '../components/common/ToastProvider';
import PasswordInput from '../components/common/PasswordInput';
import PasswordChecklist from '../components/common/PasswordChecklist';
import AcceptTermsCheckbox from '../components/common/AcceptTermsCheckbox';
import RequiredMark from '../components/common/RequiredMark';
import { ContractTermsBlock, usePaymentAccountForm } from '../components/payroll/ContractSigningFields';

interface ContractConfirmationPageProps {
  onConfirmed: (token: string, user: any) => void;
}


export default function ContractConfirmationPage({ onConfirmed }: ContractConfirmationPageProps) {
  const { t } = useTranslation('auth');
  const toast = useToast();
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [details, setDetails] = useState<ContractConfirmationDetails | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedContract, setAcceptedContract] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError(t('contract.missingToken'));
      setLoading(false);
      return;
    }
    api
      .getContractConfirmation(token)
      .then(setDetails)
      .catch((err) => setLoadError((err as Error).message))
      .finally(() => setLoading(false));
  }, [token, t]);

  const payment = usePaymentAccountForm(details?.paymentMethods ?? [], submitting, '', details?.taxId ?? null);

  const canSubmit = Boolean(phone.trim()) && Boolean(password) && payment.isComplete && acceptedContract && acceptedTerms;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !canSubmit) return;
    setSubmitting(true);
    try {
      const response = await api.confirmContract(token, {
        phone,
        password,
        ...payment.payload(),
        acceptedContract,
        acceptedTerms,
      });

      const sessionToken = response.session?.token;
      if (!sessionToken) {
        throw new Error(t('common.sessionError'));
      }
      onConfirmed(sessionToken, response.user);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="header">
        <img src="/logo-horizontal-light.svg" alt="Northstack" className="dark:hidden" />
        <img src="/logo-horizontal-dark.svg" alt="Northstack" className="hidden dark:block" />
      </div>
      <div className="container">
        <div className="card mx-auto mt-10 max-w-2xl">
          <h2 className="text-center">{t('contract.title')}</h2>

          {loading ? (
            <p className="text-center">{t('contract.loading')}</p>
          ) : loadError || !details ? (
            <div className="alert alert-error">{loadError || t('contract.notFound')}</div>
          ) : (
            <>
              <p className="text-center">
                {t('contract.intro', { company: details.tenantName, name: `${details.employeeFirstName} ${details.employeeLastName}` })}
              </p>

              <ContractTermsBlock details={details} />

              <p className="text-sm text-ink-muted dark:text-dark-ink-muted mt-3">
                {t('contract.frozenNotice')}
              </p>

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="confirm-email">{t('fields.email')}</label>
                  <input id="confirm-email" type="email" value={details.email} disabled />
                </div>
                <div className="form-group">
                  <label htmlFor="confirm-phone">
                    {t('fields.phone')}
                    <RequiredMark />
                  </label>
                  <input
                    id="confirm-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 555 0100"
                    required
                    disabled={submitting}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="confirm-password">
                    {t('fields.password')}
                    <RequiredMark />
                  </label>
                  <PasswordInput
                    id="confirm-password"
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    required
                    disabled={submitting}
                    autoComplete="new-password"
                  />
                  <PasswordChecklist password={password} />
                </div>
                {payment.fields}

                <div className="form-group">
                  <label className="flex items-start gap-1.5 text-sm font-normal">
                    <input
                      type="checkbox"
                      className="mt-0.5 w-auto"
                      checked={acceptedContract}
                      onChange={(e) => setAcceptedContract(e.target.checked)}
                      required
                      disabled={submitting}
                    />
                    <span>{t('contract.accept')}</span>
                  </label>
                </div>
                <AcceptTermsCheckbox checked={acceptedTerms} onChange={setAcceptedTerms} disabled={submitting} />

                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={submitting || !canSubmit}>
                    {submitting ? t('contract.confirming') : t('contract.confirm')}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
