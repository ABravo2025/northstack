import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import AuthLayout from '../components/common/AuthLayout';
import RequiredMark from '../components/common/RequiredMark';
import { useToast } from '../components/common/ToastProvider';

interface ForgotPasswordPageProps {
  onBackToLogin: () => void;
}

export default function ForgotPasswordPage({ onBackToLogin }: ForgotPasswordPageProps) {
  const { t } = useTranslation('auth');
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
      <h2 className="auth-title">{t('forgot.title')}</h2>
      {sent ? (
        <p className="text-sm">
          {t('forgot.sentBefore')} <strong>{email}</strong>{t('forgot.sentAfter')}
        </p>
      ) : (
        <>
          <p className="text-sm mb-3">{t('forgot.intro')}</p>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="forgot-email">
                {t('fields.email')}
                <RequiredMark />
              </label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('fields.emailPlaceholder')}
                required
                disabled={loading}
              />
            </div>
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? t('common.sending') : t('forgot.submit')}
            </button>
          </form>
        </>
      )}
      <div className="auth-foot">
        <span>{t('forgot.remembered')}</span>
        <button type="button" onClick={onBackToLogin}>
          {t('forgot.backToLogin')}
        </button>
      </div>
    </AuthLayout>
  );
}
