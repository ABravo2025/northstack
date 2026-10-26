import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import RequiredMark from '../common/RequiredMark';
import { formatMoney } from '../../lib/currencies';
import { COUNTRIES } from '../../lib/countries';
import { isTaxIdValid, type TaxIdKind } from '../../lib/taxId';

// Shared by both ways of signing a first contract: the public invitation page
// (ContractConfirmationPage, no account yet) and My contract (MyContractPage, already logged in,
// 2026-10-26) — the terms shown and the payment details collected are the same in both.

export interface ContractTerms {
  employeeFirstName: string;
  employeeLastName: string;
  jobTitle: string;
  description: string;
  compensationType: string;
  rateCents: number;
  currency: string;
  payFrequencyName: string;
  effectiveFrom: string;
  nationality: string | null;
  timeOffPolicyNames: string[];
}

export function ContractTermsBlock({ details }: { details: ContractTerms }) {
  const { t } = useTranslation('auth');
  return (
    <div className="field-group">
      <h4 className="field-group-title">{t('contract.section')}</h4>
      <div className="field-group-body">
        <div className="overview-field">
          <span className="overview-field-label">{t('contract.person')}</span>
          {details.employeeFirstName} {details.employeeLastName}
        </div>
        <div className="overview-field">
          <span className="overview-field-label">{t('contract.jobTitle')}</span>
          {details.jobTitle}
        </div>
        <div className="overview-field overview-field-full">
          <span className="overview-field-label">{t('contract.roleDescription')}</span>
          {details.description}
        </div>
        <div className="overview-field">
          <span className="overview-field-label">{t('contract.compensationType')}</span>
          {t(`contract.compensation.${details.compensationType}`, { defaultValue: details.compensationType })}
        </div>
        <div className="overview-field">
          <span className="overview-field-label">{t('contract.amount')}</span>
          {formatMoney(details.rateCents, details.currency)}
        </div>
        <div className="overview-field">
          <span className="overview-field-label">{t('contract.payFrequency')}</span>
          {details.payFrequencyName}
        </div>
        <div className="overview-field">
          <span className="overview-field-label">{t('contract.effectiveFrom')}</span>
          {details.effectiveFrom.slice(0, 10)}
        </div>
        <div className="overview-field">
          <span className="overview-field-label">{t('contract.nationality')}</span>
          {details.nationality || '-'}
        </div>
        <div className="overview-field overview-field-full">
          <span className="overview-field-label">{t('contract.timeOffPolicies')}</span>
          {details.timeOffPolicyNames.length > 0 ? details.timeOffPolicyNames.join(', ') : '-'}
        </div>
      </div>
    </div>
  );
}

export interface SigningPaymentMethod {
  id: string;
  name: string;
  // Optional: an older backend doesn't send them (see `asks` below).
  kind?: string;
  asks?: string;
}

export interface SigningTaxIdAsk {
  kind: TaxIdKind;
  required: boolean;
}

// Country of residence + payment method + the account detail that method asks for, plus the
// person's own tax ID when it's asked (Payroll v2: when whoever added them didn't fill it in).
// `fields` is the rendered inputs, `isComplete` gates submit, `payload()` is what the API takes.
export function usePaymentAccountForm(
  paymentMethods: SigningPaymentMethod[],
  disabled: boolean,
  initialCountry = '',
  taxAsk: SigningTaxIdAsk | null = null,
) {
  const { t } = useTranslation('auth');
  const [countryOfResidence, setCountryOfResidence] = useState(initialCountry);
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [subType, setSubType] = useState<'iban' | 'ach'>('iban');
  const [ibanValue, setIbanValue] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [usernameValue, setUsernameValue] = useState('');
  const [taxId, setTaxId] = useState('');

  const selectedMethod = paymentMethods.find((m) => m.id === paymentMethodId);
  // "Wire transfer" is matched by name, not a dedicated flag — this is the
  // spec's own chosen mechanism (docs/spec-payroll.md Unidad 7): any other
  // payment method gets a single username/email field.
  // Payroll v2: the method's `asks` decides the field (older backends: by name, as before).
  const asks = selectedMethod?.asks ?? (selectedMethod?.name === 'Wire transfer' ? 'iban_ach' : 'text');
  const isWireTransfer = asks === 'iban_ach';
  const asksNothing = asks === 'none';

  const taxIdInvalid = Boolean(taxAsk && taxId.trim() && !isTaxIdValid(taxAsk.kind, taxId));
  const taxIdOk = !taxAsk || (!taxIdInvalid && (!taxAsk.required || Boolean(taxId.trim())));

  const isComplete =
    taxIdOk &&
    Boolean(countryOfResidence) &&
    Boolean(paymentMethodId) &&
    (isWireTransfer
      ? subType === 'iban'
        ? Boolean(ibanValue.trim())
        : Boolean(routingNumber.trim()) && Boolean(accountNumber.trim())
      : asksNothing || Boolean(usernameValue.trim()));

  const payload = () => ({
    countryOfResidence,
    paymentMethodId,
    paymentAccountSubType: (isWireTransfer ? subType : 'username') as 'iban' | 'ach' | 'username',
    paymentAccountData: isWireTransfer
      ? subType === 'iban'
        ? ibanValue.trim()
        : JSON.stringify({ routingNumber: routingNumber.trim(), accountNumber: accountNumber.trim() })
      : asksNothing
        ? '-'
        : usernameValue.trim(),
    taxId: taxAsk && taxId.trim() ? taxId.trim() : undefined,
  });

  const fields = (
    <>
      <div className="form-group">
        <label htmlFor="confirm-country">
          {t('contract.countryOfResidence')}
          <RequiredMark />
        </label>
        <select
          id="confirm-country"
          value={countryOfResidence}
          onChange={(e) => setCountryOfResidence(e.target.value)}
          required
          disabled={disabled}
        >
          <option value="">{t('common.select')}</option>
          {COUNTRIES.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="confirm-payment-method">
          {t('contract.paymentMethod')}
          <RequiredMark />
        </label>
        <select
          id="confirm-payment-method"
          value={paymentMethodId}
          onChange={(e) => setPaymentMethodId(e.target.value)}
          required
          disabled={disabled}
        >
          <option value="">{t('common.select')}</option>
          {paymentMethods.map((method) => (
            <option key={method.id} value={method.id}>
              {method.kind && method.kind !== 'other' ? t(`contract.methodKinds.${method.kind}`, { defaultValue: method.name }) : method.name}
            </option>
          ))}
        </select>
      </div>

      {paymentMethodId && isWireTransfer && (
        <>
          <div className="form-group">
            <label className="inline-flex items-center gap-2 mr-4">
              <input type="radio" checked={subType === 'iban'} onChange={() => setSubType('iban')} disabled={disabled} />
              IBAN
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" checked={subType === 'ach'} onChange={() => setSubType('ach')} disabled={disabled} />
              ACH
            </label>
          </div>
          {subType === 'iban' ? (
            <div className="form-group">
              <label htmlFor="confirm-iban">
                IBAN
                <RequiredMark />
              </label>
              <input id="confirm-iban" type="text" value={ibanValue} onChange={(e) => setIbanValue(e.target.value)} required disabled={disabled} />
            </div>
          ) : (
            <>
              <div className="form-group">
                <label htmlFor="confirm-routing">
                  {t('contract.routingNumber')}
                  <RequiredMark />
                </label>
                <input id="confirm-routing" type="text" value={routingNumber} onChange={(e) => setRoutingNumber(e.target.value)} required disabled={disabled} />
              </div>
              <div className="form-group">
                <label htmlFor="confirm-account">
                  {t('contract.accountNumber')}
                  <RequiredMark />
                </label>
                <input id="confirm-account" type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} required disabled={disabled} />
              </div>
            </>
          )}
        </>
      )}

      {paymentMethodId && !isWireTransfer && !asksNothing && (
        <div className="form-group">
          <label htmlFor="confirm-username">
            {asks === 'text' ? t('contract.usernameOn', { method: selectedMethod?.name ?? '' }) : t(`contract.asks.${asks}`)}
            <RequiredMark />
          </label>
          <input id="confirm-username" type="text" value={usernameValue} onChange={(e) => setUsernameValue(e.target.value)} required disabled={disabled} />
        </div>
      )}

      {taxAsk && (
        <div className="form-group">
          <label htmlFor="confirm-taxId">
            {t(`common:taxId.label.${taxAsk.kind}`)}
            {taxAsk.required && <RequiredMark />}
          </label>
          <input
            id="confirm-taxId"
            type="text"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            maxLength={30}
            autoComplete="off"
            aria-invalid={taxIdInvalid || undefined}
            required={taxAsk.required}
            disabled={disabled}
          />
          <small className={taxIdInvalid ? 'field-error' : 'text-ink-faint dark:text-dark-ink-faint'}>
            {taxIdInvalid ? t(`common:taxId.invalid.${taxAsk.kind}`) : t(`common:taxId.hint.${taxAsk.kind}`)}
          </small>
        </div>
      )}

      {paymentMethodId && (
        <p className="text-xs text-ink-muted dark:text-dark-ink-muted inline-flex items-center gap-1">
          🔒 {t('contract.restricted')}
        </p>
      )}
    </>
  );

  return { fields, isComplete, payload };
}
