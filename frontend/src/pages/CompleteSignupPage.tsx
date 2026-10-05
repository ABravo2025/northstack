import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/common/AuthLayout';
import PasswordInput from '../components/common/PasswordInput';
import PasswordChecklist from '../components/common/PasswordChecklist';
import AcceptTermsCheckbox from '../components/common/AcceptTermsCheckbox';
import RequiredMark from '../components/common/RequiredMark';
import { COUNTRIES } from '../lib/countries';
import { COMPANY_SIZE_OPTIONS } from '../lib/companySize';
import { api, ApiError } from '../api';
import type { Tenant } from '../api';
import { captureReferralCode, forgetReferralCode } from '../lib/referralCode';

// Labels: auth.json → signup.channels.* / signup.jobFunctions.*
const ACQUISITION_CHANNEL_OPTIONS = ['organic', 'paid_ads', 'referral', 'content', 'outbound_sales', 'partnership', 'other'];
const JOB_FUNCTION_OPTIONS = ['founder_ceo', 'hr', 'ops_finance', 'sales', 'other'];

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
  referralCode: 'company',
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
  const { t } = useTranslation('auth');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [checking, setChecking] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  const [surveyStep, setSurveyStep] = useState<SurveyStep>('company');
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);

  // 3a — Company
  const [tenantName, setTenantName] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('');
  const [acquisitionChannel, setAcquisitionChannel] = useState('');
  // Referral program: from the email link's &ref= (or this browser's remembered code), editable.
  const [referralCode, setReferralCode] = useState(() => captureReferralCode() ?? '');

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
      setTokenError(t('signup.missingToken'));
      setChecking(false);
      return;
    }

    api
      .verifySignup(token)
      .then((response) => setEmail(response.email))
      .catch((err) => setTokenError((err as Error).message))
      .finally(() => setChecking(false));
  }, [token, t]);

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
        referralCode: referralCode.trim() || undefined,
      });
      const sessionToken = response.session?.token;
      if (!sessionToken || !response.tenant) {
        throw new Error(t('common.sessionError'));
      }
      forgetReferralCode();
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
        <p className="text-center text-sm">{t('signup.verifying')}</p>
      </AuthLayout>
    );
  }

  if (tokenError) {
    return (
      <AuthLayout>
        <h2 className="auth-title">{t('signup.invalidLink')}</h2>
        <div className="alert alert-error">{tokenError}</div>
        <p className="text-sm mt-3">
          <Link to="/register">{t('register.startOver')}</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h2 className="auth-title">
        {surveyStep === 'company' && t('signup.companyTitle')}
        {surveyStep === 'you' && t('signup.youTitle')}
        {surveyStep === 'security' && t('signup.securityTitle')}
      </h2>
      <p className="text-xs text-ink-faint mb-3">
        {t('signup.step', { n: surveyStep === 'company' ? 1 : surveyStep === 'you' ? 2 : 3 })} — {email}
      </p>

      {fieldError && !fieldError.field && <div className="alert alert-error mb-3">{fieldError.message}</div>}

      {surveyStep === 'company' && (
        <form onSubmit={goToStep('you')}>
          <div className="form-group">
            <label htmlFor="signup-tenantName">
              {t('signup.companyName')}
              <RequiredMark />
            </label>
            <input
              id="signup-tenantName"
              type="text"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              placeholder={t('signup.companyNamePlaceholder')}
              required
            />
            {fieldErrorFor('tenantName') && <div className="field-error">{fieldErrorFor('tenantName')}</div>}
          </div>
          <div className="form-group">
            <label htmlFor="signup-industry">
              {t('signup.industry')}
              <RequiredMark />
            </label>
            <input
              id="signup-industry"
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder={t('signup.industryPlaceholder')}
              required
            />
            {fieldErrorFor('industry') && <div className="field-error">{fieldErrorFor('industry')}</div>}
          </div>
          <div className="form-group">
            <label htmlFor="signup-companySize">
              {t('signup.companySize')}
              <RequiredMark />
            </label>
            <select
              id="signup-companySize"
              value={companySize}
              onChange={(e) => setCompanySize(e.target.value)}
              required
            >
              <option value="">{t('common.select')}</option>
              {COMPANY_SIZE_OPTIONS.map((band) => (
                <option key={band} value={band}>
                  {t('signup.employees', { band })}
                </option>
              ))}
            </select>
            {fieldErrorFor('companySize') && <div className="field-error">{fieldErrorFor('companySize')}</div>}
          </div>
          <div className="form-group">
            <label htmlFor="signup-country">
              {t('signup.country')}
              <RequiredMark />
            </label>
            <select id="signup-country" value={country} onChange={(e) => setCountry(e.target.value)} required>
              <option value="">{t('common.select')}</option>
              {COUNTRIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            {fieldErrorFor('country') && <div className="field-error">{fieldErrorFor('country')}</div>}
          </div>
          <div className="form-group">
            <label htmlFor="signup-acquisitionChannel">{t('signup.heardFrom')}</label>
            <select
              id="signup-acquisitionChannel"
              value={acquisitionChannel}
              onChange={(e) => setAcquisitionChannel(e.target.value)}
            >
              <option value="">{t('common.select')}</option>
              {ACQUISITION_CHANNEL_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {t(`signup.channels.${value}`)}
                </option>
              ))}
            </select>
            {fieldErrorFor('acquisitionChannel') && (
              <div className="field-error">{fieldErrorFor('acquisitionChannel')}</div>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="signup-referralCode">Referral code (optional)</label>
            <input
              id="signup-referralCode"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              placeholder="e.g. K7QM-4XPA"
              maxLength={20}
              autoComplete="off"
            />
            {referralCode.trim() && !fieldErrorFor('referralCode') && (
              <div className="mt-1 text-xs text-brand-blue-light/70">With a referral code your free trial is 30 days.</div>
            )}
            {fieldErrorFor('referralCode') && <div className="field-error">{fieldErrorFor('referralCode')}</div>}
          </div>
          <button type="submit" className="auth-submit">
            {t('common.continue')}
          </button>
        </form>
      )}

      {surveyStep === 'you' && (
        <form onSubmit={goToStep('security')}>
          <div className="form-group">
            <label htmlFor="signup-firstName">
              {t('fields.firstName')}
              <RequiredMark />
            </label>
            <input
              id="signup-firstName"
              type="text"
              value={ownerFirstName}
              onChange={(e) => setOwnerFirstName(e.target.value)}
              placeholder={t('signup.firstNamePlaceholder')}
              required
            />
            {fieldErrorFor('ownerFirstName') && <div className="field-error">{fieldErrorFor('ownerFirstName')}</div>}
          </div>
          <div className="form-group">
            <label htmlFor="signup-lastName">
              {t('fields.lastName')}
              <RequiredMark />
            </label>
            <input
              id="signup-lastName"
              type="text"
              value={ownerLastName}
              onChange={(e) => setOwnerLastName(e.target.value)}
              placeholder={t('signup.lastNamePlaceholder')}
              required
            />
            {fieldErrorFor('ownerLastName') && <div className="field-error">{fieldErrorFor('ownerLastName')}</div>}
          </div>
          <div className="form-group">
            <label htmlFor="signup-phone">
              {t('fields.phone')}
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
            <label htmlFor="signup-jobFunction">{t('signup.yourRole')}</label>
            <select id="signup-jobFunction" value={jobFunction} onChange={(e) => setJobFunction(e.target.value)}>
              <option value="">{t('common.select')}</option>
              {JOB_FUNCTION_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {t(`signup.jobFunctions.${value}`)}
                </option>
              ))}
            </select>
            {fieldErrorFor('jobFunction') && <div className="field-error">{fieldErrorFor('jobFunction')}</div>}
          </div>
          <div className="form-actions flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setSurveyStep('company')}>
              {t('common.back')}
            </button>
            <button type="submit" className="auth-submit">
              {t('common.continue')}
            </button>
          </div>
        </form>
      )}

      {surveyStep === 'security' && (
        <form onSubmit={handleFinalSubmit}>
          <div className="form-group">
            <label htmlFor="signup-password">
              {t('fields.password')}
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
              {t('signup.confirmPassword')}
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
            {passwordMismatch && <div className="field-error">{t('signup.passwordMismatch')}</div>}
          </div>
          <AcceptTermsCheckbox
            checked={acceptedTerms}
            onChange={setAcceptedTerms}
            disabled={submitting}
            error={fieldErrorFor('acceptedTerms')}
          />
          <div className="form-actions flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setSurveyStep('you')} disabled={submitting}>
              {t('common.back')}
            </button>
            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? t('signup.creating') : t('signup.create')}
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
