import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/common/AuthLayout';
import PasswordInput from '../components/common/PasswordInput';
import PasswordChecklist from '../components/common/PasswordChecklist';
import LegalDocumentModal from '../components/common/LegalDocumentModal';
import RequiredMark from '../components/common/RequiredMark';
import { COUNTRIES } from '../lib/countries';
import { api, ApiError } from '../api';
import type { Tenant } from '../api';

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

const JOB_FUNCTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'founder_ceo', label: 'Founder / CEO' },
  { value: 'hr', label: 'HR' },
  { value: 'ops_finance', label: 'Operations / Finance' },
  { value: 'sales', label: 'Sales' },
  { value: 'other', label: 'Other' },
];

// Maps a field name the backend can reject (registerTenantWithOwner's `field` on error) back
// to the survey step it belongs to, so an error surfaced at final submit (Screen 3c) jumps
// the person back to whichever earlier step actually needs fixing, instead of leaving them
// stuck on Security with no visible explanation.
const FIELD_STEP: Record<string, SurveyStep> = {
  tenantName: 'company',
  companySize: 'company',
  industry: 'company',
  country: 'company',
  acquisitionChannel: 'company',
  ownerFirstName: 'you',
  ownerLastName: 'you',
  ownerPhone: 'you',
  jobFunction: 'you',
  ownerPassword: 'security',
  acceptedTerms: 'security',
};

type SurveyStep = 'company' | 'you' | 'security';

interface CompleteSignupPageProps {
  onRegistered: (token: string, user: any, tenant: Tenant) => void;
}

// Reached via /register/complete?token=... after clicking the link from
// sendSignupVerificationEmail (spec-tenant-signup.md). Verifies the token once on mount, then
// shows the 3-step survey (Company / You / Security) — nothing is persisted to the backend
// until the final submit on Security, same "no orphaned Tenant/User" discipline the rest of
// the app already follows for multi-step flows.
export default function CompleteSignupPage({ onRegistered }: CompleteSignupPageProps) {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [checking, setChecking] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  const [surveyStep, setSurveyStep] = useState<SurveyStep>('company');
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [legalDoc, setLegalDoc] = useState<'terms' | 'privacy' | null>(null);

  // 3a — Company
  const [tenantName, setTenantName] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('');
  const [acquisitionChannel, setAcquisitionChannel] = useState('');

  // 3b — You
  const [ownerFirstName, setOwnerFirstName] = useState('');
  const [ownerLastName, setOwnerLastName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [jobFunction, setJobFunction] = useState('');

  // 3c — Security
  const [ownerPassword, setOwnerPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenError('This link is missing a verification token.');
      setChecking(false);
      return;
    }

    api
      .verifySignup(token)
      .then((response) => setEmail(response.email))
      .catch((err) => setTokenError((err as Error).message))
      .finally(() => setChecking(false));
  }, [token]);

  const fieldErrorFor = (name: string) => (fieldError?.field === name ? fieldError.message : null);

  const goToStep = (step: SurveyStep) => (e: React.FormEvent) => {
    e.preventDefault();
    setSurveyStep(step);
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ownerPassword !== confirmPassword) {
      setPasswordMismatch(true);
      return;
    }
    setPasswordMismatch(false);
    setFieldError(null);
    setSubmitting(true);
    try {
      const response = await api.registerTenant({
        tenantName,
        ownerFirstName,
        ownerLastName,
        ownerEmail: email,
        ownerPassword,
        ownerPhone,
        acceptedTerms,
        companySize,
        industry,
        country,
        acquisitionChannel: acquisitionChannel || undefined,
        jobFunction: jobFunction || undefined,
        verificationToken: token!,
      });
      const sessionToken = response.session?.token;
      if (!sessionToken || !response.tenant) {
        throw new Error('Could not start a session');
      }
      onRegistered(sessionToken, response.user, response.tenant);
    } catch (err) {
      // Only jump to a specific step if that field actually has a step + renderer for it (e.g.
      // ownerEmail/verificationToken don't — there's no email input on this page). Anything
      // unmapped falls back to the top banner instead of silently landing with no message shown.
      const field = err instanceof ApiError ? err.field : undefined;
      const step = field ? FIELD_STEP[field] : undefined;
      if (field && step) {
        setFieldError({ field, message: (err as Error).message });
        setSurveyStep(step);
      } else {
        setFieldError({ field: '', message: (err as Error).message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <AuthLayout>
        <p className="text-center text-sm">Verifying your email…</p>
      </AuthLayout>
    );
  }

  if (tokenError) {
    return (
      <AuthLayout>
        <h2 className="auth-title">This link isn't valid</h2>
        <div className="alert alert-error">{tokenError}</div>
        <p className="text-sm mt-3">
          <Link to="/register">Start over</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h2 className="auth-title">
        {surveyStep === 'company' && 'Tell us about your company'}
        {surveyStep === 'you' && 'Tell us about you'}
        {surveyStep === 'security' && 'Secure your account'}
      </h2>
      <p className="text-xs text-ink-faint mb-3">
        Step {surveyStep === 'company' ? 1 : surveyStep === 'you' ? 2 : 3} of 3 — {email}
      </p>

      {fieldError && !fieldError.field && <div className="alert alert-error mb-3">{fieldError.message}</div>}

      {surveyStep === 'company' && (
        <form onSubmit={goToStep('you')}>
          <div className="form-group">
            <label htmlFor="signup-tenantName">
              Company Name
              <RequiredMark />
            </label>
            <input
              id="signup-tenantName"
              type="text"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              placeholder="My Company"
              required
            />
            {fieldErrorFor('tenantName') && <div className="field-error">{fieldErrorFor('tenantName')}</div>}
          </div>
          <div className="form-group">
            <label htmlFor="signup-industry">
              Industry
              <RequiredMark />
            </label>
            <input
              id="signup-industry"
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Software, Retail, Healthcare"
              required
            />
            {fieldErrorFor('industry') && <div className="field-error">{fieldErrorFor('industry')}</div>}
          </div>
          <div className="form-group">
            <label htmlFor="signup-companySize">
              Company size
              <RequiredMark />
            </label>
            <select
              id="signup-companySize"
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
              required
            >
              <option value="">-- select --</option>
              {COMPANY_SIZE_OPTIONS.map((band) => (
                <option key={band} value={band}>
                  {band} employees
                </option>
              ))}
            </select>
            {fieldErrorFor('companySize') && <div className="field-error">{fieldErrorFor('companySize')}</div>}
          </div>
          <div className="form-group">
            <label htmlFor="signup-country">
              Country
              <RequiredMark />
            </label>
            <select id="signup-country" value={country} onChange={(e) => setCountry(e.target.value)} required>
              <option value="">-- select --</option>
              {COUNTRIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {fieldErrorFor('country') && <div className="field-error">{fieldErrorFor('country')}</div>}
          </div>
          <div className="form-group">
            <label htmlFor="signup-acquisitionChannel">How did you hear about us? (optional)</label>
            <select
              id="signup-acquisitionChannel"
              value={acquisitionChannel}
              onChange={(e) => setAcquisitionChannel(e.target.value)}
            >
              <option value="">-- select --</option>
              {ACQUISITION_CHANNEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="auth-submit">
            Continue
          </button>
        </form>
      )}

      {surveyStep === 'you' && (
        <form onSubmit={goToStep('security')}>
          <div className="form-group">
            <label htmlFor="signup-firstName">
              First Name
              <RequiredMark />
            </label>
            <input
              id="signup-firstName"
              type="text"
              value={ownerFirstName}
              onChange={(e) => setOwnerFirstName(e.target.value)}
              placeholder="John"
              required
            />
            {fieldErrorFor('ownerFirstName') && <div className="field-error">{fieldErrorFor('ownerFirstName')}</div>}
          </div>
          <div className="form-group">
            <label htmlFor="signup-lastName">
              Last Name
              <RequiredMark />
            </label>
            <input
              id="signup-lastName"
              type="text"
              value={ownerLastName}
              onChange={(e) => setOwnerLastName(e.target.value)}
              placeholder="Doe"
              required
            />
            {fieldErrorFor('ownerLastName') && <div className="field-error">{fieldErrorFor('ownerLastName')}</div>}
          </div>
          <div className="form-group">
            <label htmlFor="signup-phone">
              Phone
              <RequiredMark />
            </label>
            <input
              id="signup-phone"
              type="tel"
              value={ownerPhone}
              onChange={(e) => setOwnerPhone(e.target.value)}
              placeholder="+1 555 0100"
              required
            />
            {fieldErrorFor('ownerPhone') && <div className="field-error">{fieldErrorFor('ownerPhone')}</div>}
          </div>
          <div className="form-group">
            <label htmlFor="signup-jobFunction">Your role (optional)</label>
            <select id="signup-jobFunction" value={jobFunction} onChange={(e) => setJobFunction(e.target.value)}>
              <option value="">-- select --</option>
              {JOB_FUNCTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setSurveyStep('company')}>
              Back
            </button>
            <button type="submit" className="auth-submit">
              Continue
            </button>
          </div>
        </form>
      )}

      {surveyStep === 'security' && (
        <form onSubmit={handleFinalSubmit}>
          <div className="form-group">
            <label htmlFor="signup-password">
              Password
              <RequiredMark />
            </label>
            <PasswordInput
              id="signup-password"
              value={ownerPassword}
              onChange={setOwnerPassword}
              placeholder="••••••••"
              required
              disabled={submitting}
              autoComplete="new-password"
            />
            <PasswordChecklist password={ownerPassword} />
            {fieldErrorFor('ownerPassword') && <div className="field-error">{fieldErrorFor('ownerPassword')}</div>}
          </div>
          <div className="form-group">
            <label htmlFor="signup-confirmPassword">
              Confirm Password
              <RequiredMark />
            </label>
            <PasswordInput
              id="signup-confirmPassword"
              value={confirmPassword}
              onChange={(value) => {
                setConfirmPassword(value);
                setPasswordMismatch(false);
              }}
              placeholder="••••••••"
              required
              disabled={submitting}
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
                disabled={submitting}
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
            {fieldErrorFor('acceptedTerms') && <div className="field-error">{fieldErrorFor('acceptedTerms')}</div>}
          </div>
          <div className="form-actions flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setSurveyStep('you')} disabled={submitting}>
              Back
            </button>
            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? 'Creating your account…' : 'Create account'}
            </button>
          </div>
        </form>
      )}

      {legalDoc && <LegalDocumentModal initialDoc={legalDoc} onClose={() => setLegalDoc(null)} />}
    </AuthLayout>
  );
}
