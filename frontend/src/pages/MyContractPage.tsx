import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { MyPendingContract } from '../api';
import { useToast } from '../components/common/ToastProvider';
import { ContractTermsBlock, usePaymentAccountForm } from '../components/payroll/ContractSigningFields';

// My contract (2026-10-26): a first contract for someone who already has a Northstack login (e.g. a
// Profile switched to Contractor/Employee) — no invitation can reach them, so they sign it here,
// logged in. Same terms and payment details as the public /confirm-contract page, minus creating
// the account. AppLayout's banner links here while there's something to sign.
export default function MyContractPage({ token }: { token: string }) {
  const { t } = useTranslation('auth');
  const toast = useToast();
  const [contract, setContract] = useState<MyPendingContract | null | undefined>(undefined);

  useEffect(() => {
    api
      .getMyPendingContract(token)
      .then(setContract)
      .catch((err) => {
        setContract(null);
        toast.error((err as Error).message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="container">
      <div className="card mx-auto mt-6 max-w-2xl">
        <h2 className="text-center">{t('contract.title')}</h2>

        {contract === undefined ? (
          <p className="text-center">{t('contract.loading')}</p>
        ) : contract === null ? (
          <p className="text-center text-ink-muted dark:text-dark-ink-muted">{t('contract.nothingToSign')}</p>
        ) : (
          <MyContractForm token={token} contract={contract} />
        )}
      </div>
    </div>
  );
}

// Mounted only once the contract is loaded, so the form starts from its saved country of residence.
function MyContractForm({ token, contract }: { token: string; contract: MyPendingContract }) {
  const { t } = useTranslation('auth');
  const toast = useToast();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [acceptedContract, setAcceptedContract] = useState(false);
  const payment = usePaymentAccountForm(contract.paymentMethods, submitting, contract.countryOfResidence ?? '', contract.taxId);
  const canSubmit = payment.isComplete && acceptedContract;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api.confirmMyContract(token, { compensationId: contract.compensationId, ...payment.payload(), acceptedContract });
      toast.success(t('contract.signedToast'));
      navigate('/', { replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <p className="text-center">{t('contract.myIntro', { company: contract.tenantName })}</p>
      <ContractTermsBlock details={contract} />
      <p className="text-sm text-ink-muted dark:text-dark-ink-muted mt-3">{t('contract.frozenNotice')}</p>

      <form onSubmit={handleSubmit}>
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
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting || !canSubmit}>
            {submitting ? t('contract.confirming') : t('contract.confirm')}
          </button>
        </div>
      </form>
    </>
  );
}
