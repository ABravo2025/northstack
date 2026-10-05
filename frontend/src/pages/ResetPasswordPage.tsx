import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../components/common/ToastProvider';
import PasswordInput from '../components/common/PasswordInput';
import PasswordChecklist from '../components/common/PasswordChecklist';
import RequiredMark from '../components/common/RequiredMark';

interface ResetPasswordPageProps {
  onReset: (token: string, user: any) => void;
}

export default function ResetPasswordPage({ onReset }: ResetPasswordPageProps) {
  const { t } = useTranslation('auth');
  const toast = useToast();
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(false);

  const [checking, setChecking] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!token) {
      setTokenError(t('reset.missingToken'));
      setChecking(false);
      return;
    }

    api
      .validateResetToken(token)
      .catch((err) => setTokenError((err as Error).message))
      .finally(() => setChecking(false));
  }, [token, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    try {
      const response = await api.resetPassword(token, password);
      const sessionToken = response.session?.token;
      if (!sessionToken) {
        throw new Error(t('common.sessionError'));
      }
      onReset(sessionToken, response.user);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="header">
        <img src="/logo-horizontal-light.svg" alt="Northstack" className="dark:hidden" />
        <img src="/logo-horizontal-dark.svg" alt="Northstack" className="hidden dark:block" />
      </div>
      <div className="container">
        <div className="card mx-auto mt-10 max-w-md">
          <h2 className="text-center">{t('reset.title')}</h2>

          {checking ? (
            <p className="text-center">{t('common.checkingLink')}</p>
          ) : tokenError ? (
            <>
              <div className="alert alert-error">{tokenError}</div>
              <p className="text-center text-sm mt-3">
                <Link to="/forgot-password">{t('reset.requestNew')}</Link>
              </p>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="reset-password">
                  {t('reset.newPassword')}
                  <RequiredMark />
                </label>
                <PasswordInput
                  id="reset-password"
                  value={password}
                  onChange={setPassword}
                  placeholder="••••••••"
                  required
                  disabled={loading}
                  autoComplete="new-password"
                />
                <PasswordChecklist password={password} />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? t('common.pleaseWait') : t('reset.submit')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
