import { useState } from 'react';
import type { FormError } from '../App';
import PasswordInput from '../components/PasswordInput';
import PasswordChecklist from '../components/PasswordChecklist';
import AuthLayout from '../components/AuthLayout';
import LegalDocumentModal from '../components/LegalDocumentModal';
import { COUNTRIES } from '../lib/countries';

const COMPANY_SIZE_OPTIONS = ['1-10', '11-50', '51-200', '201-500', '500+'];

const ACQUISITION_CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'organic', label: 'Organic search' },
  { value: 'paid_ads', label: 'Paid ads' },
  { value: 'referral', label: 'Referral' },
  { value: 'content', label: 'Content (blog, video, etc.)' },
  { value: 'outbound_sales', label: 'Outbound sales' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'other', label: 'Other' },
];

interface RegisterPageProps {
  onRegister: (data: {
    tenantName: string;
    ownerFirstName: string;
    ownerLastName: string;
    ownerEmail: string;
    ownerPassword: string;
    ownerPhone: string;
    acceptedTerms: boolean;
    companySize?: string;
    industry?: string;
    country?: string;
    acquisitionChannel?: string;
  }) => void;
  onSwitchToLogin: () => void;
  loading: boolean;
  error?: FormError | null;
}

export default function RegisterPage({
  onRegister,
  onSwitchToLogin,
  loading,
  error,
}: RegisterPageProps) {
  const [tenantName, setTenantName] = useState('');
  const [ownerFirstName, setOwnerFirstName] = useState('');
  const [ownerLastName, setOwnerLastName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('');
  const [acquisitionChannel, setAcquisitionChannel] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [legalDoc, setLegalDoc] = useState<'terms' | 'privacy' | null>(null);
  const [passwordMismatch, setPasswordMismatch] = useState(false);

  const fieldError = (name: string) => (error?.field === name ? error.message : null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ownerPassword !== confirmPassword) {
      setPasswordMismatch(true);
      return;
    }
    setPasswordMismatch(false);
    onRegister({
      tenantName,
      ownerFirstName,
      ownerLastName,
      ownerEmail,
      ownerPassword,
      ownerPhone,
      acceptedTerms,
      companySize: companySize || undefined,
      industry: industry.trim() || undefined,
      country: country || undefined,
      acquisitionChannel: acquisitionChannel || undefined,
    });
  };

  return (
    <AuthLayout>
      <h2 className="auth-title">Register your company</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="register-tenantName">Company Name</label>
          <input
            id="register-tenantName"
            type="text"
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            placeholder="My Company"
            required
            disabled={loading}
          />
          {fieldError('tenantName') && (
            <div className="field-error">{fieldError('tenantName')}</div>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="register-companySize">Company size (optional)</label>
          <select
            id="register-companySize"
            value={companySize}
            onChange={(e) => setCompanySize(e.target.value)}
            disabled={loading}
          >
            <option value="">-- select --</option>
            {COMPANY_SIZE_OPTIONS.map((band) => (
              <option key={band} value={band}>
                {band} employees
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="register-industry">Industry (optional)</label>
          <input
            id="register-industry"
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="e.g. Software, Retail, Healthcare"
            disabled={loading}
          />
        </div>
        <div className="form-group">
          <label htmlFor="register-country">Country (optional)</label>
          <select
            id="register-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            disabled={loading}
          >
            <option value="">-- select --</option>
            {COUNTRIES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="register-firstName">First Name</label>
          <input
            id="register-firstName"
            type="text"
            value={ownerFirstName}
            onChange={(e) => setOwnerFirstName(e.target.value)}
            placeholder="John"
            required
            disabled={loading}
          />
        </div>
        <div className="form-group">
          <label htmlFor="register-lastName">Last Name</label>
          <input
            id="register-lastName"
            type="text"
            value={ownerLastName}
            onChange={(e) => setOwnerLastName(e.target.value)}
            placeholder="Doe"
            required
            disabled={loading}
          />
        </div>
        <div className="form-group">
          <label htmlFor="register-email">Email</label>
          <input
            id="register-email"
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            placeholder="your@email.com"
            required
            disabled={loading}
          />
          {fieldError('ownerEmail') && (
            <div className="field-error">{fieldError('ownerEmail')}</div>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="register-phone">Phone</label>
          <input
            id="register-phone"
            type="tel"
            value={ownerPhone}
            onChange={(e) => setOwnerPhone(e.target.value)}
            placeholder="+1 555 0100"
            required
            disabled={loading}
          />
          {fieldError('ownerPhone') && (
            <div className="field-error">{fieldError('ownerPhone')}</div>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="register-acquisitionChannel">How did you hear about us? (optional)</label>
          <select
            id="register-acquisitionChannel"
            value={acquisitionChannel}
            onChange={(e) => setAcquisitionChannel(e.target.value)}
            disabled={loading}
          >
            <option value="">-- select --</option>
            {ACQUISITION_CHANNEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="register-password">Password</label>
          <PasswordInput
            id="register-password"
            value={ownerPassword}
            onChange={setOwnerPassword}
            placeholder="••••••••"
            required
            disabled={loading}
            autoComplete="new-password"
          />
          <PasswordChecklist password={ownerPassword} />
          {fieldError('ownerPassword') && (
            <div className="field-error">{fieldError('ownerPassword')}</div>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="register-confirmPassword">Confirm Password</label>
          <PasswordInput
            id="register-confirmPassword"
            value={confirmPassword}
            onChange={(value) => {
              setConfirmPassword(value);
              setPasswordMismatch(false);
            }}
            placeholder="••••••••"
            required
            disabled={loading}
            autoComplete="new-password"
          />
          {passwordMismatch && <div className="field-error">Passwords don't match.</div>}
        </div>
        <div className="form-group">
          <label className="flex items-start gap-1.5 text-sm font-normal">
            <input
              type="checkbox"
              className="mt-0.5 w-auto"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              required
              disabled={loading}
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
          {fieldError('acceptedTerms') && (
            <div className="field-error">{fieldError('acceptedTerms')}</div>
          )}
        </div>
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>
      <div className="auth-foot">
        <span>Already have an account?</span>
        <button type="button" onClick={onSwitchToLogin}>
          Login
        </button>
      </div>
      {legalDoc && <LegalDocumentModal initialDoc={legalDoc} onClose={() => setLegalDoc(null)} />}
    </AuthLayout>
  );
}
