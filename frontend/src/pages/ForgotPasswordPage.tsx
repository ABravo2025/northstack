import { useState } from 'react';
import { api } from '../api';
import AuthLayout from '../components/common/AuthLayout';
import RequiredMark from '../components/common/RequiredMark';
import { useToast } from '../components/common/ToastProvider';

interface ForgotPasswordPageProps {
  onBackToLogin: () => void;
}

export default function ForgotPasswordPage({ onBackToLogin }: ForgotPasswordPageProps) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.forgotPassword(email);
      // Always shown, whether or not the email matched an account — the
      // backend response is deliberately identical either way.
      setSent(true);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h2 className="auth-title">Reset your password</h2>
      {sent ? (
        <p className="text-sm">
          If an account exists for <strong>{email}</strong>, we've sent a link to reset your password. Check your
          inbox — the link expires in 1 hour.
        </p>
      ) : (
        <>
          <p className="text-sm mb-3">Enter your email and we'll send you a link to set a new password.</p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="forgot-email">
                Email
                <RequiredMark />
              </label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        </>
      )}
      <div className="auth-foot">
        <span>Remembered your password?</span>
        <button type="button" onClick={onBackToLogin}>
          Back to login
        </button>
      </div>
    </AuthLayout>
  );
}
