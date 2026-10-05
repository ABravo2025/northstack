import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import PasswordInput from '../components/common/PasswordInput';
import AuthLayout from '../components/common/AuthLayout';
import RequiredMark from '../components/common/RequiredMark';

interface LoginPageProps {
  onLogin: (email: string, password: string) => void;
  onSwitchToRegister: () => void;
  onForgotPassword: () => void;
  loading: boolean;
}

export default function LoginPage({ onLogin, onSwitchToRegister, onForgotPassword, loading }: LoginPageProps) {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <AuthLayout>
      <h2 className="auth-title">{t('login.title')}</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="login-email">
            {t('fields.email')}
            <RequiredMark />
          </label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('fields.emailPlaceholder')}
            required
            disabled={loading}
          />
        </div>
        <div className="form-group">
          <label htmlFor="login-password">
            {t('fields.password')}
            <RequiredMark />
          </label>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            required
            disabled={loading}
            autoComplete="current-password"
          />
          <button type="button" className="auth-forgot-link" onClick={onForgotPassword}>
            {t('login.forgot')}
          </button>
        </div>
        <button type="submit" className="auth-submit" disabled={loading}>
          {loading ? t('login.submitting') : t('login.submit')}
        </button>
      </form>
      <div className="auth-foot">
        <span>{t('login.noAccount')}</span>
        <button type="button" onClick={onSwitchToRegister}>
          {t('login.register')}
        </button>
      </div>
    </AuthLayout>
  );
}
