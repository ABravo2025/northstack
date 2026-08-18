import { useState } from 'react';
import LegalDocumentModal from './LegalDocumentModal';

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
          I agree to the{' '}
          <button
            type="button"
            className="text-brand-blue underline underline-offset-2 hover:text-brand-navy dark:hover:text-brand-blue-light"
            onClick={() => setLegalDoc('terms')}
          >
            Terms of Service
          </button>{' '}
          and{' '}
          <button
            type="button"
            className="text-brand-blue underline underline-offset-2 hover:text-brand-navy dark:hover:text-brand-blue-light"
            onClick={() => setLegalDoc('privacy')}
          >
            Privacy Policy
          </button>
        </span>
      </label>
      {error && <div className="field-error">{error}</div>}
      {legalDoc && <LegalDocumentModal initialDoc={legalDoc} onClose={() => setLegalDoc(null)} />}
    </div>
  );
}
