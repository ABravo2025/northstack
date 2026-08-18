import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import type { ContractConfirmationDetails } from '../api/contractConfirmationPublic';
import { useToast } from '../components/common/ToastProvider';
import PasswordInput from '../components/common/PasswordInput';
import PasswordChecklist from '../components/common/PasswordChecklist';
import AcceptTermsCheckbox from '../components/common/AcceptTermsCheckbox';
import RequiredMark from '../components/common/RequiredMark';
import { formatMoney } from '../lib/currencies';
import { COUNTRIES } from '../lib/countries';

interface ContractConfirmationPageProps {
  onConfirmed: (token: string, user: any) => void;
}

const COMPENSATION_TYPE_LABELS: Record<string, string> = { hourly: 'Hourly', fixed: 'Fixed' };

export default function ContractConfirmationPage({ onConfirmed }: ContractConfirmationPageProps) {
  const toast = useToast();
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [details, setDetails] = useState<ContractConfirmationDetails | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [countryOfResidence, setCountryOfResidence] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [subType, setSubType] = useState<'iban' | 'ach'>('iban');
  const [ibanValue, setIbanValue] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [usernameValue, setUsernameValue] = useState('');
  const [acceptedContract, setAcceptedContract] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError('Missing token');
      setLoading(false);
      return;
    }
    api
      .getContractConfirmation(token)
      .then(setDetails)
      .catch((err) => setLoadError((err as Error).message))
      .finally(() => setLoading(false));
  }, [token]);

  const selectedMethod = details?.paymentMethods.find((m) => m.id === paymentMethodId);
  // "Wire transfer" is matched by name, not a dedicated flag — this is the
  // spec's own chosen mechanism (docs/spec-payroll.md Unidad 7): any other
  // payment method gets a single username/email field.
  const isWireTransfer = selectedMethod?.name === 'Wire transfer';

  const canSubmit =
    Boolean(phone.trim()) &&
    Boolean(password) &&
    Boolean(countryOfResidence) &&
    Boolean(paymentMethodId) &&
    (isWireTransfer
      ? subType === 'iban'
        ? Boolean(ibanValue.trim())
        : Boolean(routingNumber.trim()) && Boolean(accountNumber.trim())
      : Boolean(usernameValue.trim())) &&
    acceptedContract &&
    acceptedTerms;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !canSubmit) return;
    setSubmitting(true);
    try {
      const paymentAccountData = isWireTransfer
        ? subType === 'iban'
          ? ibanValue.trim()
          : JSON.stringify({ routingNumber: routingNumber.trim(), accountNumber: accountNumber.trim() })
        : usernameValue.trim();

      const response = await api.confirmContract(token, {
        phone,
        password,
        countryOfResidence,
        paymentMethodId,
        paymentAccountSubType: isWireTransfer ? subType : 'username',
        paymentAccountData,
        acceptedContract,
        acceptedTerms,
      });

      const sessionToken = response.session?.token;
      if (!sessionToken) {
        throw new Error('Could not start a session');
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
          <h2 className="text-center">Confirm your contract</h2>

          {loading ? (
            <p className="text-center">Loading contract…</p>
          ) : loadError || !details ? (
            <div className="alert alert-error">{loadError || 'Contract not found'}</div>
          ) : (
            <>
              <p className="text-center">
                {details.tenantName} has invited you to join as {details.employeeFirstName} {details.employeeLastName}.
                Review the contract below, complete your details, and confirm.
              </p>

              <div className="field-group">
                <h4 className="field-group-title">Contract</h4>
                <div className="field-group-body">
                  <div className="overview-field">
                    <span className="overview-field-label">Person</span>
                    {details.employeeFirstName} {details.employeeLastName}
                  </div>
                  <div className="overview-field">
                    <span className="overview-field-label">Job Title</span>
                    {details.jobTitle}
                  </div>
                  <div className="overview-field overview-field-full">
                    <span className="overview-field-label">Role Description</span>
                    {details.description}
                  </div>
                  <div className="overview-field">
                    <span className="overview-field-label">Compensation Type</span>
                    {COMPENSATION_TYPE_LABELS[details.compensationType] || details.compensationType}
                  </div>
                  <div className="overview-field">
                    <span className="overview-field-label">Amount</span>
                    {formatMoney(details.rateCents, details.currency)}
                  </div>
                  <div className="overview-field">
                    <span className="overview-field-label">Pay Frequency</span>
                    {details.payFrequencyName}
                  </div>
                  <div className="overview-field">
                    <span className="overview-field-label">Effective From</span>
                    {details.effectiveFrom.slice(0, 10)}
                  </div>
                  <div className="overview-field">
                    <span className="overview-field-label">Nationality</span>
                    {details.nationality || '-'}
                  </div>
                  <div className="overview-field overview-field-full">
                    <span className="overview-field-label">Time Off Policies</span>
                    {details.timeOffPolicyNames.length > 0 ? details.timeOffPolicyNames.join(', ') : '-'}
                  </div>
                </div>
              </div>

              <p className="text-sm text-ink-muted mt-3">
                At confirmation, we record your acceptance with date, time, and IP address — this contract is frozen
                exactly as you see it here.
              </p>

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="confirm-email">Email</label>
                  <input id="confirm-email" type="email" value={details.email} disabled />
                </div>
                <div className="form-group">
                  <label htmlFor="confirm-phone">
                    Phone
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
                    Password
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
                <div className="form-group">
                  <label htmlFor="confirm-country">
                    Country of Residence
                    <RequiredMark />
                  </label>
                  <select
                    id="confirm-country"
                    value={countryOfResidence}
                    onChange={(e) => setCountryOfResidence(e.target.value)}
                    required
                    disabled={submitting}
                  >
                    <option value="">-- select --</option>
                    {COUNTRIES.map((country) => (
                      <option key={country} value={country}>
                        {country}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="confirm-payment-method">
                    Payment Method
                    <RequiredMark />
                  </label>
                  <select
                    id="confirm-payment-method"
                    value={paymentMethodId}
                    onChange={(e) => setPaymentMethodId(e.target.value)}
                    required
                    disabled={submitting}
                  >
                    <option value="">-- select --</option>
                    {details.paymentMethods.map((method) => (
                      <option key={method.id} value={method.id}>
                        {method.name}
                      </option>
                    ))}
                  </select>
                </div>

                {paymentMethodId && isWireTransfer && (
                  <>
                    <div className="form-group">
                      <label className="inline-flex items-center gap-2 mr-4">
                        <input
                          type="radio"
                          checked={subType === 'iban'}
                          onChange={() => setSubType('iban')}
                          disabled={submitting}
                        />
                        IBAN
                      </label>
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="radio"
                          checked={subType === 'ach'}
                          onChange={() => setSubType('ach')}
                          disabled={submitting}
                        />
                        ACH
                      </label>
                    </div>
                    {subType === 'iban' ? (
                      <div className="form-group">
                        <label htmlFor="confirm-iban">
                          IBAN
                          <RequiredMark />
                        </label>
                        <input
                          id="confirm-iban"
                          type="text"
                          value={ibanValue}
                          onChange={(e) => setIbanValue(e.target.value)}
                          required
                          disabled={submitting}
                        />
                      </div>
                    ) : (
                      <>
                        <div className="form-group">
                          <label htmlFor="confirm-routing">
                            Routing Number
                            <RequiredMark />
                          </label>
                          <input
                            id="confirm-routing"
                            type="text"
                            value={routingNumber}
                            onChange={(e) => setRoutingNumber(e.target.value)}
                            required
                            disabled={submitting}
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="confirm-account">
                            Account Number
                            <RequiredMark />
                          </label>
                          <input
                            id="confirm-account"
                            type="text"
                            value={accountNumber}
                            onChange={(e) => setAccountNumber(e.target.value)}
                            required
                            disabled={submitting}
                          />
                        </div>
                      </>
                    )}
                  </>
                )}

                {paymentMethodId && !isWireTransfer && (
                  <div className="form-group">
                    <label htmlFor="confirm-username">
                      Username / Email on {selectedMethod?.name}
                      <RequiredMark />
                    </label>
                    <input
                      id="confirm-username"
                      type="text"
                      value={usernameValue}
                      onChange={(e) => setUsernameValue(e.target.value)}
                      required
                      disabled={submitting}
                    />
                  </div>
                )}

                {paymentMethodId && (
                  <p className="text-xs text-ink-muted inline-flex items-center gap-1">
                    🔒 This data is stored with restricted access.
                  </p>
                )}

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
                    <span>I accept the contract as shown above.</span>
                  </label>
                </div>
                <AcceptTermsCheckbox checked={acceptedTerms} onChange={setAcceptedTerms} disabled={submitting} />

                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" disabled={submitting || !canSubmit}>
                    {submitting ? 'Confirming…' : 'Confirm Contract'}
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
