import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AuthLayout from '../components/common/AuthLayout';
import RequiredMark from '../components/common/RequiredMark';
import { useToast } from '../components/common/ToastProvider';
import { api, ApiError } from '../api';
import { captureReferralCode } from '../lib/referralCode';

// spec-tenant-signup.md — Screen 2's cooldown before "Resend email" is clickable again.
const RESEND_COOLDOWN_SECONDS = 30;

interface RegisterPageProps {
  onSwitchToLogin: () => void;
}

// Screen 1 (email) + Screen 2 (check your inbox) of the verified signup flow
// (spec-tenant-signup.md). The rest of the old one-step form (company/owner details,
// password) now lives in CompleteSignupPage.tsx, reached only after the email link is
// clicked — this page's only job is collecting an email and getting a verification link sent.
export default function RegisterPage({ onSwitchToLogin }: RegisterPageProps) {
  const { t } = useTranslation('auth');
  const toast = useToast();
  const [step, setStep] = useState<'email' | 'sent'>('email');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  // Referral program: /register?ref=CODE (or one remembered from an earlier visit).
  const [referralCode] = useState(() => captureReferralCode());

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    // Depend on whether a cooldown is active, not its value — the functional updater below
    // self-terminates once it hits 0, so re-running this on every tick (old dep: [cooldown])
    // just tore the interval down and rebuilt it every second, making the countdown drift
    // slower than real time.
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cooldown > 0]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setLoading(true);
    try {
      await api.startSignup(email, referralCode);
      setStep('sent');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (error) {
      if (error instanceof ApiError && error.field === 'email') {
        setEmailError(error.message);
      } else {
        toast.error((error as Error).message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    setLoading(true);
    try {
      await api.resendSignup(email, referralCode);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success(t('register.resent'));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'sent') {
    return (
      <AuthLayout>
        <h2 className="auth-title">{t('register.sentTitle')}</h2>
        <p className="text-sm mb-3">
          {t('register.sentBefore')} <strong>{email}</strong>. {t('register.sentAfter')}
        </p>
        <button type="button" className="auth-submit" onClick={handleResend} disabled={loading || cooldown > 0}>
          {cooldown > 0 ? t('register.resendIn', { seconds: cooldown }) : loading ? t('common.sending') : t('register.resend')}
        </button>
        <div className="auth-foot">
          <span>{t('register.wrongEmail')}</span>
          <button type="button" onClick={() => setStep('email')}>
            {t('register.startOver')}
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h2 className="auth-title">{t('register.title')}</h2>
      <p className="text-sm mb-3">{t('register.intro')}</p>
      {referralCode && (
        <p className="mb-3 rounded-lg border border-brand-blue-light/25 bg-white/5 px-3 py-2 text-sm text-brand-cream">
          {t('register.referralBefore')} <strong>{referralCode}</strong>{t('register.referralAfter')}
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="register-email">
            {t('register.workEmail')}
            <RequiredMark />
          </label>
          <input
            id="register-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('register.workEmailPlaceholder')}
            required
            disabled={loading}
          />
          {emailError && <div className="field-error">{emailError}</div>}
        </div>
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? t('common.sending') : t('common.continue')}
        </button>
      </form>
      <div className="auth-foot">
        <span>{t('register.haveAccount')}</span>
        <button type="button" onClick={onSwitchToLogin}>
          {t('login.submit')}
        </button>
      </div>
    </AuthLayout>
  );
}
