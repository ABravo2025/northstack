import { useEffect, useState } from 'react';
import AuthLayout from '../components/common/AuthLayout';
import RequiredMark from '../components/common/RequiredMark';
import { useToast } from '../components/common/ToastProvider';
import { api, ApiError } from '../api';

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
  const toast = useToast();
  const [step, setStep] = useState<'email' | 'sent'>('email');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

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
      await api.startSignup(email);
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
      await api.resendSignup(email);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success('Verification email sent again.');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'sent') {
    return (
      <AuthLayout>
        <h2 className="auth-title">Check your inbox</h2>
        <p className="text-sm mb-3">
          We sent a verification link to <strong>{email}</strong>. Click it to continue setting up your account. The
          link expires in 24 hours.
        </p>
        <button type="button" className="auth-submit" onClick={handleResend} disabled={loading || cooldown > 0}>
          {cooldown > 0 ? `Resend email (${cooldown}s)` : loading ? 'Sending…' : 'Resend email'}
        </button>
        <div className="auth-foot">
          <span>Wrong email?</span>
          <button type="button" onClick={() => setStep('email')}>
            Start over
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <h2 className="auth-title">Register your company</h2>
      <p className="text-sm mb-3">Enter your work email — we'll send you a link to verify it before you continue.</p>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="register-email">
            Work Email
            <RequiredMark />
          </label>
          <input
            id="register-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@company.com"
            required
            disabled={loading}
          />
          {emailError && <div className="field-error">{emailError}</div>}
        </div>
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? 'Sending…' : 'Continue'}
        </button>
      </form>
      <div className="auth-foot">
        <span>Already have an account?</span>
        <button type="button" onClick={onSwitchToLogin}>
          Login
        </button>
      </div>
    </AuthLayout>
  );
}
