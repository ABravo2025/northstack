import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LegalDocumentModal from './LegalDocumentModal';

// Links to legal documents. Readable on all three backgrounds they appear on: the light app, the
// dark app, and the always-navy auth panel (.auth-left), where the brand violet was hard to see.
export const LEGAL_LINK_CLASS =
  'text-accent underline underline-offset-2 hover:text-accent-hover dark:text-brand-blue-light dark:hover:text-brand-cream [.auth-left_&]:text-brand-blue-light [.auth-left_&]:hover:text-brand-cream';

interface AcceptTermsCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  error?: string | null;
}

// Shared by CompleteSignupPage, AcceptInvitePage, and ContractConfirmationPage — the three
// places someone accepts the Terms of Service / Privacy Policy while creating or confirming an
// account. Owns its own legalDoc modal state so callers don't each need to wire that up.
export default function AcceptTermsCheckbox({ checked, onChange, disabled, error }: AcceptTermsCheckboxProps) {
  const { t } = useTranslation('auth');
  const [legalDoc, setLegalDoc] = useState<'terms' | 'privacy' | null>(null);

  return (
    <div className="form-group">
      <label className="flex items-start gap-1.5 text-sm font-normal">
        <input
          type="checkbox"
          className="mt-0.5 w-auto"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          required
          disabled={disabled}
        />
        <span>
          {t('terms.agreeTo')}{' '}
          <button
            type="button"
            className={LEGAL_LINK_CLASS}
            onClick={() => setLegalDoc('terms')}
          >
            {t('terms.terms')}
          </button>{' '}
          {t('terms.and')}{' '}
          <button
            type="button"
            className={LEGAL_LINK_CLASS}
            onClick={() => setLegalDoc('privacy')}
          >
            {t('terms.privacy')}
          </button>
        </span>
      </label>
      {error && <div className="field-error">{error}</div>}
      {legalDoc && <LegalDocumentModal initialDoc={legalDoc} onClose={() => setLegalDoc(null)} />}
    </div>
  );
}
